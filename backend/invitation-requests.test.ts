import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, afterEach, expect, test, vi } from 'vitest';
import worker from './worker';
import {
  approveInvitationRequest, claimOutbox, listPendingInvitationRequests,
  expireInvitationRequests, redactClosedInvitationRequests, recordInvitationIssued, recordInvitationIssuanceUnknown, recordOutboxResult,
  rejectInvitationRequest
} from './invitation-requests';
import { cloudflareEmailProvider, deliverOutbox, fakeMailProvider, ionosRelayProvider } from './invitation-mail';
import { invitationDigest } from './invitations';
import { randomToken } from './accounts';

const localEnv = () => ({...env,
  INVITATION_REQUESTS_ENABLED:'true',
  TURNSTILE_SECRET:'local-test-secret',
  TURNSTILE_EXPECTED_HOSTNAME:'localhost',
  TURNSTILE_EXPECTED_ACTION:'invitation_request',
  INVITATION_REQUEST_DEDUPE_SECRET:'local-only-dedupe-secret-32-bytes'
});
let sequence = 0;
function request(data: Record<string, unknown>, ip = `198.51.100.${++sequence}`) {
  return worker.fetch(new Request('http://api/v1/invitation-requests', {
    method:'POST', headers:{Origin:'http://localhost:4175','Content-Type':'application/json','CF-Connecting-IP':ip}, body:JSON.stringify(data)
  }), localEnv());
}
function valid(overrides: Record<string, unknown> = {}) {
  return {displayName:'A local traveller',email:`traveller-${++sequence}@example.test`,message:'Please let me visit.',privacyAccepted:true,turnstileToken:`turnstile-${sequence}`,...overrides};
}
function turnstile(success = true, overrides: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({success,hostname:'localhost',action:'invitation_request',challenge_ts:new Date().toISOString(),...overrides})));
}
beforeAll(async () => { await applyD1Migrations(env.DB, env.TEST_MIGRATIONS); });
afterEach(() => vi.unstubAllGlobals());

test('accepts a verified request, queues acknowledgement and review, and stores no Turnstile token', async () => {
  turnstile();
  const input = valid(), response = await request(input);
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({accepted:true,status:'pending_review',message:'Your request has been received for review.'});
  const row = await env.DB.prepare('SELECT display_name,email,message,status,turnstile_hash FROM invitation_requests WHERE email=?').bind(input.email).first<any>();
  expect(row).toMatchObject({display_name:input.displayName,email:input.email,message:input.message,status:'PENDING'});
  expect(row.turnstile_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(row)).not.toContain(input.turnstileToken as string);
  expect(await env.DB.prepare('SELECT kind,recipient,status FROM invitation_request_outbox WHERE request_id=(SELECT id FROM invitation_requests WHERE email=?) ORDER BY kind').bind(input.email).all()).toMatchObject({results:[
    {kind:'ACK',recipient:input.email,status:'PENDING'}, {kind:'REVIEW',recipient:'invitations@digiwongadude.com',status:'PENDING'}
  ]});
  const emailHash = await env.DB.prepare('SELECT email_hash FROM invitation_requests WHERE email=?').bind(input.email).first<{email_hash:string}>();
  expect(emailHash!.email_hash).not.toBe(await (async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`between:g5:invitation-request:email:v1:${input.email}`))),b=>b.toString(16).padStart(2,'0')).join(''))());
});

test('request and outbox rows are atomic if the outbox statement fails', async () => {
  await env.DB.prepare(`CREATE TRIGGER invitation_request_test_abort AFTER INSERT ON invitation_requests
    WHEN NEW.email='batch-failure@example.test' BEGIN SELECT RAISE(ABORT,'simulated_batch_failure'); END`).run();
  turnstile();
  expect((await request(valid({email:'batch-failure@example.test'}))).status).toBe(503);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM invitation_requests WHERE email='batch-failure@example.test'").first('n')).toBe(0);
  await env.DB.prepare('DROP TRIGGER invitation_request_test_abort').run();
});

