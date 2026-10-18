import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, expect, test } from 'vitest';
import worker from './worker';

beforeAll(async()=>{await applyD1Migrations(env.DB,env.TEST_MIGRATIONS)});
let address=0;
function traveller(){return {token:Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join(''),ip:`192.0.2.${++address}`}}
async function call(t,route,body=undefined,origin='http://localhost:4175'){
  const response=await worker.fetch(new Request(`http://api/v1/${route}`,{
    method:body===undefined?'GET':'POST',headers:{Origin:origin,Authorization:`Bearer ${t.token}`,'Content-Type':'application/json','CF-Connecting-IP':t.ip},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  }),env);
  return {status:response.status,data:await response.json(),response};
}
async function move(t,revision,door=0){return call(t,'advance',{requestId:crypto.randomUUID(),expectedRevision:revision,door})}
async function back(t,revision){return call(t,'retrace',{requestId:crypto.randomUUID(),expectedRevision:revision})}

test('create, enter, resume on another session, retrace without deleting history',async()=>{
  const t=traveller();expect((await call(t,'travellers',{})).data.activePath).toBe('ROOT');
  expect((await move(t,0)).data.activePath).toBe('0');
  const resumed=await call({...t},'journey');
  expect(resumed.data).toMatchObject({activePath:'0',revision:1,string:['ROOT','0'],historyCount:2,worldFloor:null});
  expect(resumed.data.visit.triple).toEqual([3,3,5]);
  expect((await back(t,1)).data.activePath).toBe('ROOT');
  expect((await call(t,'history')).data.visits).toHaveLength(2);
  expect((await call(t,'travellers',{})).data.historyCount).toBe(2);
  expect((await move(t,2)).status).toBe(200);
  expect((await call(t,'history')).data.visits).toHaveLength(2);
});

test('identical prime triples reached by different complete paths are distinct visits',async()=>{
  const t=traveller();await call(t,'travellers',{});let rev=0;
  for(const d of [0,0,1]){expect((await move(t,rev++,d)).status).toBe(200)}
  for(let i=0;i<2;i++)expect((await back(t,rev++)).status).toBe(200);
  for(const d of [1,1])expect((await move(t,rev++,d)).status).toBe(200);
  const visits=(await call(t,'history')).data.visits;
  const a=visits.find(v=>v.path==='001'),b=visits.find(v=>v.path==='011');
  expect(a.triple).toEqual(b.triple);expect(a.canonicalPath).not.toBe(b.canonicalPath);
});

test('invalid/negative/fractional doors and arbitrary triples cannot change state',async()=>{
  const t=traveller();await call(t,'travellers',{});
  for(const door of [-1,1,0.1,'0',null,256])expect((await move(t,0,door)).status).toBe(400);
  expect((await call(t,'advance',{requestId:crypto.randomUUID(),expectedRevision:0,door:0,triple:[3,3,5]})).status).toBe(400);
  expect((await back(t,0)).status).toBe(409);
  expect((await call(t,'journey')).data.revision).toBe(0);
});

test('identical concurrent requests apply once, including retry after later moves',async()=>{
  const t=traveller();await call(t,'travellers',{});
  const cmd={requestId:crypto.randomUUID(),expectedRevision:0,door:0};
  const replies=await Promise.all([call(t,'advance',cmd),call(t,'advance',cmd)]);
  expect(replies.map(x=>x.status)).toEqual([200,200]);expect(replies[0].data).toEqual(replies[1].data);
  await move(t,1);
  expect((await call(t,'advance',cmd)).data).toEqual(replies[0].data);
  expect((await call(t,'journey')).data.revision).toBe(2);
  expect((await call(t,'advance',{...cmd,door:1})).data.error).toBe('request_id_reused');
});

test('different concurrent commands use compare-and-swap; stale session cannot overwrite',async()=>{
  const t=traveller();await call(t,'travellers',{});await move(t,0);
  const replies=await Promise.all([move(t,1,0),move(t,1,1)]);
  expect(replies.map(r=>r.status).sort()).toEqual([200,409]);
  expect((await call(t,'journey')).data).toMatchObject({revision:2,historyCount:3});
  expect((await back(t,1)).status).toBe(409);
});

test('travellers isolated; no raw credentials in DB; untrusted origin rejected',async()=>{
  const a=traveller(),b=traveller();await call(a,'travellers',{});await call(b,'travellers',{});await move(a,0);
  expect((await call(b,'journey')).data.activePath).toBe('ROOT');
  expect((await call(b,'history')).data.visits).toHaveLength(1);
  expect((await call(traveller(),'journey')).status).toBe(401);
  const forbidden=await call(a,'journey',undefined,'https://evil.example');
  expect(forbidden.status).toBe(403);expect(forbidden.response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  const stored=await env.DB.prepare('SELECT * FROM travellers').all();
  expect(JSON.stringify(stored)).not.toContain(a.token);
});

test('immutable visits reject updates; migration reserved world remains empty',async()=>{
  const t=traveller(),created=await call(t,'travellers',{});
  await expect(env.DB.prepare('UPDATE visits SET a=99 WHERE traveller_id=?').bind(created.data.travellerId).run()).rejects.toThrow('immutable_visit');
  expect(await env.DB.prepare('SELECT count(*) AS n FROM world_occupancy').first('n')).toBe(0);
});

test('bounded request bodies and closed registration',async()=>{
  const t=traveller();
  expect((await call(t,'travellers',{padding:'a'.repeat(3000)})).status).toBe(413);
  const request=new Request('http://api/v1/travellers',{method:'POST',headers:{Origin:'http://localhost:4175',Authorization:`Bearer ${t.token}`,'Content-Type':'application/json'},body:'{}'});
  expect((await worker.fetch(request,{...env,REGISTRATION_ENABLED:'false'})).status).toBe(403);
});
