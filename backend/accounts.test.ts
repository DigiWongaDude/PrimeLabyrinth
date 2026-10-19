import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, afterEach, expect, test, vi } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import worker from './worker';
import { hash } from './http';
import { randomToken } from './accounts';
import { AccountClient } from '../account-client.js';

beforeAll(async()=>{await applyD1Migrations(env.DB,env.TEST_MIGRATIONS)});
afterEach(()=>vi.restoreAllMocks());
const password='A long traveller password 123!';
let sequence=0;
const config={...env,ACCOUNTS_ENABLED:'true',REGISTRATION_ENABLED:'true',MAX_TRAVELLERS:'1000',
  GOOGLE_CLIENT_ID:'test-client',GOOGLE_REDIRECT_URI:'http://localhost:4175/index.html',GOOGLE_CLIENT_SECRET:'test-only-secret'};
function user(){const n=++sequence;return {username:`traveller_${n}`,password,displayName:`Traveller ${n}`,ip:`198.51.100.${n}`}}
async function call(route,data=undefined,token=null,ip=`203.0.113.${++sequence}`,settings=config){
  const response=await worker.fetch(new Request(`http://api/v1/${route}`,{method:data===undefined?'GET':'POST',
    headers:{Origin:'http://localhost:4175','CF-Connecting-IP':ip,...(token?{Authorization:`Bearer ${token}`} :{}),
      ...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})}),settings);
  return {status:response.status,data:await response.json(),response};
}
async function signup(u=user()){const {ip,...data}=u;const r=await call('auth/signup',data,null,ip);expect(r.status).toBe(200);return {...u,...r.data}}
async function journey(token){const r=await call('journey',undefined,token);expect(r.status).toBe(200);return r.data}
async function move(token,revision,door=0){return call('advance',{requestId:crypto.randomUUID(),expectedRevision:revision,door},token)}

test('password account, case-insensitive login, logout and immutable public attribution',async()=>{
  const a=await signup(),initial=await journey(a.token);
  expect(initial.sharedDiscovery.discoverer).toEqual({publicId:a.profile.publicId,displayName:a.displayName});
  await move(a.token,0);
  const logged=await call('auth/login',{username:a.username.toUpperCase(),password});
  expect(logged.status).toBe(200);
  expect((await journey(logged.data.token)).travellerId).toBe(initial.travellerId);
  expect((await journey(logged.data.token)).activePath).toBe('0');
  const wrong=await call('auth/login',{username:a.username,password:'Another incorrect password'});
  const missing=await call('auth/login',{username:'missing_username',password:'Another incorrect password'});
  expect(wrong.status).toBe(401);expect(wrong.data).toEqual(missing.data);
  const b=await signup();await move(b.token,0);
  expect((await journey(b.token)).sharedDiscovery.discoverer.publicId).toBe(a.profile.publicId);
  expect((await call('account/name',{displayName:'Renamed traveller'},a.token)).status).toBe(200);
  const discovery=await call('discovery?path=0');
  expect(discovery.data.discoverer).toEqual({publicId:a.profile.publicId,displayName:'Renamed traveller'});
  expect((await call('auth/logout',{},logged.data.token)).status).toBe(200);
  expect((await call('journey',undefined,logged.data.token)).status).toBe(401);
  expect((await call('auth/signup',{username:a.username.toUpperCase(),password,displayName:'Duplicate'})).status).toBe(409);
  const stored=JSON.stringify((await env.DB.prepare('SELECT * FROM accounts').all()).results);
  for(const secret of [password,a.token,a.recoveryKey])expect(stored).not.toContain(secret);
  const publicJson=JSON.stringify((await call('exploration')).data);
  for(const privateValue of [a.username,initial.travellerId,a.token,a.recoveryKey])expect(publicJson).not.toContain(privateValue);
});

test('old traveller upgrades without losing history, and old recovery code cannot hijack account',async()=>{
  const legacy=randomToken();
  const old=await call('travellers',{},legacy,undefined,{...config,ACCOUNTS_ENABLED:'false'});
  expect(old.status).toBe(200);await move(legacy,0);
  const u=user(),{ip,...data}=u;
  const upgraded=await call('auth/upgrade',data,legacy,ip);
  expect(upgraded.status).toBe(200);
  expect(await journey(upgraded.data.token)).toMatchObject({travellerId:old.data.travellerId,activePath:'0',historyCount:2});
  expect((await call('journey',undefined,legacy)).status).toBe(401);
  expect((await call('travellers',{},legacy)).data.error).toBe('use_account_signup');
  expect((await call('auth/upgrade',data,legacy)).status).toBe(401);
});

