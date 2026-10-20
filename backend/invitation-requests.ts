import { body, exact, fail, hash } from './http';
import type { AccountEnv } from './accounts';

type DB = D1DatabaseSession;
export type InvitationRequestEnv = AccountEnv & {
  TURNSTILE_SECRET?: string;
  TURNSTILE_EXPECTED_HOSTNAME?: string;
  TURNSTILE_EXPECTED_ACTION?: string;
  INVITATION_REQUESTS_ENABLED?: string;
};
type TurnstileReply = { success?: boolean; hostname?: string; action?: string; challenge_ts?: string };
type RequestRow = { id:string; display_name:string; email:string; message:string; status:string; created_at:number };
type OutboxRow = { id:string; request_id:string; kind:'ACK'|'REVIEW'|'INVITATION'; template_key:string; recipient:string; status:string; idempotency_key:string; attempts:number };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const now = () => Math.floor(Date.now() / 1000);
const normalise = (value: string) => value.trim().normalize('NFC');
const genericReceipt = Object.freeze({ accepted: true, status: 'pending_review', message: 'Your request has been received for review.' });

function displayName(value: unknown) {
  if (typeof value !== 'string') fail(400, 'invalid_display_name');
  const name = normalise(value);
  if (!/^[\p{L}\p{N} _.'-]{1,40}$/u.test(name)) fail(400, 'invalid_display_name');
  return name;
}
function email(value: unknown) {
  if (typeof value !== 'string') fail(400, 'invalid_email');
  const result = normalise(value).toLowerCase();
  if (result.length > 254 || !EMAIL.test(result) || /[\u0000-\u001f\u007f]/.test(result)) fail(400, 'invalid_email');
  return result;
}
function message(value: unknown) {
  if (value === undefined) return '';
  if (typeof value !== 'string') fail(400, 'invalid_message');
  const result = normalise(value);
  if (result.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) fail(400, 'invalid_message');
  return result;
}
function uuid(value: unknown, code = 'invalid_request_id') {
  if (typeof value !== 'string' || !UUID.test(value)) fail(400, code);
  return value;
}
function code(value: unknown) {
  if (typeof value !== 'string' || !/^[a-z0-9_]{1,64}$/.test(value)) return 'provider_error';
  return value;
}
function enabled(env: InvitationRequestEnv) {
  if (String(env.INVITATION_REQUESTS_ENABLED) !== 'true') fail(503, 'invitation_requests_disabled');
}
function requireConfig(env: InvitationRequestEnv) {
  if (!env.TURNSTILE_SECRET || !env.TURNSTILE_EXPECTED_HOSTNAME || !env.TURNSTILE_EXPECTED_ACTION) fail(503, 'turnstile_unconfigured');
}

async function verifyTurnstile(request: Request, env: InvitationRequestEnv, token: string) {
  requireConfig(env);
  if (token.length < 1 || token.length > 2048 || /[\u0000-\u001f\u007f]/.test(token)) fail(403, 'turnstile_failed');
  let response: Response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET!, response: token, remoteip: request.headers.get('CF-Connecting-IP') || '' })
    });
  } catch { fail(503, 'turnstile_unavailable'); }
  if (!response.ok) fail(503, 'turnstile_unavailable');
  let result: TurnstileReply;
  try { result = await response.json() as TurnstileReply; } catch { fail(503, 'turnstile_unavailable'); }
  if (result.success !== true || result.hostname !== env.TURNSTILE_EXPECTED_HOSTNAME || result.action !== env.TURNSTILE_EXPECTED_ACTION) fail(403, 'turnstile_failed');
  if (typeof result.challenge_ts !== 'string' || !Number.isFinite(Date.parse(result.challenge_ts)) || Date.parse(result.challenge_ts) < Date.now() - 5 * 60 * 1000 || Date.parse(result.challenge_ts) > Date.now() + 60 * 1000) fail(403, 'turnstile_failed');
  return hash(`between:g5:turnstile:v1:${token}`);
}

async function throttle(db: DB, kind: 'ip'|'email', value: string, max: number, seconds: number) {
  const bucket = Math.floor(now() / seconds);
  const key = await hash(`between:g5:request-limit:${kind}:${value}:${bucket}`);
  const row = await db.prepare(`INSERT INTO invitation_request_limits(key_hash,attempts,expires_at) VALUES(?,1,?)
    ON CONFLICT(key_hash) DO UPDATE SET attempts=attempts+1 RETURNING attempts`).bind(key, (bucket + 1) * seconds).first<{attempts:number}>();
  if (!row || row.attempts > max) fail(429, 'rate_limited');
}

