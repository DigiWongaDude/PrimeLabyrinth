import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {TARGET,SQL,MIGRATIONS,OperatorError,prepare,load,status,issue,reconcile,revoke,delivered,d1Client,digest} from '../tools/hosted-invitations/core.mjs';

const source='a'.repeat(40),credentials='offline-fixture-credential';
class MemoryStore {
  files=new Map(); safe=true; fail=null;
  async check(){if(!this.safe)throw new Error('unsafe_acl');}
  async create(name,text){
    await this.check();
    if(this.fail===name)throw new Error('ENOSPC');
    if(this.files.has(name))throw new Error('exists');
    this.files.set(name,text);
    if(this.fail==='after:'+name)throw new Error('crash_after_flush');
  }
  async read(name){if(!this.files.has(name))throw new Error('absent');return this.files.get(name);}
  async list(){return [...this.files.keys()];}
  async deleteToken(name){if(this.fail==='cleanup')throw new Error('cleanup_failed');this.files.delete(name);}
}
function fixture(){
  const store=new MemoryStore(),rows=new Map(),requests=[];
  const control={mode:null,metadata:{uuid:TARGET.database,name:TARGET.name},now:1700000000};
  const ok=result=>new Response(JSON.stringify({success:true,errors:[],result}),{status:200});
  const query=(results=[],changes=0)=>ok([{success:true,meta:{changes},results}]);
  async function fetcher(url,init){
    requests.push({url,init});
    assert.ok(url.startsWith(`https://api.cloudflare.com/client/v4/accounts/${TARGET.account}/d1/database/${TARGET.database}`));
    assert.equal(init.redirect,'error');
    if(init.method==='GET')return ok(control.metadata);
    const body=JSON.parse(init.body);
    assert.ok(Object.values(SQL).includes(body.sql));
    if(body.sql===SQL.migrations)return query(MIGRATIONS.map(name=>({name})));
    const [id,hash,ttl,reference]=body.params;
    if(body.sql===SQL.read)return query(rows.has(id)?[{...rows.get(id),server_now:control.now}]:[]);
    if(body.sql===SQL.insert){
      if(control.mode==='before')throw new Error(credentials);
      if(rows.has(id))return new Response(JSON.stringify({success:false,errors:[{message:hash}]}),{status:400});
      rows.set(id,{id,token_hash:hash,created_at:control.now,expires_at:control.now+Number(ttl),operator_reference:reference||null,revoked_at:null,redeemed:0});
      if(control.mode==='after')throw new Error(credentials);
      if(control.mode==='malformed')return ok([{success:true,results:[]}]);
      return query([],1);
    }
    if(body.sql===SQL.revoke){
      if(control.mode==='revoke-before')throw new Error(credentials);
      const row=rows.get(id);const changed=row&&row.revoked_at===null?1:0;
      if(changed)row.revoked_at=control.now;
      if(control.mode==='revoke-after')throw new Error(credentials);
      return query([],changed);
    }
    throw new Error('unrecognised_sql');
  }
  return {store,rows,requests,control,api:d1Client({fetcher,credential:credentials})};
}
const allowed={approve:async()=>true,preflight:async()=>true};
const newRecord=f=>prepare(f.store,{source,reference:'test-only'});

test('prepare persists CSPRNG token privately and never leaks it in summary or outbound SQL',async()=>{
  const f=fixture(),p=await newRecord(f),token=await f.store.read(`${p.id}.token`);
  assert.match(token,/^[0-9a-f]{64}$/);assert.equal(f.requests.length,0);
  assert.equal((await load(f.store,p.id)).digest,digest(token));
  assert.ok(!JSON.stringify(p).includes(token));
  const result=await issue(f.store,f.api,p.id,allowed);
  assert.equal(result.state,'ISSUED');
  assert.ok(!JSON.stringify(f.requests).includes(token));
  const insert=JSON.parse(f.requests.find(r=>r.init.body?.includes('INSERT INTO')).init.body);
  assert.deepEqual(insert.params,[p.id,digest(token),'172800','test-only']);
  assert.match(insert.sql,/unixepoch\(\)/);
});