test('recovery is one-use, changes password, and revokes all earlier sessions',async()=>{
  const a=await signup(),second=await call('auth/login',{username:a.username,password});
  const recovered=await call('auth/recover',{publicId:a.profile.publicId,recoveryKey:a.recoveryKey,
    username:a.username,password:'Replacement traveller password 456!'});
  expect(recovered.status).toBe(200);expect(recovered.data.recoveryKey).not.toBe(a.recoveryKey);
  for(const token of [a.token,second.data.token])expect((await call('journey',undefined,token)).status).toBe(401);
  expect((await call('auth/recover',{publicId:a.profile.publicId,recoveryKey:a.recoveryKey,username:a.username,password})).status).toBe(401);
  expect((await call('auth/login',{username:a.username,password})).status).toBe(401);
  expect((await call('auth/login',{username:a.username,password:'Replacement traveller password 456!'})).status).toBe(200);
});

test('password change rejects wrong password and invalidates other sessions',async()=>{
  const a=await signup();
  expect((await call('account/password',{currentPassword:'incorrect old password',username:a.username,password},a.token)).status).toBe(401);
  const changed=await call('account/password',{currentPassword:password,username:a.username,password:'Brand new password 789!'},a.token);
  expect(changed.status).toBe(200);
  expect((await call('journey',undefined,a.token)).status).toBe(401);
  expect((await journey(changed.data.token)).activePath).toBe('ROOT');
});

test('expired sessions, rotation replay, recent authentication and login throttling',async()=>{
  const a=await signup();
  const rotated=await call('auth/rotate',{},a.token);expect(rotated.status).toBe(200);
  expect((await call('auth/rotate',{},a.token)).status).toBe(401);
  await env.DB.prepare('UPDATE sessions SET authenticated_at=0 WHERE token_hash=?').bind(await hash(rotated.data.token)).run();
  expect((await call('account/name',{displayName:'Too late'},rotated.data.token)).data.error).toBe('sign_in_again');
  const again=await call('auth/rotate',{},rotated.data.token);expect(again.status).toBe(200);
  expect((await call('account/recovery',{},again.data.token)).data.error).toBe('sign_in_again');
  await env.DB.prepare('UPDATE sessions SET expires_at=0 WHERE token_hash=?').bind(await hash(again.data.token)).run();
  expect((await call('journey',undefined,again.data.token)).status).toBe(401);
  for(let i=0;i<10;i++)expect((await call('auth/login',{username:a.username,password:'a sufficiently long wrong password'})).status).toBe(401);
  expect((await call('auth/login',{username:a.username,password})).status).toBe(429);
});

test('registration switches fail closed, unsupported routes and Minotaur unchanged',async()=>{
  const u=user(),{ip,...data}=u;
  expect((await call('auth/signup',data,null,ip,{...config,REGISTRATION_ENABLED:'false'})).status).toBe(403);
  expect((await call('auth/signup',data,null,ip,{...config,ACCOUNTS_ENABLED:'false'})).status).toBe(503);
  expect((await call('auth/google/start',{mode:'login',challenge:'a'.repeat(43),displayName:'Guest'},null,ip,{...config,GOOGLE_CLIENT_SECRET:undefined})).data.error).toBe('google_not_configured');
  const root=await worker.fetch(new Request('http://api/'),config);
  expect(root.status).toBe(200);expect(root.headers.get('Content-Type')).toContain('text/html');
  expect(await root.text()).toContain('https://digiwongadude.com/between/assets/minotaur-access-denied.png');
  for(const path of ['/unknown','/v1/journey'])expect((await worker.fetch(new Request('http://api'+path),config)).status).toBe(403);
  expect((await worker.fetch(new Request('http://api/',{method:'HEAD'}),config)).status).toBe(403);
  const evil=await worker.fetch(new Request('http://api/v1/auth/login',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify(data)}),config);
  expect(evil.status).toBe(403);expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull();
});

test('simultaneous recovery has one winner, deletion anonymises without removing discoveries',async()=>{
  const a=await signup(),id=(await journey(a.token)).travellerId;
  const data={publicId:a.profile.publicId,recoveryKey:a.recoveryKey,username:a.username,password:'A recovered password 333!'};
  const results=await Promise.all([call('auth/recover',data),call('auth/recover',data)]);
  expect(results.filter(r=>r.status===200)).toHaveLength(1);
  const winner=results.find(r=>r.status===200);
  expect((await call('account/anonymise',{confirmation:'DELETE MY ACCOUNT'},winner.data.token)).status).toBe(200);
  expect((await call('journey',undefined,winner.data.token)).status).toBe(401);
  expect(await env.DB.prepare('SELECT display_name FROM profiles WHERE traveller_id=?').bind(id).first('display_name')).toBe('Anonymous traveller');
  expect(await env.DB.prepare('SELECT count(*) AS n FROM visits WHERE traveller_id=?').bind(id).first('n')).toBe(1);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM accounts WHERE traveller_id=?').bind(id).first('n')).toBe(0);
});

