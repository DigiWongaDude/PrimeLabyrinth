import { env } from 'cloudflare:workers';
import { beforeAll, afterEach, expect, test, vi } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import worker from './worker';
import { randomToken } from './accounts';
import { hash } from './http';
import { invitationDigest } from './invitations';
import { prepareLegacyPool, takeLegacy, mintInvitation } from './test-fixtures';
import { AccountClient } from '../account-client.js';

let pool,keys,jwk,sequence=0;
const password='Disposable alpha password 123!';
const config={...env,ACCOUNTS_ENABLED:'true',REGISTRATION_ENABLED:'true',MAX_TRAVELLERS:'1000',
  GOOGLE_CLIENT_ID:'invite-test-client',GOOGLE_REDIRECT_URI:'http://localhost:4175/index.html',GOOGLE_CLIENT_SECRET:'test-only-secret'};
beforeAll(async()=>{
  pool=await prepareLegacyPool(8);
  keys=await generateKeyPair('RS256');jwk=await exportJWK(keys.publicKey);
});
afterEach(()=>vi.restoreAllMocks());
async function call(route,data=undefined,token=null,settings=config,ip=`198.51.100.${++sequence}`){
  const response=await worker.fetch(new Request(`http://api/v1/${route}`,{method:data===undefined?'GET':'POST',
    headers:{Origin:'http://localhost:4175','CF-Connecting-IP':ip,...(token?{Authorization:`Bearer ${token}`} :{}),
      ...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})}),settings);
  return {status:response.status,data:await response.json()};
}
function fields(invitation=undefined){return {username:`invite_${++sequence}`,password,displayName:'Alpha tester',...(invitation===undefined?{}:{invitation})}}
async function signup(invitation=undefined,settings=config){return call('auth/signup',fields(invitation),null,settings)}
async function ledger(){
  const result={};
  for(const table of ['travellers','profiles','accounts','sessions','visits','discoveries','commands','invitation_redemptions','legacy_upgrade_eligibility','legacy_upgrade_proofs']){
    result[table]=(await env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
  }
  return result;
}
async function start(invitation=undefined,mode='login',token=null){
  const verifier=randomToken(),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
  const challenge=btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const result=await call('auth/google/start',{mode,challenge,displayName:'Alpha Google',...(invitation===undefined?{}:{invitation})},token);
  expect(result.status).toBe(200);
  return {state:result.data.state,verifier,code:randomToken(),nonce:new URL(result.data.url).searchParams.get('nonce'),url:result.data.url};
}
const complete=(attempt,token=null,settings=config)=>call('auth/google/complete',{
  state:attempt.state,verifier:attempt.verifier,code:attempt.code
},token,settings);
function provider(){
  const responses=new Map();
  vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>{
    if(String(url)==='https://oauth2.googleapis.com/token'){
      const sent=new URLSearchParams(options.body),r=responses.get(sent.get('code'));
      if(!r)return Response.json({error:'invalid_grant'},{status:400});
      expect(sent.get('code_verifier')).toBe(r.verifier);
      return Response.json({id_token:r.jwt});
    }
    if(String(url)==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[{...jwk,kid:'invite-key',alg:'RS256',use:'sig'}]});
    throw new Error('Unexpected provider request');
  });
  return async(attempt,sub=crypto.randomUUID(),claims={})=>{
    const jwt=await new SignJWT({sub,nonce:attempt.nonce,email_verified:true,...claims})
      .setProtectedHeader({alg:'RS256',kid:'invite-key'}).setIssuer('https://accounts.google.com')
      .setAudience(config.GOOGLE_CLIENT_ID).setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
    responses.set(attempt.code,{jwt,verifier:attempt.verifier});return sub;
  };
}

test('direct password signup uniformly rejects missing, malformed, unknown, digest, expired, revoked and spent invites without ledger writes',async()=>{
  const revoked=await mintInvitation(),spent=await mintInvitation(),valid=await mintInvitation();
  await env.DB.prepare('UPDATE invitations SET revoked_at=unixepoch() WHERE token_hash=?').bind(await invitationDigest(revoked)).run();
  // Fresh expired fixture; expiry updates are intentionally forbidden by SQL.
  const actuallyExpired=randomToken();
  await env.DB.prepare('INSERT INTO invitations(id,token_hash,created_at,expires_at) VALUES(?,?,unixepoch()-100,unixepoch())')
    .bind(crypto.randomUUID(),await invitationDigest(actuallyExpired)).run();
  expect((await signup(spent)).status).toBe(200);
  for(const invitation of [undefined,null,'',42,'a'.repeat(65),randomToken(),await invitationDigest(valid),actuallyExpired,revoked,spent]){
    const before=await ledger();
    // Deliberately invalid password: rejected invitations must be checked before
    // password validation/scrypt, rather than paying its cost for random guesses.
    const result=await call('auth/signup',{...fields(invitation),password:'short'});
    expect(result).toEqual({status:403,data:{error:'invitation_unavailable'}});
    expect(await ledger()).toEqual(before);
  }
});

