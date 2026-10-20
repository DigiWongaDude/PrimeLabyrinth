import { claimOutbox, recordOutboxResult, type InvitationRequestEnv } from './invitation-requests';

type DB = D1DatabaseSession;
type Outbox = Awaited<ReturnType<typeof claimOutbox>>;
export type ProviderResult =
  | { outcome: 'sent'; providerMessageId: string }
  | { outcome: 'failed'; errorCode: string }
  | { outcome: 'unknown'; errorCode: string };
export type MailMessage = {
  requestId: string; kind: 'ACK'|'REVIEW'|'INVITATION'; templateKey: string;
  recipient: string; idempotencyKey: string; attempts: number;
  /** Only supplied in memory for an invitation delivery; never persisted. */
  privateToken?: string;
};
export type MailProvider = { send(message: MailMessage): Promise<ProviderResult> };

/** A deterministic, network-free adapter for local integration tests. */
export function fakeMailProvider(outcomes: ProviderResult[] = [{outcome:'sent', providerMessageId:'fake-message-1'}]) {
  const calls: Array<Omit<MailMessage, 'privateToken'> & { tokenLength: number }> = [];
  let index = 0;
  return {
    calls,
    provider: <MailProvider>{
      async send(message) {
        // Keep the secret out of the test trace while proving it reached the
        // adapter in memory when an invitation is being delivered.
        calls.push({...message, privateToken: undefined, tokenLength: message.privateToken?.length ?? 0});
        return outcomes[Math.min(index++, outcomes.length - 1)];
      }
    }
  };
}

/**
 * Explicit operator/worker runner. It claims one durable row, calls the
 * provider once, and records the result. A thrown provider error is UNKNOWN:
 * callers must reconcile it manually and must not retry or mint blindly.
 */
export async function deliverOutbox(db: DB, outboxId: string, provider: MailProvider, privateToken?: string) {
  const row = await claimOutbox(db, outboxId);
  if (!row) return null;
  if (row.kind === 'INVITATION' && (!privateToken || !/^[0-9a-f]{64}$/.test(privateToken))) {
    await recordOutboxResult(db, outboxId, {outcome:'failed', errorCode:'private_token_required'});
    return {outboxId, status:'FAILED'};
  }
  const result = await (async () => {
    try {
      return await provider.send({...row, privateToken: row.kind === 'INVITATION' ? privateToken : undefined});
    } catch {
      return {outcome:'unknown', errorCode:'provider_exception'} as ProviderResult;
    }
  })();
  return recordOutboxResult(db, outboxId, result);
}

// This import type is intentionally referenced so generated Worker types keep
// the optional secret on local operator environments without exposing it.
export type InvitationMailEnv = InvitationRequestEnv;