export async function invitationRequestRoute(request: Request, env: InvitationRequestEnv, db: DB, ip: string) {
  enabled(env);
  if (request.method !== 'POST') fail(404, 'not_found');
  const data = await body(request);
  exact(data, ['displayName','email','privacyAccepted','turnstileToken'], ['message']);
  const name = displayName(data.displayName), address = email(data.email), note = message(data.message);
  if (data.privacyAccepted !== true) fail(400, 'privacy_acknowledgement_required');
  if (typeof data.turnstileToken !== 'string') fail(403, 'turnstile_failed');
  await throttle(db, 'ip', ip, 5, 3600);
  const turnstileHash = await verifyTurnstile(request, env, data.turnstileToken);
  const emailHash = await hash(`between:g5:invitation-request:email:v1:${address}`);
  // Check active email/token identities before counters. A duplicate must be
  // privacy-preserving and must not be turned into a rate-limit oracle.
  const duplicate = await db.prepare(`SELECT id FROM invitation_requests
    WHERE (email_hash=? AND status IN ('PENDING','APPROVED')) OR turnstile_hash=? LIMIT 1`).bind(emailHash,turnstileHash).first<{id:string}>();
  if (duplicate) return genericReceipt;
  await throttle(db, 'email', emailHash, 3, 86400);
  const id = crypto.randomUUID(), ackId = crypto.randomUUID(), reviewId = crypto.randomUUID();
  const ackKey = await hash(`between:g5:outbox:ack:${id}`), reviewKey = await hash(`between:g5:outbox:review:${id}`);
  try {
    const result = await db.batch([
      db.prepare(`INSERT INTO invitation_requests(id,display_name,email,email_hash,message,turnstile_hash,privacy_accepted_at)
        VALUES(?,?,?,?,?,?,unixepoch()) ON CONFLICT DO NOTHING`).bind(id,name,address,emailHash,note,turnstileHash),
      db.prepare(`INSERT INTO invitation_request_outbox(id,request_id,kind,template_key,recipient,idempotency_key)
        SELECT ?,id,'ACK','invitation_request_received_v1',email,? FROM invitation_requests
        WHERE id=? AND turnstile_hash=? ON CONFLICT DO NOTHING`).bind(ackId,ackKey,id,turnstileHash),
      db.prepare(`INSERT INTO invitation_request_outbox(id,request_id,kind,template_key,recipient,idempotency_key)
        SELECT ?,id,'REVIEW','invitation_request_review_v1','invitations@digiwongadude.com',? FROM invitation_requests
        WHERE id=? AND turnstile_hash=? ON CONFLICT DO NOTHING`).bind(reviewId,reviewKey,id,turnstileHash)
    ]);
    // A duplicate request is deliberately indistinguishable to the caller. The
    // batch is atomic, so an insert conflict cannot leave new outbox mail.
    if (!result[0].meta.changes) return genericReceipt;
  } catch (error) {
    const text = String(error);
    if (/UNIQUE constraint failed: invitation_requests\.email_hash|UNIQUE constraint failed: invitation_requests\.turnstile_hash/.test(text)) return genericReceipt;
    throw error;
  }
  return genericReceipt;
}

