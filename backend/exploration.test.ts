import { env } from 'cloudflare:workers';
import { prepareLegacyPool, takeLegacy, unknownTraveller } from './test-fixtures';
import { beforeAll, expect, test } from 'vitest';
import worker from './worker';

let legacyPool;
beforeAll(async()=>{legacyPool=await prepareLegacyPool()});
async function traveller(){return takeLegacy(legacyPool)}
async function call(t,route,body=undefined){
  const response=await worker.fetch(new Request(`http://api/v1/${route}`,{
    method:body===undefined?'GET':'POST',headers:{Origin:'http://localhost:4175',...(t?{Authorization:`Bearer ${t.token}`} : {}),'Content-Type':'application/json','CF-Connecting-IP':t?.ip||'public-test'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  }),env);
  return {status:response.status,data:await response.json()};
}
const move=(t,revision,door=0)=>call(t,'advance',{requestId:crypto.randomUUID(),expectedRevision:revision,door});
const back=(t,revision)=>call(t,'retrace',{requestId:crypto.randomUUID(),expectedRevision:revision});
const discovery=p=>env.DB.prepare('SELECT * FROM discoveries WHERE canonical_path=?').bind(`g5:2,2,3:${p}`).first();

test('two travellers share discoveries but not histories; retracing and retries do not inflate counts',async()=>{
  const a=(await traveller()),b=(await traveller());
  const first=(await call(a,'travellers',{})).data;
  const second=(await call(b,'travellers',{})).data;
  expect(first.sharedDiscovery.isFirstDiscoverer).toBe(true);
  expect(second.sharedDiscovery).toMatchObject({isFirstDiscoverer:false,travellerCount:2});
  expect((await move(a,0)).status).toBe(200);
  const ownership=await discovery('0');
  expect((await call(b,'history')).data.visits).toHaveLength(1);
  const cmd={requestId:crypto.randomUUID(),expectedRevision:0,door:0};
  expect((await call(b,'advance',cmd)).status).toBe(200);
  expect((await call(b,'advance',cmd)).status).toBe(200);
  const shared=(await call(b,'journey')).data;
  expect(shared.sharedDiscovery).toMatchObject({isFirstDiscoverer:false,travellerCount:2});
  expect(shared.exploration).toEqual({totalLocations:2,uniqueTriples:2});
  expect((await back(b,1)).status).toBe(200);
  expect((await move(b,2)).status).toBe(200);
  expect(await discovery('0')).toEqual(ownership);
  const stats=await call(null,'exploration');
  expect(stats.status).toBe(200);
  expect(stats.data).toMatchObject({totalLocations:2,uniqueTriples:2,contributors:2,contributions:4});
  expect(stats.data.recentDiscoveries).toHaveLength(2);
  for(const secret of [a.token,b.token,first.travellerId,second.travellerId,'token_hash','first_traveller_id']){
    expect(JSON.stringify(stats.data)).not.toContain(secret);
  }
  expect((await call(null,'history')).status).toBe(401);
  expect((await call(null,'journey')).status).toBe(401);
});

test('different complete paths to an identical triple remain separate global locations',async()=>{
  const t=(await traveller());await call(t,'travellers',{});let rev=0;
  for(const d of [0,0,1])expect((await move(t,rev++,d)).status).toBe(200);
  for(let i=0;i<2;i++)expect((await back(t,rev++)).status).toBe(200);
  for(const d of [1,1])expect((await move(t,rev++,d)).status).toBe(200);
  const a=await discovery('001'),b=await discovery('011');
  expect([a.a,a.b,a.c]).toEqual([b.a,b.b,b.c]);
  expect(a.canonical_path).not.toBe(b.canonical_path);
  const stats=(await call(null,'exploration')).data;
  expect(stats.totalLocations).toBeGreaterThan(stats.uniqueTriples);
  expect(stats.totalLocations).toBe(await env.DB.prepare('SELECT count(*) AS n FROM discoveries').first('n'));
  expect(stats.uniqueTriples).toBe(await env.DB.prepare('SELECT count(*) AS n FROM (SELECT DISTINCT a,b,c FROM visits)').first('n'));
});

test('concurrent first arrivals have one permanent owner, and invalid requests cannot pollute the map',async()=>{
  const players=[(await traveller()),(await traveller())];
  for(const t of players){await call(t,'travellers',{});await move(t,0);await move(t,1)}
  const replies=await Promise.all(players.map(t=>move(t,2)));
  expect(replies.map(r=>r.status)).toEqual([200,200]);
  const states=await Promise.all(players.map(async t=>(await call(t,'journey')).data));
  expect(states.filter(s=>s.sharedDiscovery.isFirstDiscoverer)).toHaveLength(1);
  for(const s of states)expect(s.sharedDiscovery.travellerCount).toBe(2);
  const original=await discovery('000');
  const before=(await call(null,'exploration')).data;
  expect((await move(players[0],3,255)).status).toBe(400);
  expect((await call(players[0],'advance',{requestId:crypto.randomUUID(),expectedRevision:3,door:0,path:'FAKE'})).status).toBe(400);
  expect((await call(players[0],'exploration',{})).status).toBe(404);
  expect((await call(null,'exploration')).data).toEqual(before);
  await expect(env.DB.prepare("UPDATE discoveries SET first_discovered_at='changed' WHERE path='000'").run()).rejects.toThrow('immutable_discovery');
  await expect(env.DB.prepare("DELETE FROM discoveries WHERE path='000'").run()).rejects.toThrow('immutable_discovery');
  expect(await discovery('000')).toEqual(original);
});

test('failure after shared insertion rolls back global discovery, personal visit and command together',async()=>{
  const t=(await traveller());const id=(await call(t,'travellers',{})).data.travellerId;
  for(let rev=0;rev<3;rev++)expect((await move(t,rev)).status).toBe(200);
  const before=(await call(null,'exploration')).data;
  await env.DB.exec("CREATE TRIGGER test_shared_failure AFTER INSERT ON discoveries WHEN NEW.path='0000' BEGIN SELECT RAISE(ABORT,'simulated_shared_failure'); END;");
  const cmd={requestId:crypto.randomUUID(),expectedRevision:3,door:0};
  try{
    expect((await call(t,'advance',cmd)).status).toBe(503);
    expect(await discovery('0000')).toBeNull();
    expect((await call(t,'journey')).data).toMatchObject({revision:3,activePath:'000',historyCount:4});
    expect(await env.DB.prepare('SELECT count(*) AS n FROM commands WHERE traveller_id=? AND request_id=?').bind(id,cmd.requestId).first('n')).toBe(0);
    expect((await call(null,'exploration')).data).toEqual(before);
  }finally{await env.DB.exec('DROP TRIGGER test_shared_failure')}
  expect((await call(t,'advance',cmd)).status).toBe(200);
  expect((await call(t,'journey')).data.sharedDiscovery.isFirstDiscoverer).toBe(true);
});