async function googleStart(mode='login',token=null){
  const verifier=randomToken(),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
  const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const r=await call('auth/google/start',{mode,challenge,displayName:'Star traveller'},token);
  expect(r.status).toBe(200);
  return {state:r.data.state,code:'google-test-code',verifier,nonce:new URL(r.data.url).searchParams.get('nonce')};
}
async function mockGoogle(attempt,sub,override={}){
  const keys=await generateKeyPair('RS256'),jwk=await exportJWK(keys.publicKey);
  const claims={sub,nonce:attempt.nonce,email_verified:true,email:'private@example.test',...override};
  const jwt=await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test-key'})
    .setIssuer(override.iss||'https://accounts.google.com').setAudience(override.aud||config.GOOGLE_CLIENT_ID)
    .setIssuedAt().setExpirationTime(override.exp??'5m').sign(keys.privateKey);
  vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>{
    if(String(url)==='https://oauth2.googleapis.com/token'){
      const sent=new URLSearchParams(options.body);
      expect(sent.get('code_verifier')).toBe(attempt.verifier);expect(sent.get('client_secret')).toBe('test-only-secret');
      return Response.json({id_token:jwt});
    }
    if(String(url)==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[{...jwk,kid:'test-key',alg:'RS256',use:'sig'}]});
    throw new Error('Unexpected provider URL');
  });
}
const complete=(attempt,token=null)=>{const {nonce,...data}=attempt;return call('auth/google/complete',data,token)};
test('Google validates signed claims and state, PKCE proof and nonce; callbacks are single use',async()=>{
  const attempt=await googleStart();await mockGoogle(attempt,'google-first');
  expect((await complete({...attempt,verifier:randomToken()})).status).toBe(401);
  expect((await complete({...attempt,state:randomToken()})).status).toBe(401);
  const r=await complete(attempt);expect(r.status).toBe(200);expect(r.data.profile.googleLinked).toBe(true);
  expect((await complete(attempt)).status).toBe(401);
  expect(JSON.stringify(await env.DB.prepare('SELECT * FROM accounts').all())).not.toContain('private@example.test');
  for(const claims of [{nonce:'wrong'},{iss:'https://evil.example'},{aud:'other-client'},{email_verified:false},{exp:1}]){
    vi.restoreAllMocks();const next=await googleStart();await mockGoogle(next,'invalid-google',claims);
    expect((await complete(next)).status).toBe(401);
  }
  vi.restoreAllMocks();
  const expired=await googleStart();
  await env.DB.prepare('UPDATE oauth_attempts SET expires_at=0 WHERE state_hash=?').bind(await hash(expired.state)).run();
  expect((await complete(expired)).status).toBe(401);
});

test('Google rejects a forged signature even with correct claims',async()=>{
  const attempt=await googleStart();
  const signer=await generateKeyPair('RS256'),other=await generateKeyPair('RS256');
  const jwt=await new SignJWT({sub:'forged',nonce:attempt.nonce,email_verified:true})
    .setProtectedHeader({alg:'RS256',kid:'forged-key'}).setIssuer('https://accounts.google.com')
    .setAudience(config.GOOGLE_CLIENT_ID).setIssuedAt().setExpirationTime('5m').sign(signer.privateKey);
  const jwk=await exportJWK(other.publicKey);
  vi.spyOn(globalThis,'fetch').mockImplementation(async url=>String(url).includes('/token')
    ?Response.json({id_token:jwt}):Response.json({keys:[{...jwk,kid:'forged-key',alg:'RS256'}]}));
  expect((await complete(attempt)).status).toBe(401);
});

test('two accounts can independently own different paths to the same triple',async()=>{
  const a=await signup(),b=await signup();
  for(const [player,doors] of [[a,[0,0,1]],[b,[0,1,1]]]){
    for(let rev=0;rev<doors.length;rev++)expect((await move(player.token,rev,doors[rev])).status).toBe(200);
  }
  const first=await call('discovery?path=001'),second=await call('discovery?path=011');
  expect(first.data.triple).toEqual(second.data.triple);
  expect(first.data.discoverer.publicId).toBe(a.profile.publicId);
  expect(second.data.discoverer.publicId).toBe(b.profile.publicId);
});