test('duplicate email and replayed Turnstile token are neutral and do not create more mail', async () => {
  turnstile();
  const input = valid({email:'duplicate@example.test',turnstileToken:'same-turnstile'});
  expect((await request(input)).status).toBe(202);
  expect((await request({...input,displayName:'Different name'},'198.51.100.250')).status).toBe(202);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM invitation_requests WHERE email=?').bind(input.email).first('n')).toBe(1);
  expect(await env.DB.prepare(`SELECT count(*) AS n FROM invitation_request_outbox WHERE request_id=(SELECT id FROM invitation_requests WHERE email=?)`).bind(input.email).first('n')).toBe(2);
  const race = valid({email:'concurrent-duplicate@example.test'});
  const replies = await Promise.all([
    request(race,'198.51.100.251'), request({...race,turnstileToken:'different-turnstile'},'198.51.100.252')
  ]);
  expect(replies.map(reply => reply.status)).toEqual([202,202]);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM invitation_requests WHERE email=?').bind(race.email).first('n')).toBe(1);
  expect(await env.DB.prepare(`SELECT count(*) AS n FROM invitation_request_outbox WHERE request_id=(SELECT id FROM invitation_requests WHERE email=?)`).bind(race.email).first('n')).toBe(2);
});

test('Turnstile hostname, action, stale challenge and configuration failures reject before D1 request creation', async () => {
  turnstile(true,{hostname:'evil.example'});
  expect((await request(valid())).status).toBe(403);
  turnstile(true,{action:'other'});
  expect((await request(valid())).status).toBe(403);
  turnstile(true,{challenge_ts:new Date(Date.now()-6*60*1000).toISOString()});
  expect((await request(valid())).status).toBe(403);
  turnstile();
  const disabled = await worker.fetch(new Request('http://api/v1/invitation-requests',{method:'POST',headers:{Origin:'http://localhost:4175','Content-Type':'application/json'},body:JSON.stringify(valid())}),{...localEnv(),INVITATION_REQUESTS_ENABLED:'false'});
  expect(disabled.status).toBe(503);
  turnstile();
  const noDedupeSecret = await request(valid({email:'unconfigured-dedupe@example.test'}),'198.51.100.253');
  expect(noDedupeSecret.status).toBe(202);
  const noSecret = await worker.fetch(new Request('http://api/v1/invitation-requests',{method:'POST',headers:{Origin:'http://localhost:4175','Content-Type':'application/json','CF-Connecting-IP':'198.51.100.254'},body:JSON.stringify(valid({email:'unconfigured-dedupe-2@example.test'}))}),{...localEnv(),INVITATION_REQUEST_DEDUPE_SECRET:undefined});
  expect(noSecret.status).toBe(503);
});

test('validation, origin, method and privacy checks do not expose queue state', async () => {
  turnstile();
  expect((await request(valid({privacyAccepted:false}))).status).toBe(400);
  expect((await request(valid({email:'not-an-email'}))).status).toBe(400);
  const get = await worker.fetch(new Request('http://api/v1/invitation-requests',{headers:{Origin:'http://localhost:4175'}}),localEnv());
  expect(get.status).toBe(404);
  const evil = await worker.fetch(new Request('http://api/v1/invitation-requests',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify(valid())}),localEnv());
  expect(evil.status).toBe(403);
});