test('all flag combinations close unknown legacy registration but preserve recognised resumes',async()=>{
  const old=await takeLegacy(pool);
  for(const accounts of ['true','false',undefined])for(const registration of ['true','false',undefined]){
    const settings={...config,ACCOUNTS_ENABLED:accounts,REGISTRATION_ENABLED:registration},before=await ledger();
    expect((await call('travellers',{},randomToken(),settings)).status).toBe(403);
    expect(await ledger()).toEqual(before);
    expect((await call('travellers',{},old.token,settings)).data.travellerId).toBe(old.id);
  }
});

test.each(['password/password','Google/Google','password/Google'])('real route race for one invite admits one identity: %s',async(kind)=>{
  const invitation=await mintInvitation(),sign=provider(),requests=[];
  const before=(await ledger()).travellers.length;
  for(const mode of kind.split('/')){
    if(mode==='password')requests.push(()=>signup(invitation));
    else {const attempt=await start(invitation);await sign(attempt);requests.push(()=>complete(attempt));}
  }
  const results=await Promise.all(requests.map(run=>run()));
  expect(results.map(r=>r.status).sort()).toEqual([200,403]);
  expect((await ledger()).travellers.length).toBe(before+1);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM invitation_redemptions WHERE invite_hash=?').bind(await invitationDigest(invitation)).first('n')).toBe(1);
  const winner=results.find(r=>r.status===200);
  expect((await call('journey',undefined,winner.data.token)).status).toBe(200);
});

test('signed new Google identities require bound invitation; callbacks cannot supply or replace it',async()=>{
  const sign=provider();
  for(const token of [undefined,randomToken()]){
    const attempt=await start(token);await sign(attempt);
    const before=await ledger();
    expect((await complete(attempt))).toEqual({status:403,data:{error:'invitation_unavailable'}});
    expect(await ledger()).toEqual(before);
  }
  const invitation=await mintInvitation(),attempt=await start();await sign(attempt);
  expect((await call('auth/google/complete',{state:attempt.state,code:attempt.code,verifier:attempt.verifier,invitation})).status).toBe(400);
  expect((await complete(attempt)).status).toBe(403);
  expect(await env.DB.prepare('SELECT * FROM invitation_redemptions WHERE invite_hash=?').bind(await invitationDigest(invitation)).first()).toBeNull();
});

test('Google start stores only a digest; bad provider proof and revoked invite never spend it',async()=>{
  const sign=provider(),invitation=await mintInvitation(),attempt=await start(invitation);
  const stored=await env.DB.prepare('SELECT * FROM oauth_attempts WHERE state_hash=?').bind(await hash(attempt.state)).first();
  expect(stored.invite_hash).toBe(await invitationDigest(invitation));
  expect(JSON.stringify(stored)).not.toContain(invitation);
  expect(attempt.url).not.toContain(invitation);expect(attempt.url).not.toContain(stored.invite_hash);
  await sign(attempt,crypto.randomUUID(),{nonce:'wrong'});
  expect((await complete(attempt)).status).toBe(401);
  const next=await start(invitation);await sign(next);
  await env.DB.prepare('UPDATE invitations SET revoked_at=unixepoch() WHERE token_hash=?').bind(stored.invite_hash).run();
  const before=await ledger();
  expect((await complete(next)).status).toBe(403);
  expect(await ledger()).toEqual(before);
});

test('returning Google and explicit linking work with registration closed and never redeem a fresh invitation',async()=>{
  const sign=provider(),invitation=await mintInvitation(),a=await signup(invitation),closed={...config,REGISTRATION_ENABLED:'false'};
  const link=await start(undefined,'link',a.data.token);const sub=await sign(link);
  const linked=await complete(link,a.data.token,closed);expect(linked.status).toBe(200);
  const fresh=await mintInvitation();
  for(const token of [undefined,randomToken(),invitation,fresh]){
    const attempt=await start(token);await sign(attempt,sub);
    const result=await complete(attempt,null,closed);expect(result.status).toBe(200);
    expect(result.data.profile.publicId).toBe(a.data.profile.publicId);
  }
  expect(await env.DB.prepare('SELECT * FROM invitation_redemptions WHERE invite_hash=?').bind(await invitationDigest(fresh)).first()).toBeNull();
});

test('session insertion failure and cap/username conflicts leave invitation reusable',async()=>{
  const invitation=await mintInvitation(),data=fields(invitation),before=await ledger();
  await env.DB.exec("CREATE TRIGGER test_route_session_fail BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'injected_failure'); END;");
  try{expect((await call('auth/signup',data)).status).toBe(503);expect(await ledger()).toEqual(before);}
  finally{await env.DB.exec('DROP TRIGGER test_route_session_fail');}
  const a=await call('auth/signup',data);expect(a.status).toBe(200);
  const another=await mintInvitation(),stable=await ledger();
  expect((await call('auth/signup',{...data,invitation:another})).status).toBe(409);
  expect(await ledger()).toEqual(stable);
  expect((await signup(another,{...config,MAX_TRAVELLERS:String(stable.travellers.length)})).status).toBe(409);
  expect(await ledger()).toEqual(stable);
  expect((await signup(another)).status).toBe(200);
});

