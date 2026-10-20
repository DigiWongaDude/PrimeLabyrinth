import { claimOutbox, recordOutboxResult, type InvitationRequestEnv } from './invitation-requests';

type DB = D1DatabaseSession;
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

export type IonosRelayOptions = {
  /** Paul-approved HTTPS endpoint for a separately hosted relay. */
  endpoint: string;
  /** Relay credential supplied at runtime; never a Wrangler var or source value. */
  relaySecret: string;
  sender?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

function relayTemplate(message: MailMessage) {
  if (message.templateKey === 'invitation_request_received_v1') return {
    subject: 'THE BETWEEN — request received',
    text: 'Your request to visit THE BETWEEN has been received and is pending personal review. This is not an account or a marketing subscription.'
  };
  if (message.templateKey === 'invitation_request_review_v1') return {
    subject: 'THE BETWEEN — invitation request awaiting review',
    text: `A new invitation request is awaiting private review. Request ID: ${message.requestId}`
  };
  if (message.templateKey === 'invitation_delivery_v1') return {
    subject: 'THE BETWEEN — your invitation',
    text: 'Your invitation is enclosed as a one-use code. Do not forward it.'
  };
  throw new Error('unknown_mail_template');
}

function relayUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('ionos_relay_url_invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('ionos_relay_https_required');
  return url;
}

/**
 * HTTPS boundary for an operator-owned IONOS SMTP relay. The Worker does not
 * speak SMTP or hold the IONOS mailbox password; the relay does. The endpoint
 * must enforce its own allowlist, TLS, rate limit and no-body-logging policy.
 */
export function ionosRelayProvider(options: IonosRelayOptions): MailProvider {
  const endpoint = relayUrl(options.endpoint);
  if (!options.relaySecret || options.relaySecret.length < 16) throw new Error('ionos_relay_secret_required');
  const sender = options.sender || 'invitations@digiwongadude.com';
  if (sender !== 'invitations@digiwongadude.com') throw new Error('ionos_sender_not_approved');
  const fetcher = options.fetcher || fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 15000) throw new Error('ionos_relay_timeout_invalid');
  return {
    async send(message) {
      let template: {subject:string;text:string};
      try { template = relayTemplate(message); } catch { return {outcome:'failed',errorCode:'unknown_mail_template'}; }
      if (message.kind === 'INVITATION' && (!message.privateToken || !/^[0-9a-f]{64}$/.test(message.privateToken))) {
        return {outcome:'failed',errorCode:'private_token_required'};
      }
      const payload: Record<string, unknown> = {
        idempotencyKey: message.idempotencyKey, requestId: message.requestId,
        kind: message.kind, templateKey: message.templateKey, to: message.recipient,
        from: sender, subject: template.subject, text: template.text
      };
      // The token crosses only this in-memory HTTPS request after approval. It
      // is never logged, placed in a URL, or written to D1 by this adapter.
      if (message.kind === 'INVITATION') payload.invitationToken = message.privateToken;
      let response: Response;
      try {
        response = await fetcher(endpoint, {
          method:'POST', redirect:'error', signal:AbortSignal.timeout(timeoutMs),
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${options.relaySecret}`,'Idempotency-Key':message.idempotencyKey},
          body:JSON.stringify(payload)
        });
      } catch { return {outcome:'unknown',errorCode:'ionos_relay_unavailable'}; }
      if (response.status === 408 || response.status === 429 || response.status >= 500) return {outcome:'unknown',errorCode:'ionos_relay_uncertain'};
      if (!response.ok) return {outcome:'failed',errorCode:'ionos_relay_rejected'};
      let result: unknown;
      try { result = await response.json(); } catch { return {outcome:'unknown',errorCode:'ionos_relay_no_receipt'}; }
      const providerMessageId = result && typeof result === 'object' && typeof (result as {messageId?:unknown}).messageId === 'string'
        ? (result as {messageId:string}).messageId : '';
      if (!providerMessageId || providerMessageId.length > 255 || /[\u0000-\u001f\u007f]/.test(providerMessageId)) return {outcome:'unknown',errorCode:'ionos_relay_no_receipt'};
      return {outcome:'sent',providerMessageId};
    }
  };
}

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