test('approval is private, idempotent, and produces exactly one invitation workflow item', async () => {
  turnstile();
  const input = valid({email:'approval@example.test'}); await request(input);
  const row = await env.DB.prepare('SELECT id FROM invitation_requests WHERE email=?').bind(input.email).first<{id:string}>();
  const first = await approveInvitationRequest(env.DB.withSession('first-primary'),row!.id,'paul-local-test');
  const second = await approveInvitationRequest(env.DB.withSession('first-primary'),row!.id,'paul-local-test');
  expect(second).toMatchObject(first);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM invitation_request_approvals WHERE request_id=?').bind(row!.id).first('n')).toBe(1);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM invitation_request_outbox WHERE request_id=? AND kind='INVITATION'").bind(row!.id).first('n')).toBe(1);
  expect(await listPendingInvitationRequests(env.DB.withSession('first-primary'))).not.toEqual(expect.arrayContaining([expect.objectContaining({id:row!.id})]));
  const publicAdmin = await worker.fetch(new Request(`http://api/v1/admin/invitation-requests/${row!.id}/approve`,{method:'POST',headers:{Origin:'http://localhost:4175','Content-Type':'application/json'},body:'{}'}),localEnv());
  expect(publicAdmin.status).toBe(401);
  const raced = valid({email:'approval-race@example.test'}); await request(raced);
  const racedRow = await env.DB.prepare('SELECT id FROM invitation_requests WHERE email=?').bind(raced.email).first<{id:string}>();
  const approvals = await Promise.all([
    approveInvitationRequest(env.DB.withSession('first-primary'),racedRow!.id,'paul-local-test'),
    approveInvitationRequest(env.DB.withSession('first-primary'),racedRow!.id,'paul-local-test')
  ]);
  expect(approvals[0]).toMatchObject(approvals[1]);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM invitation_request_approvals WHERE request_id=?').bind(racedRow!.id).first('n')).toBe(1);
});

test('fake provider runner delivers ACKs and invitations without persisting the token', async () => {
  turnstile();
  const input = valid({email:'fake-provider@example.test'}); await request(input);
  const row = await env.DB.prepare('SELECT id FROM invitation_requests WHERE email=?').bind(input.email).first<{id:string}>();
  const provider = fakeMailProvider();
  const ack = await env.DB.prepare("SELECT id FROM invitation_request_outbox WHERE request_id=? AND kind='ACK'").bind(row!.id).first<{id:string}>();
  expect((await deliverOutbox(env.DB.withSession('first-primary'),ack!.id,provider.provider))?.status).toBe('SENT');
  expect(await deliverOutbox(env.DB.withSession('first-primary'),ack!.id,provider.provider)).toBeNull();
  await approveInvitationRequest(env.DB.withSession('first-primary'),row!.id,'paul-local-test');
  const invitationOutbox = await env.DB.prepare("SELECT id FROM invitation_request_outbox WHERE request_id=? AND kind='INVITATION'").bind(row!.id).first<{id:string}>();
  const raw = randomToken(), invitationId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO invitations(id,token_hash,created_at,expires_at,operator_reference) VALUES(?,?,unixepoch(),unixepoch()+3600,?)').bind(invitationId,await invitationDigest(raw),'local-test').run();
  await recordInvitationIssued(env.DB.withSession('first-primary'),row!.id,invitationId);
  expect((await deliverOutbox(env.DB.withSession('first-primary'),invitationOutbox!.id,provider.provider,raw))?.status).toBe('SENT');
  expect(provider.calls).toHaveLength(2);
  expect(provider.calls[1].tokenLength).toBe(64);
  expect(JSON.stringify(await env.DB.prepare('SELECT * FROM invitation_request_outbox WHERE request_id=?').bind(row!.id).all())).not.toContain(raw);
});

test('IONOS HTTPS relay adapter is fixed-template, idempotent and never sends SMTP from the Worker', async () => {
  const calls: Array<{url:string;init:RequestInit}> = [];
  const provider = ionosRelayProvider({endpoint:'https://relay.example.test/ionos/send',relaySecret:'relay-fixture-secret-32-bytes',fetcher:async (url,init) => {
    calls.push({url:String(url),init});
    return Response.json({messageId:'ionos-fixture-1'},{status:202});
  }});
  const result = await provider.send({requestId:'11111111-1111-4111-8111-111111111111',kind:'ACK',templateKey:'invitation_request_received_v1',recipient:'traveller@example.test',idempotencyKey:'a'.repeat(64),attempts:1});
  expect(result).toEqual({outcome:'sent',providerMessageId:'ionos-fixture-1'});
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('https://relay.example.test/ionos/send');
  expect(calls[0].init.redirect).toBe('error');
  expect((calls[0].init.headers as Record<string,string>)['Idempotency-Key']).toBe('a'.repeat(64));
  const payload = JSON.parse(String(calls[0].init.body));
  expect(payload.from).toBe('invitations@digiwongadude.com');
  expect(payload.text).not.toContain('traveller@example.test');
  expect(calls[0].url).not.toContain('traveller@example.test');
});

