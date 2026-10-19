// Schema/transaction tests. HTTP enforcement is exercised separately.
import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, expect, test } from 'vitest';
import { randomToken } from './accounts';
import { hash } from './http';

const db = () => env.DB.withSession('first-primary');
const legacy = new Map<string, {id:string; tokenHash:string}>();
const ledgerTables = ['travellers','profiles','accounts','sessions','visits','discoveries','commands'];
const admissionTables = [...ledgerTables,'invitations','invitation_redemptions','legacy_upgrade_eligibility','legacy_upgrade_proofs','oauth_attempts'];
async function snapshot(tables=admissionTables) {
  const result = {};
  // Names are fixed test constants, never request input.
  for (const table of tables) result[table] = (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
  return result;
}
let beforeMigration;
beforeAll(async()=>{
  await applyD1Migrations(env.DB,env.TEST_MIGRATIONS.slice(0,3));
  for (const key of ['history','race','stale','guard','rollback','changed','disabled','anonymous','account']) {
    const entry={id:crypto.randomUUID(),tokenHash:await hash(randomToken())};
    legacy.set(key,entry);
    await env.DB.prepare('INSERT INTO travellers(id,token_hash) VALUES(?,?)').bind(entry.id,entry.tokenHash).run();
  }
  await env.DB.prepare('UPDATE profiles SET legacy_enabled=0 WHERE traveller_id=?').bind(legacy.get('disabled').id).run();
  await env.DB.prepare('UPDATE profiles SET anonymised=1 WHERE traveller_id=?').bind(legacy.get('anonymous').id).run();
  await env.DB.prepare('INSERT INTO accounts(traveller_id,google_sub,recovery_hash) VALUES(?,?,?)')
    .bind(legacy.get('account').id,'existing-google',await hash(randomToken())).run();
  const id=legacy.get('history').id;
  await env.DB.prepare("INSERT INTO visits(traveller_id,path,canonical_path,a,b,c) VALUES(?,'ROOT','g5:2,2,3:ROOT',2,2,3)").bind(id).run();
  await env.DB.prepare(`INSERT INTO commands(traveller_id,request_id,expected_revision,action,door,result_path,parent_path,a,b,c)
    VALUES(?,?,0,'advance',0,'0','ROOT',3,3,5)`).bind(id,crypto.randomUUID()).run();
  await env.DB.prepare(`INSERT INTO oauth_attempts(state_hash,challenge,nonce_hash,origin,mode,display_name,expires_at)
    VALUES(?,'fixture-challenge',?,'http://localhost:4175','login','Old flow',unixepoch()+600)`)
    .bind(await hash(randomToken()),await hash(randomToken())).run();
  beforeMigration=await snapshot(ledgerTables);
  await applyD1Migrations(env.DB,env.TEST_MIGRATIONS);
});

async function invite(options:{created?:number;expires?:number;revoked?:number|null}={}) {
  const time=await env.DB.prepare('SELECT unixepoch() AS t').first<number>('t');
  const token=randomToken(),digest=await hash(`between:g5:staging:invite:v1:${token}`),id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO invitations(id,token_hash,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?)')
    .bind(id,digest,options.created??time,options.expires??time+172800,options.revoked??null).run();
  return {id,digest,token};
}
function accountInsert(session,id,username=crypto.randomUUID().replaceAll('-',''),sub=null) {
  return session.prepare('INSERT INTO accounts(traveller_id,username,password_hash,google_sub,recovery_hash) VALUES(?,?,?,?,?)')
    .bind(id,sub?null:username,sub?null:'test-only-hash',sub,crypto.randomUUID());
}
function sessionInsert(session,id) {
  return session.prepare(`INSERT INTO sessions(token_hash,traveller_id,account_version,authenticated_at,expires_at)
    VALUES(?,?,1,unixepoch(),unixepoch()+43200)`).bind(crypto.randomUUID(),id);
}
// Explicit proposed batch shape under test. Real route code must reuse the
// contract, validate credentials/provider identity and derive the digest itself.
function admission(digest,options:{id?:string;username?:string;sub?:string;cap?:number;advance?:boolean}={}) {
  const session=db(),id=options.id??crypto.randomUUID();
  const statements=[
    session.prepare('INSERT INTO travellers(id,token_hash) SELECT ?,? WHERE (SELECT count(*) FROM travellers)<?')
      .bind(id,crypto.randomUUID(),options.cap??10000),
    session.prepare('INSERT INTO invitation_redemptions(invite_hash,traveller_id) VALUES(?,?)').bind(digest,id),
    accountInsert(session,id,options.username,options.sub),
    session.prepare("INSERT INTO visits(traveller_id,path,canonical_path,a,b,c) VALUES(?,'ROOT','g5:2,2,3:ROOT',2,2,3)").bind(id)
  ];
  if(options.advance)statements.push(
    session.prepare(`INSERT INTO commands(traveller_id,request_id,expected_revision,action,door,result_path,parent_path,a,b,c)
      VALUES(?,?,0,'advance',0,'0','ROOT',3,3,5)`).bind(id,crypto.randomUUID()),
    session.prepare(`INSERT INTO commands(traveller_id,request_id,expected_revision,action,door,result_path,parent_path,a,b,c)
      VALUES(?,?,1,'advance',0,'00','0',3,3,7)`).bind(id,crypto.randomUUID())
  );
  statements.push(sessionInsert(session,id));
  return {id,run:()=>session.batch(statements)};
}
function upgrade(key,proof=legacy.get(key).tokenHash,sub=null) {
  const {id}=legacy.get(key),session=db();
  return session.batch([
    session.prepare('INSERT INTO legacy_upgrade_proofs(traveller_id,token_hash) VALUES(?,?)').bind(id,proof),
    accountInsert(session,id,undefined,sub),sessionInsert(session,id)
  ]);
}

test('candidate migration preserves populated ledger/credentials and snapshots only eligible legacy users',async()=>{
  expect(await snapshot(ledgerTables)).toEqual(beforeMigration);
  const rows=(await env.DB.prepare('SELECT traveller_id FROM legacy_upgrade_eligibility').all()).results;
  expect(rows.map(r=>r.traveller_id).sort()).toEqual(['history','race','stale','guard','rollback','changed'].map(k=>legacy.get(k).id).sort());
  expect(await env.DB.prepare('SELECT invite_hash FROM oauth_attempts').first('invite_hash')).toBeNull();
  const before=await snapshot();
  await applyD1Migrations(env.DB,env.TEST_MIGRATIONS);
  expect(await snapshot()).toEqual(before);
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});

test('only digests persist; successful admission commits traveller, redemption, account, root and session together',async()=>{
  const i=await invite(),a=admission(i.digest);
  await a.run();
  expect(await env.DB.prepare('SELECT traveller_id FROM invitation_redemptions WHERE invite_hash=?').bind(i.digest).first('traveller_id')).toBe(a.id);
  for(const table of ['accounts','sessions','visits'])expect(await env.DB.prepare(`SELECT count(*) AS n FROM ${table} WHERE traveller_id=?`).bind(a.id).first('n')).toBe(1);
  expect(await env.DB.prepare('SELECT legacy_enabled FROM profiles WHERE traveller_id=?').bind(a.id).first('legacy_enabled')).toBe(0);
  expect(JSON.stringify(await snapshot())).not.toContain(i.token);
  expect(await env.DB.prepare("SELECT first_traveller_id FROM discoveries WHERE path='ROOT'").first('first_traveller_id')).toBe(legacy.get('history').id);
});

test('missing, unknown, exactly-expired, expired, revoked and future-created invitations roll back all admission writes',async()=>{
  const time=await env.DB.prepare('SELECT unixepoch() AS t').first<number>('t');
  const cases=[null,await hash(randomToken()),
    (await invite({created:time-100,expires:time})).digest,
    (await invite({created:time-100,expires:time-1})).digest,
    (await invite({revoked:time})).digest,
    (await invite({created:time+3600,expires:time+7200})).digest];
  for(const value of cases){
    const before=await snapshot();
    await expect(admission(value).run()).rejects.toThrow('invitation_unavailable');
    expect(await snapshot()).toEqual(before);
  }
});

test.each(['password/password','Google/Google','password/Google'])('same invitation race has one transaction winner: %s',async(kind)=>{
  const i=await invite(),[left,right]=kind.split('/');
  const a=admission(i.digest,{sub:left==='Google'?crypto.randomUUID():undefined});
  const b=admission(i.digest,{sub:right==='Google'?crypto.randomUUID():undefined});
  const before=await env.DB.prepare('SELECT count(*) AS n FROM travellers').first<number>('n');
  const results=await Promise.allSettled([a.run(),b.run()]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM travellers').first('n')).toBe(before+1);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM invitation_redemptions WHERE invite_hash=?').bind(i.digest).first('n')).toBe(1);
  const winner=results[0].status==='fulfilled'?a:b,loser=winner===a?b:a;
  expect(await env.DB.prepare('SELECT traveller_id FROM sessions WHERE traveller_id=?').bind(winner.id).first('traveller_id')).toBe(winner.id);
  expect(await env.DB.prepare('SELECT id FROM travellers WHERE id=?').bind(loser.id).first()).toBeNull();
});

