// Reusable, public client configuration. Never put credentials, tokens or
// provider secrets in this object; it is safe to ship in a static bundle.

const ORIGIN_RE = /^https?:\/\/[^/\s?#]+$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TENANT_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

const copy = value => value && typeof value === 'object' ? {...value} : {};
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

function origin(value, field) {
  if (value === '') return '';
  const normalized = typeof value === 'string' ? value.replace(/\/$/, '') : value;
  if (typeof normalized !== 'string' || !ORIGIN_RE.test(normalized)) throw new Error(`${field}_must_be_origin`);
  return normalized;
}

function mailbox(value, field) {
  if (value === '') return '';
  if (typeof value !== 'string' || value.length > 254 || !EMAIL_RE.test(value)) throw new Error(`${field}_must_be_email`);
  return value.toLowerCase();
}

/**
 * Build an isolated client's public configuration. The returned object is
 * deeply frozen so one tenant cannot mutate another tenant's live settings.
 * Only public routing/branding metadata belongs here; secrets stay in Worker
 * secrets or provider-managed stores.
 */
export function createClientConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('client_config_must_be_object');
  const tenantId = input.tenantId;
  if (typeof tenantId !== 'string' || !TENANT_RE.test(tenantId)) throw new Error('tenant_id_invalid');
  const domain = input.domain ?? '';
  if (domain !== '' && (typeof domain !== 'string' || !DOMAIN_RE.test(domain))) throw new Error('domain_invalid');
  const branding = copy(input.branding), mail = copy(input.mail), turnstile = copy(input.turnstile);
  const bindings = copy(input.bindings), flags = copy(input.flags);
  const config = {
    tenantId,
    domain: typeof domain === 'string' ? domain.toLowerCase() : '',
    apiOrigin: origin(input.apiOrigin ?? '', 'api_origin'),
    frontendOrigin: origin(input.frontendOrigin ?? '', 'frontend_origin'),
    branding: {
      productName: typeof branding.productName === 'string' ? branding.productName : '',
      title: typeof branding.title === 'string' ? branding.title : '',
      edition: typeof branding.edition === 'string' ? branding.edition : ''
    },
    mail: {
      sender: mailbox(mail.sender ?? '', 'mail_sender'),
      reviewRecipient: mailbox(mail.reviewRecipient ?? '', 'mail_review_recipient')
    },
    turnstile: {
      siteKey: typeof turnstile.siteKey === 'string' ? turnstile.siteKey : '',
      expectedHostname: typeof turnstile.expectedHostname === 'string' ? turnstile.expectedHostname : ''
    },
    bindings: {
      api: typeof bindings.api === 'string' ? bindings.api : '',
      emailAck: typeof bindings.emailAck === 'string' ? bindings.emailAck : '',
      emailReview: typeof bindings.emailReview === 'string' ? bindings.emailReview : ''
    },
    flags: {
      accounts: flags.accounts === true,
      registration: flags.registration === true,
      invitationRequests: flags.invitationRequests === true
    }
  };
  return freeze(config);
}

/** Generate a standalone ES module for a static Pages artifact. */
export function clientConfigModule(config) {
  const safe = createClientConfig(config);
  const json = JSON.stringify(safe, null, 2);
  return `// Generated public client configuration.\nexport const CLIENT_CONFIG = ${json};\nexport const G5_CLIENT_CONFIG = CLIENT_CONFIG;\nexport const G5_API_URL = CLIENT_CONFIG.apiOrigin;\n`;
}