test('IONOS relay treats rejection, timeout and missing receipts conservatively', async () => {
  const message = {requestId:'22222222-2222-4222-8222-222222222222',kind:'ACK' as const,templateKey:'invitation_request_received_v1',recipient:'traveller@example.test',idempotencyKey:'b'.repeat(64),attempts:1};
  const rejected = ionosRelayProvider({endpoint:'https://relay.example.test/send',relaySecret:'relay-fixture-secret-32-bytes',fetcher:async()=>new Response('no',{status:400})});
  expect(await rejected.send(message)).toEqual({outcome:'failed',errorCode:'ionos_relay_rejected'});
  const unknown = ionosRelayProvider({endpoint:'https://relay.example.test/send',relaySecret:'relay-fixture-secret-32-bytes',fetcher:async()=>new Response('busy',{status:503})});
  expect(await unknown.send(message)).toEqual({outcome:'unknown',errorCode:'ionos_relay_uncertain'});
  const noReceipt = ionosRelayProvider({endpoint:'https://relay.example.test/send',relaySecret:'relay-fixture-secret-32-bytes',fetcher:async()=>Response.json({accepted:true},{status:202})});
  expect(await noReceipt.send(message)).toEqual({outcome:'unknown',errorCode:'ionos_relay_no_receipt'});
  expect(()=>ionosRelayProvider({endpoint:'http://relay.example.test/send',relaySecret:'relay-fixture-secret-32-bytes'})).toThrow('ionos_relay_https_required');
});

test('native Cloudflare Email Service adapter pins the sender and keeps ACK content token-free', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const provider = cloudflareEmailProvider({send: async message => {
    calls.push(message);
    return {messageId:'cf-email-fixture-1'};
  }});
  const result = await provider.send({requestId:'33333333-3333-4333-8333-333333333333',kind:'ACK',templateKey:'invitation_request_received_v1',recipient:'traveller@example.test',idempotencyKey:'c'.repeat(64),attempts:1});
  expect(result).toEqual({outcome:'sent',providerMessageId:'cf-email-fixture-1'});
  expect(calls).toEqual([{to:'traveller@example.test',from:'invitations@digiwongadude.com',subject:'THE BETWEEN — request received',text:expect.not.stringContaining('traveller@example.test')}]);
});

test('native Cloudflare adapter handles restrictions, transient errors, missing receipts and invitation secrecy', async () => {
  const message = {requestId:'44444444-4444-4444-8444-444444444444',kind:'ACK' as const,templateKey:'invitation_request_received_v1',recipient:'traveller@example.test',idempotencyKey:'d'.repeat(64),attempts:1};
  const rejected = cloudflareEmailProvider({send: async () => { throw Object.assign(new Error('suppressed'),{code:'E_RECIPIENT_SUPPRESSED'}); }});
  expect(await rejected.send(message)).toEqual({outcome:'failed',errorCode:'cloudflare_recipient_suppressed'});
  const senderRestricted = cloudflareEmailProvider({send: async () => { throw Object.assign(new Error('sender'),{code:'E_SENDER_NOT_VERIFIED'}); }});
  expect(await senderRestricted.send(message)).toEqual({outcome:'failed',errorCode:'cloudflare_sender_not_verified'});
  const transient = cloudflareEmailProvider({send: async () => { throw Object.assign(new Error('busy'),{code:'E_RATE_LIMIT_EXCEEDED'}); }});
  expect(await transient.send(message)).toEqual({outcome:'unknown',errorCode:'cloudflare_rate_limited'});
  const timeout = cloudflareEmailProvider({send: async () => { throw new Error('connection closed after accept'); }});
  expect(await timeout.send(message)).toEqual({outcome:'unknown',errorCode:'cloudflare_email_exception'});
  const noReceipt = cloudflareEmailProvider({send: async () => ({messageId:''})});
  expect(await noReceipt.send(message)).toEqual({outcome:'unknown',errorCode:'cloudflare_email_no_receipt'});
  const invitationToken = 'e'.repeat(64), captured: Array<{text:string}> = [];
  const invitation = cloudflareEmailProvider({send: async payload => { captured.push(payload); return {messageId:'cf-invitation-1'}; }});
  expect(await invitation.send({...message,kind:'INVITATION',templateKey:'invitation_delivery_v1',privateToken:invitationToken})).toEqual({outcome:'sent',providerMessageId:'cf-invitation-1'});
  expect(captured[0].from).toBe('invitations@digiwongadude.com');
  expect(captured[0].text).toContain(invitationToken);
  expect(await invitation.send({...message,kind:'INVITATION',templateKey:'invitation_delivery_v1'})).toEqual({outcome:'failed',errorCode:'private_token_required'});
});

