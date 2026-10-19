import { scryptSync, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { START } from '../engine.js';
import { body, exact, fail, hash } from './http';
import { invitationDigest, requireInvitation } from './invitations';

type DB = D1DatabaseSession;
export type AccountEnv = Env & { GOOGLE_CLIENT_SECRET?: string };
type Account = { traveller_id:string; username:string|null; password_hash:string|null;
  google_sub:string|null; recovery_hash:string; version:number };
export type Identity = { id:string; active_path:string; revision:number; session_hash:string|null;
  authenticated_at:number; account_version:number|null };
type Attempt = { state_hash:string; challenge:string; nonce_hash:string; origin:string;
  mode:'login'|'link'|'migrate'; traveller_id:string|null; session_hash:string|null; display_name:string; expires_at:number; invite_hash:string|null };
const now = () => Math.floor(Date.now()/1000);
const SESSION_SECONDS = 12*60*60;
const FRESH_SECONDS = 10*60;
const HEX = /^[0-9a-f]{64}$/;
// OWASP scrypt alternative: N=2^14, r=8, p=5 (~16 MiB). Native Workers crypto;
// avoids a custom WASM Argon2 loader and fits the isolate memory limit.
const SCRYPT = { N:16384, r:8, p:5, maxmem:32*1024*1024 };
const DUMMY_HASH = 'scrypt-v1$00000000000000000000000000000000$'+'00'.repeat(32);
export function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join(''); }
function username(value:unknown) {
  if (typeof value!=='string' || !/^[a-zA-Z0-9_]{3,32}$/.test(value)) fail(400,'invalid_username');
  return value.toLowerCase();
}
function password(value:unknown) {
  if (typeof value!=='string' || [...value].length<15 || value.length>128) fail(400,'password_length_15_to_128');
  return value;
}
function displayName(value:unknown) {
  if (typeof value!=='string') fail(400,'invalid_display_name');
  const name=value.trim().normalize('NFC');
  if (!/^[\p{L}\p{N} _.'-]{1,40}$/u.test(name)) fail(400,'invalid_display_name');
  return name;
}
export function passwordHash(value:string) {
  const salt=randomToken().slice(0,32);
  return `scrypt-v1$${salt}$${scryptSync(value,salt,32,SCRYPT).toString('hex')}`;
}
function passwordMatches(value:string, encoded:string|null) {
  const [version,salt,expected]=(encoded||DUMMY_HASH).split('$');
  if (version!=='scrypt-v1' || !/^[0-9a-f]{32}$/.test(salt) || !HEX.test(expected)) fail(503,'credential_format');
  const actual=scryptSync(value,salt,32,SCRYPT);
  return timingSafeEqual(actual,Buffer.from(expected,'hex')) && encoded!==null;
}
async function throttle(db:DB, key:string, max:number, seconds=900) {
  const time=now(), bucket=Math.floor(time/seconds), keyHash=await hash(`${key}:${bucket}`);
  const row=await db.prepare(`INSERT INTO auth_limits(key_hash,attempts,expires_at) VALUES(?,1,?)
    ON CONFLICT(key_hash) DO UPDATE SET attempts=attempts+1 RETURNING attempts`)
    .bind(keyHash,(bucket+1)*seconds).first<{attempts:number}>();
  if (!row || row.attempts>max) fail(429,'rate_limited');
}
async function cleanup(db:DB) {
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now()),
    db.prepare('DELETE FROM oauth_attempts WHERE expires_at<=?').bind(now()),
    db.prepare('DELETE FROM auth_limits WHERE expires_at<=?').bind(now())
  ]);
}
export async function authenticate(db:DB, tokenHash:string):Promise<Identity|null> {
  const session=await db.prepare(`SELECT t.id,t.active_path,t.revision,s.token_hash AS session_hash,
    s.authenticated_at,s.account_version FROM sessions s JOIN accounts a ON a.traveller_id=s.traveller_id
    JOIN travellers t ON t.id=s.traveller_id JOIN profiles p ON p.traveller_id=t.id
    WHERE s.token_hash=? AND s.expires_at>? AND s.account_version=a.version AND p.anonymised=0`)
    .bind(tokenHash,now()).first<Identity>();
  if (session) return session;
  return db.prepare(`SELECT t.id,t.active_path,t.revision,NULL AS session_hash,0 AS authenticated_at,
    NULL AS account_version FROM travellers t JOIN profiles p ON p.traveller_id=t.id
    WHERE t.token_hash=? AND p.legacy_enabled=1 AND p.anonymised=0`).bind(tokenHash).first<Identity>();
}
async function account(db:DB,id:string) {
  const a=await db.prepare('SELECT * FROM accounts WHERE traveller_id=?').bind(id).first<Account>();
  if (!a) fail(401,'account_required');
  return a;
}
function fresh(identity:Identity|null) {
  if (!identity?.session_hash || identity.authenticated_at<now()-FRESH_SECONDS) fail(401,'sign_in_again');
  return identity;
}
export async function profile(db:DB,id:string) {
  const row=await db.prepare(`SELECT p.public_id,p.display_name,p.anonymised,a.username,a.google_sub
    FROM profiles p LEFT JOIN accounts a ON a.traveller_id=p.traveller_id WHERE p.traveller_id=?`)
    .bind(id).first<{public_id:string;display_name:string;anonymised:number;username:string|null;google_sub:string|null}>();
  if (!row) fail(404,'traveller_not_found');
  return {publicId:row.public_id,displayName:row.display_name,username:row.username,
    googleLinked:!!row.google_sub,hasPassword:!!row.username};
}
async function issueSession(db:DB,a:Account,authenticatedAt=now()) {
  const token=randomToken(), expiresAt=now()+SESSION_SECONDS;
  const inserted=await db.prepare(`INSERT INTO sessions(token_hash,traveller_id,account_version,authenticated_at,expires_at)
    SELECT ?,traveller_id,version,?,? FROM accounts WHERE traveller_id=? AND version=? RETURNING token_hash`)
    .bind(await hash(token),authenticatedAt,expiresAt,a.traveller_id,a.version).first();
  if (!inserted) fail(409,'account_changed');
  return {token,expiresAt,profile:await profile(db,a.traveller_id)};
}
function registration(env:AccountEnv) {
  if (String(env.REGISTRATION_ENABLED)!=='true') fail(403,'registration_closed');
  const cap=Number(env.MAX_TRAVELLERS);
  if (!Number.isSafeInteger(cap)||cap<1||cap>10000) fail(503,'registration_unconfigured');
  return cap;
}
async function createAccount(db:DB,env:AccountEnv,options:{name:string;username:string|null;passwordHash:string|null;sub:string|null;legacy:Identity|null;legacyProof:string|null;inviteHash:string|null}) {
  const cap=registration(env),id=options.legacy?.id||crypto.randomUUID();
  if (options.legacy?.session_hash) fail(409,'already_has_account');
  const recoveryKey=randomToken(),recoveryHash=await hash(recoveryKey),unusedHash=await hash(randomToken());
  const token=randomToken(),tokenHash=await hash(token),expiresAt=now()+SESSION_SECONDS;
  const statements:D1PreparedStatement[]=[];
  if (options.legacy) {
    if (!options.legacyProof) fail(401,'legacy_credential_required');
    statements.push(db.prepare('INSERT INTO legacy_upgrade_proofs(traveller_id,token_hash) VALUES(?,?)').bind(id,options.legacyProof));
  } else {
    if (!options.inviteHash) fail(403,'invitation_unavailable');
    statements.push(
      db.prepare(`INSERT INTO travellers(id,token_hash) SELECT ?,? WHERE (SELECT count(*) FROM travellers)<?`).bind(id,unusedHash,cap),
      db.prepare('INSERT INTO invitation_redemptions(invite_hash,traveller_id) VALUES(?,?)').bind(options.inviteHash,id)
    );
  }
  statements.push(
    db.prepare(`INSERT INTO accounts(traveller_id,username,password_hash,google_sub,recovery_hash)
      VALUES(?,?,?,?,?)`).bind(id,options.username,options.passwordHash,options.sub,recoveryHash),
    // The account trigger consumes admission proof and retires the old token.
    db.prepare('UPDATE profiles SET display_name=? WHERE traveller_id=?').bind(options.name,id),
    db.prepare(`INSERT INTO visits(traveller_id,path,canonical_path,parent_path,a,b,c) VALUES(?,'ROOT','g5:2,2,3:ROOT',NULL,?,?,?)
      ON CONFLICT(traveller_id,path) DO NOTHING`).bind(id,...START),
    db.prepare(`INSERT INTO sessions(token_hash,traveller_id,account_version,authenticated_at,expires_at)
      VALUES(?,?,1,?,?)`).bind(tokenHash,id,now(),expiresAt)
  );
  try { await db.batch(statements); }
  catch(error) {
    if (/invitation_unavailable|invitation_redemptions.invite_hash/.test(String(error))) fail(403,'invitation_unavailable');
    if (/legacy_proof_invalid/.test(String(error))) fail(401,'legacy_credential_required');
    if (/admission_required/.test(String(error))) fail(409,'account_unavailable');
    if (/UNIQUE constraint|FOREIGN KEY constraint/.test(String(error))) fail(409,'account_unavailable');
    throw error;
  }
  return {token,expiresAt,profile:await profile(db,id),recoveryKey};
}
// CAS credential changes invalidate all old sessions atomically. Competing
// password reset/change/link operations can never silently overwrite each other.
async function changeCredentials(db:DB,a:Account,values:{username:string|null;passwordHash:string|null;sub:string|null;recoveryHash:string},identity:Identity|null=null) {
  if (identity && (identity.id!==a.traveller_id || identity.account_version!==a.version)) fail(401,'sign_in_again');
  const token=randomToken(),tokenHash=await hash(token),expiresAt=now()+SESSION_SECONDS;
  try {
    const results=await db.batch([
      db.prepare(`UPDATE accounts SET username=?,password_hash=?,google_sub=?,recovery_hash=?,version=version+1
        WHERE traveller_id=? AND version=? AND (? IS NULL OR EXISTS (
          SELECT 1 FROM sessions s WHERE s.token_hash=? AND s.traveller_id=accounts.traveller_id
          AND s.account_version=accounts.version AND s.expires_at>? AND s.authenticated_at>=?
        )) RETURNING traveller_id`)
        .bind(values.username,values.passwordHash,values.sub,values.recoveryHash,a.traveller_id,a.version,
          identity?.session_hash||null,identity?.session_hash||null,now(),now()-FRESH_SECONDS),
      // This must immediately follow the UPDATE: changes() ties session creation
      // to this transaction's CAS winner, not merely matching credential values.
      db.prepare(`INSERT INTO sessions(token_hash,traveller_id,account_version,authenticated_at,expires_at)
        SELECT ?,traveller_id,version,?,? FROM accounts WHERE traveller_id=? AND version=? AND changes()=1`)
        .bind(tokenHash,now(),expiresAt,a.traveller_id,a.version+1),
      db.prepare(`DELETE FROM sessions WHERE traveller_id=? AND account_version<>(SELECT version FROM accounts WHERE traveller_id=?)`)
        .bind(a.traveller_id,a.traveller_id)
    ]);
    if (!results[0].results.length || !results[1].meta.changes) fail(409,'account_changed');
  } catch(error) {
    if (/UNIQUE constraint/.test(String(error))) fail(409,'account_unavailable');
    throw error;
  }
  return {token,expiresAt,profile:await profile(db,a.traveller_id)};
}
function googleConfig(env:AccountEnv,origin:string) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI || !env.GOOGLE_CLIENT_SECRET) fail(503,'google_not_configured');
  const redirect=new URL(env.GOOGLE_REDIRECT_URI);
  if (redirect.origin!==origin || redirect.hash || redirect.search || (redirect.protocol!=='https:' && redirect.hostname!=='localhost')) fail(503,'google_redirect_configuration');
  return {clientId:env.GOOGLE_CLIENT_ID,redirect:redirect.href,secret:env.GOOGLE_CLIENT_SECRET};
}
async function challenge(verifier:string) {
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)))))
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
async function googleSubject(env:AccountEnv,origin:string,code:string,verifier:string,nonceHash:string) {
  const config=googleConfig(env,origin);
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},redirect:'error',signal:AbortSignal.timeout(10000),
    body:new URLSearchParams({grant_type:'authorization_code',code,code_verifier:verifier,
      client_id:config.clientId,client_secret:config.secret,redirect_uri:config.redirect})
  });
  // Reuse bounded parsing; provider tokens are never logged or persisted.
  if (!response.ok) fail(401,'google_sign_in_failed');
  const data=await body(new Request('https://internal/token',{method:'POST',headers:{'Content-Type':'application/json'},body:response.body}));
  if (typeof data.id_token!=='string') fail(401,'google_sign_in_failed');
  try {
    const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{timeoutDuration:10000});
    const {payload}=await jwtVerify(data.id_token,keys,{issuer:['https://accounts.google.com','accounts.google.com'],
      audience:config.clientId,algorithms:['RS256'],requiredClaims:['sub','exp','iat','nonce'],maxTokenAge:'10m',clockTolerance:5});
    if (typeof payload.sub!=='string' || !payload.sub || payload.sub.length>255 || payload.email_verified!==true ||
      typeof payload.nonce!=='string' || await hash(payload.nonce)!==nonceHash ||
      (payload.azp!==undefined && payload.azp!==config.clientId)) fail(401,'google_sign_in_failed');
    return payload.sub;
  } catch { fail(401,'google_sign_in_failed'); }
}