test('different invitations racing for the same username leave losing invitation reusable',async()=>{
  const first=await invite(),second=await invite(),username=crypto.randomUUID().replaceAll('-','');
  const results=await Promise.allSettled([admission(first.digest,{username}).run(),admission(second.digest,{username}).run()]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const loser=results[0].status==='rejected'?first:second;
  expect(await env.DB.prepare('SELECT * FROM invitation_redemptions WHERE invite_hash=?').bind(loser.digest).first()).toBeNull();
  await admission(loser.digest).run();
});

test('Google subject uniqueness conflict also rolls redemption back',async()=>{
  const a=await invite(),b=await invite(),sub=crypto.randomUUID();
  await admission(a.digest,{sub}).run();
  const before=await snapshot();
  await expect(admission(b.digest,{sub}).run()).rejects.toThrow('UNIQUE constraint');
  expect(await snapshot()).toEqual(before);
  await admission(b.digest,{sub:crypto.randomUUID()}).run();
});

test('cap exhaustion cannot silently skip traveller insertion and spend an invitation',async()=>{
  const i=await invite(),cap=await env.DB.prepare('SELECT count(*) AS n FROM travellers').first<number>('n');
  const before=await snapshot();
  await expect(admission(i.digest,{cap}).run()).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
  await admission(i.digest,{cap:cap+1}).run();
});

test('competing invitations for the final cap slot commit one account and leave the loser unspent',async()=>{
  const first=await invite(),second=await invite();
  const count=await env.DB.prepare('SELECT count(*) AS n FROM travellers').first<number>('n');
  const results=await Promise.allSettled([
    admission(first.digest,{cap:count+1}).run(),admission(second.digest,{cap:count+1}).run()
  ]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM travellers').first('n')).toBe(count+1);
  const loser=results[0].status==='rejected'?first:second;
  expect(await env.DB.prepare('SELECT * FROM invitation_redemptions WHERE invite_hash=?').bind(loser.digest).first()).toBeNull();
  await admission(loser.digest,{cap:count+2}).run();
});

test('session failure rolls back redemption, profile, account, visits, commands and discoveries',async()=>{
  const i=await invite(),a=admission(i.digest,{advance:true});
  // Unlike ROOT/0, this path has no earlier discoverer: failure must also undo
  // a genuinely new shared-discovery row, not only private contributions.
  expect(await env.DB.prepare("SELECT * FROM discoveries WHERE path='00'").first()).toBeNull();
  // Locally generated UUID only, no application input or credentials in DDL.
  await env.DB.exec(`CREATE TRIGGER test_invite_session_failure BEFORE INSERT ON sessions WHEN NEW.traveller_id='${a.id}' BEGIN SELECT RAISE(ABORT,'injected_session_failure'); END;`);
  const before=await snapshot();
  try{
    await expect(a.run()).rejects.toThrow('injected_session_failure');
    expect(await snapshot()).toEqual(before);
  }finally{await env.DB.exec('DROP TRIGGER test_invite_session_failure');}
  await a.run();
  expect(await env.DB.prepare("SELECT first_traveller_id FROM discoveries WHERE path='00'").first('first_traveller_id')).toBe(a.id);
});

test('revocation after availability precheck is rechecked inside the redemption batch',async()=>{
  const i=await invite();
  expect(await env.DB.prepare('SELECT id FROM invitations WHERE token_hash=? AND expires_at>unixepoch() AND revoked_at IS NULL').bind(i.digest).first('id')).toBe(i.id);
  const a=admission(i.digest);
  await env.DB.prepare('UPDATE invitations SET revoked_at=unixepoch() WHERE id=?').bind(i.id).run();
  const before=await snapshot();
  await expect(a.run()).rejects.toThrow('invitation_unavailable');
  expect(await snapshot()).toEqual(before);
});

test('real database clock expiry between precheck and redemption rejects without partial writes',async()=>{
  const time=await env.DB.prepare('SELECT unixepoch() AS t').first<number>('t');
  const i=await invite({created:time,expires:time+2});
  expect(await env.DB.prepare('SELECT id FROM invitations WHERE token_hash=? AND expires_at>unixepoch()').bind(i.digest).first('id')).toBe(i.id);
  // Do not mock Date.now: the trigger must use SQLite's clock, not the client.
  const deadline=Date.now()+4000;
  while(await env.DB.prepare('SELECT unixepoch() AS t').first<number>('t')<time+2){
    if(Date.now()>deadline)throw new Error('Local database clock did not advance');
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  const before=await snapshot();
  await expect(admission(i.digest).run()).rejects.toThrow('invitation_unavailable');
  expect(await snapshot()).toEqual(before);
});

test('direct accounts require redemption or fresh proof, not mere snapshot membership',async()=>{
  const session=db();
  for(const key of ['guard','disabled','anonymous'])await expect(accountInsert(session,legacy.get(key).id).run()).rejects.toThrow('admission_required');
  const id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO travellers(id,token_hash) VALUES(?,?)').bind(id,await hash(randomToken())).run();
  await expect(accountInsert(session,id).run()).rejects.toThrow('admission_required');
  await expect(env.DB.prepare('INSERT INTO legacy_upgrade_eligibility(traveller_id) VALUES(?)').bind(id).run()).rejects.toThrow('sealed_legacy_snapshot');
  await expect(env.DB.prepare('UPDATE legacy_upgrade_eligibility SET traveller_id=? WHERE traveller_id=?').bind(id,legacy.get('guard').id).run()).rejects.toThrow('sealed_legacy_snapshot');
  expect(await env.DB.prepare('SELECT legacy_enabled FROM profiles WHERE traveller_id=?').bind(id).first('legacy_enabled')).toBe(0);
});

test('legitimate legacy upgrade preserves ID, path, public profile and all discovery history',async()=>{
  const {id,tokenHash}=legacy.get('history');
  const before=await snapshot(['visits','discoveries','commands']);
  const profile=await env.DB.prepare('SELECT public_id FROM profiles WHERE traveller_id=?').bind(id).first('public_id');
  await upgrade('history');
  expect(await snapshot(['visits','discoveries','commands'])).toEqual(before);
  expect(await env.DB.prepare('SELECT active_path,revision FROM travellers WHERE id=?').bind(id).first()).toEqual({active_path:'0',revision:1});
  expect(await env.DB.prepare('SELECT public_id,legacy_enabled FROM profiles WHERE traveller_id=?').bind(id).first()).toEqual({public_id:profile,legacy_enabled:0});
  expect(await env.DB.prepare('SELECT token_hash FROM travellers WHERE id=?').bind(id).first('token_hash')).not.toBe(tokenHash);
  for(const table of ['legacy_upgrade_eligibility','legacy_upgrade_proofs'])expect(await env.DB.prepare(`SELECT * FROM ${table} WHERE traveller_id=?`).bind(id).first()).toBeNull();
});

test('concurrent password and Google legacy upgrades have one winner without invite or ownership changes',async()=>{
  const before=await snapshot(['visits','discoveries','commands']);
  const results=await Promise.allSettled([upgrade('race'),upgrade('race',undefined,crypto.randomUUID())]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM accounts WHERE traveller_id=?').bind(legacy.get('race').id).first('n')).toBe(1);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM sessions WHERE traveller_id=?').bind(legacy.get('race').id).first('n')).toBe(1);
  expect(await snapshot(['visits','discoveries','commands'])).toEqual(before);
});

test('forged or stale legacy credential cannot claim eligibility after an earlier identity read',async()=>{
  const entry=legacy.get('stale');
  await expect(upgrade('stale',await hash(randomToken()))).rejects.toThrow('legacy_proof_invalid');
  await env.DB.prepare('UPDATE travellers SET token_hash=? WHERE id=?').bind(await hash(randomToken()),entry.id).run();
  const before=await snapshot();
  await expect(upgrade('stale')).rejects.toThrow('legacy_proof_invalid');
  expect(await snapshot()).toEqual(before);
  for(const key of ['disabled','anonymous','account'])await expect(upgrade(key)).rejects.toThrow('legacy_proof_invalid');
});

test('proof is revalidated at account INSERT even if credential changes after proof insertion',async()=>{
  const entry=legacy.get('changed'),session=db(),before=await snapshot();
  await expect(session.batch([
    session.prepare('INSERT INTO legacy_upgrade_proofs(traveller_id,token_hash) VALUES(?,?)').bind(entry.id,entry.tokenHash),
    session.prepare('UPDATE travellers SET token_hash=? WHERE id=?').bind(await hash(randomToken()),entry.id),
    accountInsert(session,entry.id)
  ])).rejects.toThrow('admission_required');
  expect(await snapshot()).toEqual(before);
});

test('failed legacy upgrade restores eligibility and old credential and leaves no proof',async()=>{
  const {id}=legacy.get('rollback');
  await env.DB.exec(`CREATE TRIGGER test_upgrade_session_failure BEFORE INSERT ON sessions WHEN NEW.traveller_id='${id}' BEGIN SELECT RAISE(ABORT,'injected_upgrade_failure'); END;`);
  const before=await snapshot();
  try{
    await expect(upgrade('rollback')).rejects.toThrow('injected_upgrade_failure');
    expect(await snapshot()).toEqual(before);
  }finally{await env.DB.exec('DROP TRIGGER test_upgrade_session_failure');}
  await upgrade('rollback');
});

test('anonymisation preserves spent marker and prevents recreation or invitation reuse',async()=>{
  const i=await invite(),a=admission(i.digest);await a.run();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE traveller_id=?').bind(a.id),
    env.DB.prepare('DELETE FROM accounts WHERE traveller_id=?').bind(a.id),
    env.DB.prepare("UPDATE profiles SET display_name='Anonymous traveller',anonymised=1,legacy_enabled=0 WHERE traveller_id=?").bind(a.id)
  ]);
  const before=await snapshot();
  await expect(admission(i.digest).run()).rejects.toThrow('UNIQUE constraint');
  await expect(accountInsert(db(),a.id).run()).rejects.toThrow('admission_required');
  await expect(env.DB.prepare('DELETE FROM invitation_redemptions WHERE invite_hash=?').bind(i.digest).run()).rejects.toThrow('immutable_redemption');
  await expect(env.DB.prepare('UPDATE invitation_redemptions SET redeemed_at=0 WHERE invite_hash=?').bind(i.digest).run()).rejects.toThrow('immutable_redemption');
  await expect(env.DB.prepare('DELETE FROM invitations WHERE id=?').bind(i.id).run()).rejects.toThrow('FOREIGN KEY constraint');
  expect(await snapshot()).toEqual(before);
});

test('invitation timestamp/digest constraints and irreversible revocation fail closed',async()=>{
  await expect(invite({created:100,expires:100+604801})).rejects.toThrow('CHECK constraint');
  await expect(invite({created:100,expires:100})).rejects.toThrow('CHECK constraint');
  await expect(env.DB.prepare('INSERT INTO invitations(id,token_hash,expires_at) VALUES(?,?,unixepoch()+172800)').bind(crypto.randomUUID(),'not-a-digest').run()).rejects.toThrow('CHECK constraint');
  const i=await invite();
  await env.DB.prepare('UPDATE invitations SET revoked_at=unixepoch() WHERE id=?').bind(i.id).run();
  await expect(env.DB.prepare('UPDATE invitations SET revoked_at=NULL WHERE id=?').bind(i.id).run()).rejects.toThrow('immutable_invitation');
  await expect(env.DB.prepare('UPDATE invitations SET expires_at=expires_at+1 WHERE id=?').bind(i.id).run()).rejects.toThrow('immutable_invitation');
  await expect(env.DB.prepare('UPDATE invitations SET token_hash=? WHERE id=?').bind(await hash(randomToken()),i.id).run()).rejects.toThrow('immutable_invitation');
});