test('explicit Google linking requires both identities and never links by email',async()=>{
  const a=await signup(),b=await signup();
  const attempt=await googleStart('link',a.token);await mockGoogle(attempt,'linked-google');
  expect((await complete(attempt,b.token)).status).toBe(401);
  const linked=await complete(attempt,a.token);expect(linked.status).toBe(200);
  expect(linked.data.profile.publicId).toBe(a.profile.publicId);
  expect((await call('journey',undefined,a.token)).status).toBe(401);
  vi.restoreAllMocks();const login=await googleStart();await mockGoogle(login,'linked-google');
  const logged=await complete(login);expect(logged.status).toBe(200);expect(logged.data.profile.publicId).toBe(a.profile.publicId);
  vi.restoreAllMocks();const collision=await googleStart('link',b.token);await mockGoogle(collision,'linked-google');
  expect((await complete(collision,b.token)).status).toBe(409);
  vi.restoreAllMocks();const distinct=await googleStart();await mockGoogle(distinct,'different-sub-same-email');
  const separate=await complete(distinct);expect(separate.status).toBe(200);expect(separate.data.profile.publicId).not.toBe(a.profile.publicId);
});

test('Google migration preserves legacy traveller and closed registration permits existing Google login only',async()=>{
  const legacy=randomToken(),old=await call('travellers',{},legacy,undefined,{...config,ACCOUNTS_ENABLED:'false'});
  const attempt=await googleStart('migrate',legacy);await mockGoogle(attempt,'migrated-google');
  const result=await complete(attempt,legacy);expect(result.status).toBe(200);
  expect((await journey(result.data.token)).travellerId).toBe(old.data.travellerId);
  vi.restoreAllMocks();const returning=await googleStart();await mockGoogle(returning,'migrated-google');
  const {nonce,...data}=returning;
  expect((await call('auth/google/complete',data,null,undefined,{...config,REGISTRATION_ENABLED:'false'})).status).toBe(200);
  vi.restoreAllMocks();const fresh=await googleStart();await mockGoogle(fresh,'new-google-closed');
  const {nonce:unused,...newData}=fresh;
  expect((await call('auth/google/complete',newData,null,undefined,{...config,REGISTRATION_ENABLED:'false'})).status).toBe(403);
});

function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}
function transport(){const ip=`192.0.2.${++sequence}`;return (url,options)=>worker.fetch(new Request(url,{...options,headers:{...options.headers,Origin:'http://localhost:4175','CF-Connecting-IP':ip}}),config)}
test('account client restores same traveller on a different device and keeps secrets out of stored profile',async()=>{
  const u=user(),firstStorage=storage(),first=new AccountClient('http://api',firstStorage,transport());
  const created=await first.signup(u.username,password,u.displayName);await first.journey.move(0);
  const second=new AccountClient('http://api',storage(),transport());
  const logged=await second.login(u.username,password);
  expect(logged.journey.snapshot).toMatchObject({activePath:'0',travellerId:created.journey.snapshot.travellerId});
  expect(JSON.stringify(first.session)).not.toContain(created.recoveryKey);
  const reloaded=new AccountClient('http://api',firstStorage,transport());
  expect((await reloaded.resume()).journey.snapshot.activePath).toBe('0');
  await second.logout();expect(second.session).toBeNull();expect(second.journey.record).toBeNull();
});

test('anonymisation preserves public discovery ownership without revealing old display name',async()=>{
  const a=await signup(),original=await journey(a.token);
  expect((await move(a.token,0)).status).toBe(200);
  const before=await call('discovery?path=0');
  expect(before.data.discoverer.publicId).toBe(a.profile.publicId);
  expect((await call('account/anonymise',{confirmation:'DELETE MY ACCOUNT'},a.token)).status).toBe(200);
  const after=await call('discovery?path=0');
  expect(after.data.discoverer).toEqual({publicId:a.profile.publicId,displayName:'Anonymous traveller'});
  expect(after.data.firstDiscoveredAt).toBe(before.data.firstDiscoveredAt);
  expect(after.data.canonicalPath).toBe(before.data.canonicalPath);
  expect((await call('journey',undefined,a.token)).status).toBe(401);
  const root=await call('discovery?path=ROOT');
  expect(root.status).toBe(200);
  expect(original.travellerId).toBeTruthy();
});

test('session rotation preserves a pending journey command and cannot restore an expired session',async()=>{
  const a=await signup(),snapshot=await journey(a.token);
  const requestId=crypto.randomUUID();
  const command={requestId,expectedRevision:snapshot.revision,door:0};
  const first=await call('advance',command,a.token);
  expect(first.status).toBe(200);
  const rotated=await call('auth/rotate',{},a.token);
  expect(rotated.status).toBe(200);
  expect((await call('advance',command,a.token)).status).toBe(401);
  const retry=await call('advance',command,rotated.data.token);
  expect(retry.status).toBe(200);
  expect(retry.data).toEqual(first.data);
  await env.DB.prepare('UPDATE sessions SET expires_at=0 WHERE token_hash=?').bind(await hash(rotated.data.token)).run();
  expect((await call('auth/rotate',{},rotated.data.token)).status).toBe(401);
});