export async function accountRoute(request:Request,env:AccountEnv,db:DB,identity:Identity|null,tokenHash:string|null,ip:string):Promise<unknown> {
  const route=new URL(request.url).pathname,origin=request.headers.get('Origin')!;
  if (String(env.ACCOUNTS_ENABLED)!=='true') fail(503,'accounts_disabled');
  if (route==='/v1/auth/config' && request.method==='GET') return {
    registrationEnabled:String(env.REGISTRATION_ENABLED)==='true',
    invitationRequired:true,
    googleEnabled:!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_REDIRECT_URI&&env.GOOGLE_CLIENT_SECRET)
  };
  if (route==='/v1/account' && request.method==='GET') {
    if (!identity) fail(401,'credential_required');
    return profile(db,identity.id);
  }
  if (request.method!=='POST') fail(404,'not_found');
  await throttle(db,`ip:${ip}`,30,60);
  await cleanup(db);
  const data=await body(request);
  if (route==='/v1/auth/signup' || route==='/v1/auth/upgrade') {
    const isUpgrade=route.endsWith('/upgrade');
    exact(data,['username','password','displayName'],isUpgrade?[]:['invitation']);
    registration(env);
    if (!(await env.CREATE_LIMIT.limit({key:ip})).success) fail(429,'rate_limited');
    await throttle(db,`admission:${ip}`,5,60);
    if (isUpgrade && (!identity || identity.session_hash)) fail(401,'legacy_credential_required');
    if (!isUpgrade && identity) fail(409,'sign_out_first');
    const inviteHash=isUpgrade?null:await invitationDigest(data.invitation);
    if (!isUpgrade) await requireInvitation(db,inviteHash);
    return createAccount(db,env,{name:displayName(data.displayName),username:username(data.username),
      passwordHash:passwordHash(password(data.password)),sub:null,legacy:isUpgrade?identity:null,
      legacyProof:isUpgrade?tokenHash:null,inviteHash});
  }
  if (route==='/v1/auth/login') {
    exact(data,['username','password']);
    const name=username(data.username),pw=password(data.password);
    await throttle(db,`user:${name}`,10);
    const a=await db.prepare('SELECT * FROM accounts WHERE username=?').bind(name).first<Account>();
    const valid=passwordMatches(pw,a?.password_hash||null);
    if (!valid || !a) fail(401,'invalid_credentials');
    return issueSession(db,a);
  }
  if (route==='/v1/auth/recover') {
    exact(data,['publicId','recoveryKey','username','password']);
    if (typeof data.publicId!=='string' || !/^[0-9a-f]{32}$/.test(data.publicId) || typeof data.recoveryKey!=='string' || !HEX.test(data.recoveryKey)) fail(401,'invalid_credentials');
    await throttle(db,`recover:${data.publicId}`,10);
    const a=await db.prepare(`SELECT a.* FROM accounts a JOIN profiles p ON p.traveller_id=a.traveller_id
      WHERE p.public_id=? AND a.recovery_hash=?`).bind(data.publicId,await hash(data.recoveryKey)).first<Account>();
    if (!a) fail(401,'invalid_credentials');
    const recoveryKey=randomToken();
    return {...await changeCredentials(db,a,{username:username(data.username),passwordHash:passwordHash(password(data.password)),
      sub:a.google_sub,recoveryHash:await hash(recoveryKey)}),recoveryKey};
  }
  if (route==='/v1/auth/google/start') {
    exact(data,['mode','challenge','displayName'],data.mode==='login'?['invitation']:[]);
    const config=googleConfig(env,origin);
    if (!['login','link','migrate'].includes(String(data.mode)) || typeof data.challenge!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(data.challenge)) fail(400,'invalid_oauth_request');
    if (data.mode==='link') fresh(identity);
    if (data.mode==='migrate' && (!identity || identity.session_hash)) fail(401,'legacy_credential_required');
    if (data.mode==='login' && identity) fail(409,'sign_out_first');
    // Do not check availability or consume at start: returning Google accounts
    // must still sign in with an absent, unknown, expired or spent invitation.
    const inviteHash=data.invitation===undefined?null:await invitationDigest(data.invitation);
    const state=randomToken(),nonce=randomToken(),name=displayName(data.displayName);
    await db.prepare(`INSERT INTO oauth_attempts(state_hash,challenge,nonce_hash,origin,mode,traveller_id,session_hash,display_name,expires_at,invite_hash)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(await hash(state),data.challenge,await hash(nonce),origin,data.mode,identity?.id||null,
        tokenHash,name,now()+600,inviteHash).run();
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirect,response_type:'code',scope:'openid email',
      state,nonce,code_challenge:data.challenge,code_challenge_method:'S256',prompt:'select_account'}).toString();
    return {url:url.href,state};
  }
  if (route==='/v1/auth/google/complete') {
    exact(data,['state','code','verifier']);
    if (typeof data.state!=='string'||!HEX.test(data.state)||typeof data.code!=='string'||data.code.length>4096||
      typeof data.verifier!=='string'||!/^[A-Za-z0-9._~-]{43,128}$/.test(data.verifier)) fail(401,'invalid_oauth_request');
    const stateHash=await hash(data.state),proof=await challenge(data.verifier);
    const attempt=await db.prepare('SELECT * FROM oauth_attempts WHERE state_hash=? AND expires_at>? AND origin=? AND challenge=?')
      .bind(stateHash,now(),origin,proof).first<Attempt>();
    if (!attempt || (attempt.mode!=='login' && (!identity||identity.id!==attempt.traveller_id||tokenHash!==attempt.session_hash))) fail(401,'invalid_oauth_request');
    if (attempt.mode==='link') fresh(identity);
    const consumed=await db.prepare('DELETE FROM oauth_attempts WHERE state_hash=? RETURNING state_hash').bind(stateHash).first();
    if (!consumed) fail(401,'invalid_oauth_request');
    const sub=await googleSubject(env,origin,data.code,data.verifier,attempt.nonce_hash);
    const existing=await db.prepare('SELECT * FROM accounts WHERE google_sub=?').bind(sub).first<Account>();
    if (attempt.mode==='link') {
      const a=await account(db,identity!.id);
      if ((existing && existing.traveller_id!==a.traveller_id) || (a.google_sub && a.google_sub!==sub)) fail(409,'identity_already_linked');
      return changeCredentials(db,a,{username:a.username,passwordHash:a.password_hash,sub,recoveryHash:a.recovery_hash},identity);
    }
    if (attempt.mode==='migrate' && existing) fail(409,'identity_already_linked');
    if (existing) return issueSession(db,existing);
    registration(env);
    if (!(await env.CREATE_LIMIT.limit({key:ip})).success) fail(429,'rate_limited');
    await throttle(db,`admission:${ip}`,5,60);
    if (attempt.mode==='login') await requireInvitation(db,attempt.invite_hash);
    return createAccount(db,env,{name:attempt.display_name,username:null,passwordHash:null,sub,legacy:attempt.mode==='migrate'?identity:null,
      legacyProof:attempt.mode==='migrate'?tokenHash:null,inviteHash:attempt.invite_hash});
  }
  if (!identity?.session_hash) fail(401,'account_required');
  if (route==='/v1/auth/logout') {
    exact(data,[]);
    await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(identity.session_hash).run();
    return {ok:true};
  }
  if (route==='/v1/auth/rotate') {
    exact(data,[]);
    // Delete + replacement in one transaction; replaying the old token fails.
    const token=randomToken(),expiresAt=now()+SESSION_SECONDS;
    const result=await db.batch([
      db.prepare(`INSERT INTO sessions(token_hash,traveller_id,account_version,authenticated_at,expires_at)
        SELECT ?,traveller_id,account_version,authenticated_at,? FROM sessions WHERE token_hash=? AND expires_at>?`)
        .bind(await hash(token),expiresAt,identity.session_hash,now()),
      db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(identity.session_hash)
    ]);
    if (!result[0].meta.changes) fail(401,'invalid_credentials');
    return {token,expiresAt,profile:await profile(db,identity.id)};
  }
  fresh(identity);
  const a=await account(db,identity.id);
  if (a.version!==identity.account_version) fail(401,'sign_in_again');
  if (route==='/v1/account/name') {
    exact(data,['displayName']);
    await db.prepare('UPDATE profiles SET display_name=? WHERE traveller_id=? AND anonymised=0').bind(displayName(data.displayName),identity.id).run();
    return profile(db,identity.id);
  }
  if (route==='/v1/account/password') {
    exact(data,['currentPassword','username','password']);
    await throttle(db,`password:${identity.id}`,10);
    if (a.password_hash && (typeof data.currentPassword!=='string'||data.currentPassword.length>128||!passwordMatches(data.currentPassword,a.password_hash))) fail(401,'invalid_credentials');
    return changeCredentials(db,a,{username:username(data.username),passwordHash:passwordHash(password(data.password)),sub:a.google_sub,recoveryHash:a.recovery_hash},identity);
  }
  if (route==='/v1/account/recovery') {
    exact(data,[]);
    const recoveryKey=randomToken();
    return {...await changeCredentials(db,a,{username:a.username,passwordHash:a.password_hash,sub:a.google_sub,recoveryHash:await hash(recoveryKey)},identity),recoveryKey};
  }
  if (route==='/v1/account/anonymise') {
    exact(data,['confirmation']);
    if (data.confirmation!=='DELETE MY ACCOUNT') fail(400,'confirmation_required');
    await db.batch([
      db.prepare('DELETE FROM sessions WHERE traveller_id=?').bind(identity.id),
      db.prepare('DELETE FROM oauth_attempts WHERE traveller_id=?').bind(identity.id),
      db.prepare('DELETE FROM accounts WHERE traveller_id=?').bind(identity.id),
      db.prepare("UPDATE profiles SET display_name='Anonymous traveller',anonymised=1,legacy_enabled=0 WHERE traveller_id=?").bind(identity.id)
    ]);
    return {ok:true};
  }
  fail(404,'not_found');
}