test('lost response is recovered by normal login, not by spending the invitation again; closed registration permits recovery',async()=>{
  const invitation=await mintInvitation(),data=fields(invitation),created=await call('auth/signup',data);
  expect(created.status).toBe(200);const closed={...config,REGISTRATION_ENABLED:'false'};
  expect((await call('auth/signup',data)).status).toBe(403);
  const login=await call('auth/login',{username:data.username,password},null,closed);expect(login.status).toBe(200);
  expect(login.data.profile.publicId).toBe(created.data.profile.publicId);
  const recovered=await call('auth/recover',{publicId:created.data.profile.publicId,recoveryKey:created.data.recoveryKey,
    username:data.username,password:'A replacement alpha password 987!'},null,closed);
  expect(recovered.status).toBe(200);
  expect((await call('auth/rotate',{},recovered.data.token,closed)).status).toBe(200);
  expect((await call('journey',undefined,login.data.token)).status).toBe(401);
});

test('stale legacy proof after authentication is rejected transactionally and valid upgrade preserves discovery ownership',async()=>{
  const old=await takeLegacy(pool),before=await ledger(),{invitation,...data}=fields();
  let changed=false;
  const settings={...config,CREATE_LIMIT:{limit:async()=>{
    if(!changed){changed=true;await env.DB.prepare('UPDATE travellers SET token_hash=? WHERE id=?').bind(await hash(randomToken()),old.id).run();}
    return {success:true};
  }}};
  expect((await call('auth/upgrade',data,old.token,settings)).status).toBe(401);
  expect((await ledger()).accounts).toEqual(before.accounts);
  expect(await env.DB.prepare('SELECT * FROM legacy_upgrade_proofs').all()).toMatchObject({results:[]});
  const valid=await takeLegacy(pool),snapshot=(await call('journey',undefined,valid.token)).data;
  const upgraded=await call('auth/upgrade',fields(),valid.token);expect(upgraded.status).toBe(200);
  const after=(await call('journey',undefined,upgraded.data.token)).data;
  expect(after.travellerId).toBe(valid.id);expect(after.sharedDiscovery).toEqual(snapshot.sharedDiscovery);
});

test('concurrent password/Google upgrades have one owner and retire the legacy token',async()=>{
  const old=await takeLegacy(pool),sign=provider(),attempt=await start(undefined,'migrate',old.token);await sign(attempt);
  const results=await Promise.all([call('auth/upgrade',fields(),old.token),complete(attempt,old.token)]);
  expect(results.filter(r=>r.status===200)).toHaveLength(1);
  expect(results.filter(r=>r.status!==200).every(r=>[401,409].includes(r.status))).toBe(true);
  const winner=results.find(r=>r.status===200);
  expect((await call('journey',undefined,winner.data.token)).data.travellerId).toBe(old.id);
  expect((await call('journey',undefined,old.token)).status).toBe(401);
});

test('D1 admission limit bounds guesses by IP independently of the edge limit',async()=>{
  const settings={...config,CREATE_LIMIT:{limit:async()=>({success:true})}},ip='192.0.2.250';
  // Stabilise only application bucket selection, never the SQLite clock.
  const time=Date.now();vi.spyOn(Date,'now').mockReturnValue(time);
  const before=await ledger();
  for(let i=0;i<5;i++)expect((await call('auth/signup',fields(randomToken()),null,settings,ip)).status).toBe(403);
  expect((await call('auth/signup',fields(await mintInvitation()),null,settings,ip)).status).toBe(429);
  expect(await ledger()).toEqual(before);
  const bucket=Math.floor(Math.floor(time/1000)/60);
  expect(await env.DB.prepare('SELECT attempts FROM auth_limits WHERE key_hash=?').bind(await hash(`admission:${ip}:${bucket}`)).first('attempts')).toBe(6);
});

test('invitation client transport never stores the invitation or sends it to the callback',async()=>{
  const entries=new Map(),storage={getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
  const invitation=await mintInvitation(),client=new AccountClient('http://api',storage,async(url,options)=>
    worker.fetch(new Request(url,{...options,headers:{...options.headers,Origin:'http://localhost:4175','CF-Connecting-IP':`203.0.113.${++sequence}`}}),config));
  const url=await client.startGoogle('login','Tester',null,invitation);
  expect(url).not.toContain(invitation);
  expect(JSON.stringify([...entries])).not.toContain(invitation);
  expect(JSON.stringify([...entries])).not.toContain(await invitationDigest(invitation));
  const signupClient=new AccountClient('http://api',storage,client.fetcher),data=fields();
  const result=await signupClient.signup(data.username,password,data.displayName,null,invitation);
  expect(JSON.stringify([...entries])).not.toContain(invitation);
  for(const route of ['discovery?path=ROOT','exploration']){
    const response=JSON.stringify((await call(route)).data);
    for(const secret of [invitation,await invitationDigest(invitation),result.recoveryKey])expect(response).not.toContain(secret);
  }
});