test('rejection is operator-only and approved issuance/delivery states are durable', async () => {
  turnstile();
  const approved = valid({email:'issued@example.test'}); await request(approved);
  const row = await env.DB.prepare('SELECT id FROM invitation_requests WHERE email=?').bind(approved.email).first<{id:string}>();
  await approveInvitationRequest(env.DB.withSession('first-primary'),row!.id,'paul-local-test');
  const outbox = await env.DB.prepare("SELECT id FROM invitation_request_outbox WHERE request_id=? AND kind='INVITATION'").bind(row!.id).first<{id:string}>();
  expect(await claimOutbox(env.DB.withSession('first-primary'),outbox!.id)).toBeNull();
  await recordInvitationIssued(env.DB.withSession('first-primary'),row!.id,crypto.randomUUID());
  const claimed = await claimOutbox(env.DB.withSession('first-primary'),outbox!.id); expect(claimed?.status).toBe('SENDING');
  await recordOutboxResult(env.DB.withSession('first-primary'),outbox!.id,{outcome:'unknown',errorCode:'provider_timeout'});
  expect(await env.DB.prepare('SELECT delivery_state FROM invitation_request_approvals WHERE request_id=?').bind(row!.id).first('delivery_state')).toBe('UNKNOWN');

  const rejected = valid({email:'rejected@example.test'}); await request(rejected);
  const rejectedRow = await env.DB.prepare('SELECT id FROM invitation_requests WHERE email=?').bind(rejected.email).first<{id:string}>();
  expect(await rejectInvitationRequest(env.DB.withSession('first-primary'),rejectedRow!.id,'paul-local-test')).toEqual({requestId:rejectedRow!.id,status:'REJECTED'});
});

test('definitive mail failure can be retried, while request abuse is bounded', async () => {
  turnstile();
  const input = valid({email:'retry@example.test'}); await request(input);
  const row = await env.DB.prepare('SELECT id FROM invitation_requests WHERE email=?').bind(input.email).first<{id:string}>();
  const outbox = await env.DB.prepare("SELECT id FROM invitation_request_outbox WHERE request_id=? AND kind='ACK'").bind(row!.id).first<{id:string}>();
  const first = await claimOutbox(env.DB.withSession('first-primary'),outbox!.id); expect(first?.template_key).toBe('invitation_request_received_v1');
  await recordOutboxResult(env.DB.withSession('first-primary'),outbox!.id,{outcome:'failed',errorCode:'provider_rejected'});
  expect((await claimOutbox(env.DB.withSession('first-primary'),outbox!.id))?.attempts).toBe(2);

  for (let i=0;i<5;i++) expect((await request(valid({email:`abuse-${i}@example.test`}),`203.0.113.250`)).status).toBe(202);
  expect((await request(valid({email:'abuse-sixth@example.test'}),'203.0.113.250')).status).toBe(429);
});

test('pending requests can expire for retention and the same email can later request again', async () => {
  turnstile();
  const input = valid({email:'expired@example.test'}); await request(input);
  const row = await env.DB.prepare('SELECT id FROM invitation_requests WHERE email=?').bind(input.email).first<{id:string}>();
  await env.DB.prepare("UPDATE invitation_requests SET created_at=unixepoch()-2592001 WHERE id=?").bind(row!.id).run();
  expect(await expireInvitationRequests(env.DB.withSession('first-primary'),2592000)).toEqual({expired:1});
  expect(await env.DB.prepare('SELECT status FROM invitation_requests WHERE id=?').bind(row!.id).first('status')).toBe('EXPIRED');
  expect((await request(valid({email:input.email,turnstileToken:'fresh-expiry-token'}),'198.51.100.254')).status).toBe(202);
});

