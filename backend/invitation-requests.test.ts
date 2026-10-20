import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, afterEach, expect, test, vi } from 'vitest';
import worker from './worker';
import {
  approveInvitationRequest, claimOutbox, listPendingInvitationRequests,
  expireInvitationRequests, recordInvitationIssued, recordInvitationIssuanceUnknown, recordOutboxResult,
  rejectInvitationRequest
} from './invitation-requests';

const localEnv = () => ({...env,
  INVITATION_REQUESTS_ENABLED:'true',
  TURNSTILE_SECRET:'local-test-secret',
  TURNSTILE_EXPECTED_HOSTNAME:'localhost',
  TURNSTILE_EXPECTED_ACTION:'invitation_request'
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

test('issuance ambiguity is explicit and cannot be silently retried or minted twice', async () => {
  turnstile();
  const input = valid({email:'unknown-issuance@example.test'}); await request(input);
  const row = await env.DB.prepare('SELECT id FROM invitation_requests WHERE email=?').bind(input.email).first<{id:string}>();
  await approveInvitationRequest(env.DB.withSession('first-primary'),row!.id,'paul-local-test');
  await recordInvitationIssuanceUnknown(env.DB.withSession('first-primary'),row!.id,'network_timeout');
  expect(await env.DB.prepare('SELECT issuance_state FROM invitation_request_approvals WHERE request_id=?').bind(row!.id).first('issuance_state')).toBe('UNKNOWN');
  await expect(recordInvitationIssued(env.DB.withSession('first-primary'),row!.id,crypto.randomUUID())).rejects.toThrow('issuance_not_pending');
});