function requireId(value: string) { return uuid(value); }
function operatorReference(value: string) {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(value)) fail(400, 'invalid_operator_reference');
  return value;
}
export async function approveInvitationRequest(db: DB, requestId: string, operator: string) {
  const id = requireId(requestId), reference = operatorReference(operator), approvalId = crypto.randomUUID();
  const existingApproval = await db.prepare('SELECT request_id,approval_id,issuance_state,delivery_state FROM invitation_request_approvals WHERE request_id=?').bind(id).first();
  if (existingApproval) return existingApproval;
  const request = await db.prepare('SELECT status FROM invitation_requests WHERE id=?').bind(id).first<{status:string}>();
  if (!request) fail(404, 'request_not_found');
  if (request.status !== 'PENDING') fail(409, 'request_not_pending');
  const approvalKey = await hash(`between:g5:approval:v1:${approvalId}`), outboxKey = await hash(`between:g5:outbox:invitation:${approvalId}`);
  const result = await db.batch([
    db.prepare(`INSERT INTO invitation_request_approvals(request_id,approval_id,operator_reference)
      VALUES(?,?,?) ON CONFLICT(request_id) DO NOTHING`).bind(id,approvalId,reference),
    db.prepare(`UPDATE invitation_requests SET status='APPROVED',reviewed_at=unixepoch(),reviewer_reference=?
      WHERE id=? AND status='PENDING'`).bind(reference,id),
    db.prepare(`INSERT INTO invitation_request_outbox(id,request_id,kind,template_key,recipient,idempotency_key)
      SELECT ?,?,'INVITATION','invitation_delivery_v1',email,? FROM invitation_requests WHERE id=?
      AND status='APPROVED' ON CONFLICT DO NOTHING`).bind(crypto.randomUUID(),id,outboxKey,id)
  ]);
  if (!result[0].meta.changes && !result[1].meta.changes) {
    const raced = await db.prepare('SELECT request_id,approval_id,issuance_state,delivery_state FROM invitation_request_approvals WHERE request_id=?').bind(id).first();
    if (raced) return raced;
    fail(404, 'request_not_found');
  }
  return await db.prepare('SELECT request_id,approval_id,issuance_state,delivery_state FROM invitation_request_approvals WHERE request_id=?').bind(id).first();
}
export async function rejectInvitationRequest(db: DB, requestId: string, operator: string) {
  const id = requireId(requestId), reference = operatorReference(operator);
  const result = await db.prepare(`UPDATE invitation_requests SET status='REJECTED',reviewed_at=unixepoch(),reviewer_reference=?
    WHERE id=? AND status='PENDING'`).bind(reference,id).run();
  if (!result.meta.changes) fail(409, 'request_not_pending');
  return { requestId:id, status:'REJECTED' };
}
export async function listPendingInvitationRequests(db: DB, limit = 50) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail(400, 'invalid_limit');
  const rows = await db.prepare(`SELECT id,display_name,email,message,status,created_at FROM invitation_requests
    WHERE status='PENDING' ORDER BY created_at,id LIMIT ?`).bind(limit).all<RequestRow>();
  return rows.results;
}
export async function expireInvitationRequests(db: DB, olderThanSeconds = 30 * 86400) {
  if (!Number.isSafeInteger(olderThanSeconds) || olderThanSeconds < 86400 || olderThanSeconds > 365 * 86400) fail(400, 'invalid_expiry');
  const result = await db.prepare(`UPDATE invitation_requests SET status='EXPIRED',reviewed_at=unixepoch(),reviewer_reference='system_expiry'
    WHERE status='PENDING' AND created_at<=unixepoch()-?`).bind(olderThanSeconds).run();
  return { expired: result.meta.changes };
}
export async function claimOutbox(db: DB, outboxId: string) {
  const id = requireId(outboxId);
  const row = await db.prepare(`UPDATE invitation_request_outbox SET status='SENDING',attempts=attempts+1,updated_at=unixepoch()
    WHERE id=? AND status IN ('PENDING','FAILED') AND (kind!='INVITATION' OR EXISTS (
      SELECT 1 FROM invitation_request_approvals a WHERE a.request_id=invitation_request_outbox.request_id AND a.issuance_state='ISSUED'
    )) RETURNING id,request_id,kind,template_key,recipient,status,idempotency_key,attempts`).bind(id).first<OutboxRow>();
  if (row?.kind === 'INVITATION') {
    await db.prepare(`UPDATE invitation_request_approvals SET delivery_state='SENDING',updated_at=unixepoch()
      WHERE request_id=? AND issuance_state='ISSUED' AND delivery_state IN ('PENDING','FAILED')`).bind(row.request_id).run();
  }
  return row || null;
}
export async function recordOutboxResult(db: DB, outboxId: string, result: { outcome:'sent'|'failed'|'unknown'; providerMessageId?: string; errorCode?: string }) {
  const id = requireId(outboxId);
  if (result.outcome === 'sent' && (!result.providerMessageId || result.providerMessageId.length > 255)) fail(400, 'invalid_provider_result');
  const status = result.outcome === 'sent' ? 'SENT' : result.outcome === 'unknown' ? 'UNKNOWN' : 'FAILED';
  const errorCode = result.errorCode ? code(result.errorCode) : null;
  const row = await db.prepare(`SELECT id,request_id,kind FROM invitation_request_outbox WHERE id=? AND status='SENDING'`).bind(id).first<{id:string;request_id:string;kind:string}>();
  if (!row) fail(409, 'outbox_not_sending');
  await db.batch([
    db.prepare(`UPDATE invitation_request_outbox SET status=?,provider_message_id=?,last_error_code=?,updated_at=unixepoch()
      WHERE id=? AND status='SENDING'`).bind(status,result.providerMessageId||null,errorCode,id),
    ...(row.kind === 'INVITATION' ? [db.prepare(`UPDATE invitation_request_approvals SET delivery_state=?,last_error_code=?,updated_at=unixepoch()
      WHERE request_id=? AND issuance_state='ISSUED' AND delivery_state='SENDING'`).bind(status,errorCode,row.request_id)] : [])
  ]);
  return { outboxId:id,status };
}
export async function recordInvitationIssued(db: DB, requestId: string, invitationId: string) {
  const id = requireId(requestId), invite = requireId(invitationId);
  const changed = await db.prepare(`UPDATE invitation_request_approvals SET issuance_state='ISSUED',invitation_id=?,delivery_state='PENDING',updated_at=unixepoch()
    WHERE request_id=? AND issuance_state='PENDING'`).bind(invite,id).run();
  if (!changed.meta.changes) fail(409, 'issuance_not_pending');
  return { requestId:id, invitationId:invite, status:'ISSUED' };
}
export async function recordInvitationIssuanceUnknown(db: DB, requestId: string, errorCode: string) {
  const id = requireId(requestId), safe = code(errorCode);
  const changed = await db.prepare(`UPDATE invitation_request_approvals SET issuance_state='UNKNOWN',last_error_code=?,updated_at=unixepoch()
    WHERE request_id=? AND issuance_state='PENDING'`).bind(safe,id).run();
  if (!changed.meta.changes) fail(409, 'issuance_not_pending');
  return { requestId:id, status:'UNKNOWN' };
}