test('closed request PII is redacted after retention while audit status remains', async () => {
  turnstile();
  const input = valid({email:'redact-me@example.test',message:'private note'}); await request(input);
  const row = await env.DB.prepare('SELECT id FROM invitation_requests WHERE email=?').bind(input.email).first<{id:string}>();
  await rejectInvitationRequest(env.DB.withSession('first-primary'),row!.id,'paul-local-test');
  await env.DB.prepare('UPDATE invitation_requests SET created_at=unixepoch()-7776002, reviewed_at=unixepoch()-7776001 WHERE id=?').bind(row!.id).run();
  expect(await redactClosedInvitationRequests(env.DB.withSession('first-primary'),90*86400)).toEqual({redacted:1});
  const redacted = await env.DB.prepare('SELECT display_name,email,message,status FROM invitation_requests WHERE id=?').bind(row!.id).first<any>();
  expect(redacted).toEqual({display_name:'Redacted request',email:'redacted@invalid',message:'',status:'REJECTED'});
  expect(JSON.stringify(await env.DB.prepare('SELECT recipient FROM invitation_request_outbox WHERE request_id=?').bind(row!.id).all())).not.toContain(input.email);
});

test('local end-to-end request to account gate uses one private invitation token', async () => {
  turnstile();
  const input = valid({email:'e2e-gate@example.test'}); expect((await request(input)).status).toBe(202);
  const row = await env.DB.prepare('SELECT id FROM invitation_requests WHERE email=?').bind(input.email).first<{id:string}>();
  await approveInvitationRequest(env.DB.withSession('first-primary'),row!.id,'paul-local-test');
  const invitationId = crypto.randomUUID(), raw = randomToken();
  await env.DB.prepare('INSERT INTO invitations(id,token_hash,created_at,expires_at,operator_reference) VALUES(?,?,unixepoch(),unixepoch()+3600,?)').bind(invitationId,await invitationDigest(raw),'local-e2e').run();
  await recordInvitationIssued(env.DB.withSession('first-primary'),row!.id,invitationId);
  const cfg = {...localEnv(),ACCOUNTS_ENABLED:'true',REGISTRATION_ENABLED:'true',MAX_TRAVELLERS:'1000'};
  const signup = (username:string, invitation:string) => worker.fetch(new Request('http://api/v1/auth/signup',{method:'POST',headers:{Origin:'http://localhost:4175','Content-Type':'application/json','CF-Connecting-IP':`198.51.100.${++sequence}`},body:JSON.stringify({username,password:'A local e2e password 123!',displayName:'E2E traveller',invitation})}),cfg);
  expect((await signup(`e2e_${++sequence}`,raw)).status).toBe(200);
  expect((await signup(`e2e_${++sequence}`,raw)).status).toBe(403);
  expect(JSON.stringify(await env.DB.prepare('SELECT token_hash FROM invitations WHERE id=?').bind(invitationId).first())).not.toContain(raw);
});

test('issuance ambiguity is explicit and cannot be silently retried or minted twice', async () => {
  turnstile();
  const input = valid({email:'unknown-issuance@example.test'}); await request(input);
  const row = await env.DB.prepare('SELECT id FROM invitation_requests WHERE email=?').bind(input.email).first<{id:string}>();
  await approveInvitationRequest(env.DB.withSession('first-primary'),row!.id,'paul-local-test');
  await recordInvitationIssuanceUnknown(env.DB.withSession('first-primary'),row!.id,'network_timeout');
  expect(await env.DB.prepare('SELECT issuance_state FROM invitation_request_approvals WHERE request_id=?').bind(row!.id).first('issuance_state')).toBe('UNKNOWN');
  await expect(recordInvitationIssued(env.DB.withSession('first-primary'),row!.id,crypto.randomUUID())).rejects.toThrow('issuance_not_pending');
});