for(const mode of ['after','before','malformed']){
  test(`INSERT ${mode}: durable WRITE_UNKNOWN, no blind retry, reconcile or explicit same-ID retry`,async()=>{
    const f=fixture(),p=await newRecord(f);f.control.mode=mode;
    await assert.rejects(issue(f.store,f.api,p.id,allowed),/d1_response_uncertain/);
    assert.equal((await load(f.store,p.id)).state,'WRITE_UNKNOWN');
    assert.ok(f.store.files.has(`${p.id}.token`));
    await assert.rejects(issue(f.store,f.api,p.id,allowed),/reconcile_required/);
    f.control.mode=null;
    if(mode==='before'){
      await assert.rejects(reconcile(f.store,f.api,p.id),/record_absent/);
      assert.equal((await issue(f.store,f.api,p.id,{...allowed,retry:true})).state,'ISSUED');
    }else assert.equal((await reconcile(f.store,f.api,p.id)).state,'ISSUED');
    assert.equal(f.rows.size,1);assert.ok(f.rows.has(p.id));
  });
}
test('duplicate UUID is reconciled; conflicting immutable data is never overwritten',async()=>{
  const f=fixture(),p=await newRecord(f);f.control.mode='after';
  await assert.rejects(issue(f.store,f.api,p.id,allowed));
  f.control.mode=null;
  await assert.rejects(issue(f.store,f.api,p.id,{...allowed,retry:true}),/reconcile_required/);
  f.rows.get(p.id).token_hash='b'.repeat(64);
  await assert.rejects(reconcile(f.store,f.api,p.id),/record_conflict/);
  await assert.rejects(revoke(f.store,f.api,p.id,allowed),/record_conflict/);
  assert.equal((await load(f.store,p.id)).state,'WRITE_UNKNOWN');
});
for(const mode of ['revoke-after','revoke-before']){
  test(`REVOKE ${mode}: persisted uncertainty and explicit reconciliation/retry`,async()=>{
    const f=fixture(),p=await newRecord(f);await issue(f.store,f.api,p.id,allowed);f.control.mode=mode;
    await assert.rejects(revoke(f.store,f.api,p.id,allowed),/d1_response_uncertain/);
    assert.equal((await load(f.store,p.id)).state,'REVOKE_UNKNOWN');
    assert.ok(f.store.files.has(`${p.id}.token`));f.control.mode=null;
    if(mode==='revoke-before'){
      await assert.rejects(reconcile(f.store,f.api,p.id),/revocation_unconfirmed/);
      assert.equal((await revoke(f.store,f.api,p.id,allowed)).state,'REVOKED');
    }else assert.equal((await reconcile(f.store,f.api,p.id)).state,'REVOKED');
    assert.ok(!f.store.files.has(`${p.id}.token`));
  });
}
for(const state of ['REVOKED','EXPIRED','REDEEMED']){
  test(`terminal ${state}: no extra mutation, plaintext removed, audit retained`,async()=>{
    const f=fixture(),p=await newRecord(f);await issue(f.store,f.api,p.id,allowed);
    const row=f.rows.get(p.id);
    if(state==='REVOKED')row.revoked_at=f.control.now;
    if(state==='EXPIRED')f.control.now=row.expires_at;
    if(state==='REDEEMED')row.redeemed=1;
    let approvals=0;
    assert.equal((await revoke(f.store,f.api,p.id,{approve:async()=>{approvals++;return true;}})).state,state);
    assert.equal(approvals,0);
    assert.equal(f.requests.filter(r=>r.init.body?.includes('UPDATE invitations')).length,0);
    assert.ok(!f.store.files.has(`${p.id}.token`));
    assert.equal((await load(f.store,p.id)).state,state);
  });
}
test('DELIVERED requires explicit acknowledgement; revoke remains possible afterwards',async()=>{
  const f=fixture(),p=await newRecord(f);await issue(f.store,f.api,p.id,allowed);
  await assert.rejects(delivered(f.store,f.api,p.id,{approve:async()=>false}),/approval_required/);
  assert.equal((await delivered(f.store,f.api,p.id,allowed)).state,'DELIVERED');
  assert.equal((await reconcile(f.store,f.api,p.id)).state,'DELIVERED');
  assert.ok(!f.store.files.has(`${p.id}.token`));
  assert.equal((await revoke(f.store,f.api,p.id,allowed)).state,'REVOKED');
});
test('lost token permits revoke by journal UUID, never INSERT',async()=>{
  const f=fixture(),p=await newRecord(f);await issue(f.store,f.api,p.id,allowed);
  f.store.files.delete(`${p.id}.token`);
  assert.equal((await revoke(f.store,f.api,p.id,allowed)).state,'REVOKED');
});
test('disk full and crash before/after WRITE_UNKNOWN flush cannot send an unjournalled INSERT',async()=>{
  for(const after of [false,true]){
    const f=fixture(),p=await newRecord(f);
    f.store.fail=(after?'after:':'')+`${p.id}.000001.json`;
    await assert.rejects(issue(f.store,f.api,p.id,allowed));
    assert.equal(f.rows.size,0);
    assert.equal((await load(f.store,p.id)).state,after?'WRITE_UNKNOWN':'PREPARED');
  }
});
test('crash after ISSUED flush recovers exact ID; cleanup failure is visible and retryable',async()=>{
  const f=fixture(),p=await newRecord(f);f.store.fail=`after:${p.id}.000002.json`;
  await assert.rejects(issue(f.store,f.api,p.id,allowed));f.store.fail=null;
  assert.equal((await status(f.store,p.id)).state,'ISSUED');
  f.store.fail='cleanup';
  await assert.rejects(revoke(f.store,f.api,p.id,allowed),/cleanup_failed/);
  assert.equal((await load(f.store,p.id)).state,'REVOKED');
  assert.ok(f.store.files.has(`${p.id}.token`));
  f.store.fail=null;await status(f.store,p.id);
  assert.ok(!f.store.files.has(`${p.id}.token`));
});
test('partial snapshot fails closed instead of rolling back to an earlier state',async()=>{
  const f=fixture(),p=await newRecord(f);
  f.store.files.set(`${p.id}.000001.json`,'{"partial":');
  await assert.rejects(issue(f.store,f.api,p.id,allowed),/invalid_journal/);
  assert.equal(f.requests.length,0);
});
test('prepare refuses outstanding or orphan operations instead of generating another UUID',async()=>{
  const f=fixture(),p=await newRecord(f);
  await assert.rejects(newRecord(f),/unfinished_operation/);
  f.store.files.delete(`${p.id}.000000.json`);
  await assert.rejects(newRecord(f),/journal_missing/);
  assert.equal(f.requests.length,0);
});
test('before/after-flush crashes at each mutation-state boundary retain conservative recovery state',async()=>{
  for(const boundary of ['PREPARED','WRITE_UNKNOWN','ISSUED','REVOKE_UNKNOWN','REVOKED','DELIVERED']){
    for(const after of [false,true]){
      const f=fixture();
      let p;
      if(boundary!=='PREPARED'){
        p=await newRecord(f);
        if(['REVOKE_UNKNOWN','REVOKED','DELIVERED'].includes(boundary))await issue(f.store,f.api,p.id,allowed);
      }
      const create=f.store.create.bind(f.store);
      f.store.create=async(name,text)=>{
        const matches=name.endsWith('.json')&&JSON.parse(JSON.parse(text).payload).state===boundary;
        if(matches&&!after)throw new Error('simulated_crash_before_flush');
        await create(name,text);
        if(matches&&after)throw new Error('simulated_crash_after_flush');
      };
      const action=boundary==='PREPARED'?()=>newRecord(f):
        ['WRITE_UNKNOWN','ISSUED'].includes(boundary)?()=>issue(f.store,f.api,p.id,allowed):
        boundary==='DELIVERED'?()=>delivered(f.store,f.api,p.id,allowed):()=>revoke(f.store,f.api,p.id,allowed);
      await assert.rejects(action());
      f.store.create=create;
      const mutations=f.requests.filter(r=>{
        const sql=r.init.body&&JSON.parse(r.init.body).sql;return sql===SQL.insert||sql===SQL.revoke;
      }).length;
      const expected={PREPARED:0,WRITE_UNKNOWN:0,ISSUED:1,REVOKE_UNKNOWN:1,REVOKED:2,DELIVERED:1}[boundary];
      assert.equal(mutations,expected,`${boundary} ${after}`);
      if(boundary==='PREPARED')await assert.rejects(newRecord(f),/journal_missing|unfinished_operation/);
      else{
        const expectedState=after?boundary:{WRITE_UNKNOWN:'PREPARED',ISSUED:'WRITE_UNKNOWN',REVOKE_UNKNOWN:'ISSUED',REVOKED:'REVOKE_UNKNOWN',DELIVERED:'ISSUED'}[boundary];
        assert.equal((await load(f.store,p.id)).state,expectedState);
      }
    }
  }
});
test('TTL edges and reference validation happen before token generation/network',async()=>{
  for(const ttl of [1,172800,604800]){
    const f=fixture(),p=await prepare(f.store,{source,ttl});
    assert.equal((await load(f.store,p.id)).ttl,ttl);
  }
  for(const ttl of [0,604801,1.5,NaN,'10']){
    const f=fixture();await assert.rejects(prepare(f.store,{source,ttl}),/invalid_ttl/);
    assert.equal(f.store.files.size,0);assert.equal(f.requests.length,0);
  }
  for(const reference of ['a'.repeat(65),'test\nprivate']){
    const f=fixture();await assert.rejects(prepare(f.store,{source,reference}),/invalid_reference/);
    assert.equal(f.store.files.size,0);
  }
});
test('wrong target, unsafe store and failed preflight make zero network requests',async()=>{
  const f=fixture();
  assert.throws(()=>d1Client({fetcher:()=>{f.requests.push('bad');},credential:credentials,target:{...TARGET,database:'production'}}),/wrong_target/);
  f.store.safe=false;await assert.rejects(newRecord(f));assert.equal(f.store.files.size,0);
  f.store.safe=true;const p=await newRecord(f);
  await assert.rejects(issue(f.store,f.api,p.id,{...allowed,preflight:async()=>false}),/preflight_required/);
  f.store.safe=false;await assert.rejects(issue(f.store,f.api,p.id,allowed));
  assert.equal(f.requests.length,0);
});
test('metadata mismatch and missing approval cannot INSERT; revocation needs no closed-flags preflight',async()=>{
  const f=fixture(),p=await newRecord(f);f.control.metadata.name='production';
  await assert.rejects(issue(f.store,f.api,p.id,allowed),/wrong_target/);assert.equal(f.rows.size,0);
  f.control.metadata.name=TARGET.name;
  await assert.rejects(issue(f.store,f.api,p.id,{...allowed,approve:async()=>false}),/approval_required/);
  assert.equal(f.rows.size,0);await issue(f.store,f.api,p.id,allowed);
  assert.equal((await revoke(f.store,f.api,p.id,{approve:async()=>true})).state,'REVOKED');
});
test('transport never exposes secret-bearing errors and rejects redirects/HTTP or envelope failure',async()=>{
  for(const fetcher of [
    async()=>{throw new Error(credentials);},
    async()=>new Response(credentials,{status:302,headers:{Location:'https://evil.example'}}),
    async()=>new Response(JSON.stringify({success:false,errors:[credentials]}),{status:200}),
    async()=>new Response('x'.repeat(65537))
  ]){
    const api=d1Client({fetcher,credential:credentials});
    await assert.rejects(api.verify(),e=>e instanceof OperatorError&&e.message==='d1_response_uncertain'&&!String(e).includes(credentials));
  }
});
test('CLI help/argument failure stay offline and never echo credentials, unknown args or exception objects',()=>{
  const options={encoding:'utf8',env:{...process.env,BETWEEN_D1_API_TOKEN:credentials},stdio:['ignore','pipe','pipe']};
  const help=execFileSync(process.execPath,['tools/invitations-hosted.mjs','--help'],options);
  assert.match(help,/no default network/);assert.ok(!help.includes(credentials));
  try{execFileSync(process.execPath,['tools/invitations-hosted.mjs','issue','--credential',credentials],options);assert.fail('must fail');}
  catch(e){assert.equal(e.status,1);assert.ok(!e.stdout.includes(credentials));assert.ok(!e.stderr.includes(credentials));assert.match(e.stderr,/invalid_arguments/);}
});
