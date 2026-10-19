import { fail, hash } from './http';

// Invitations are independent random credentials, not paths or prime triples.
// The alpha issuer must use this same versioned domain. Never accept a digest
// supplied by the caller in place of the raw token, or log either value.
export async function invitationDigest(token: unknown): Promise<string> {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) fail(403, 'invitation_unavailable');
  return hash(`between:g5:staging:invite:v1:${token}`);
}

export async function requireInvitation(db: D1DatabaseSession, digest: string | null) {
  if (!digest) fail(403, 'invitation_unavailable');
  const available = await db.prepare(`SELECT id FROM invitations i WHERE token_hash=?
    AND created_at<=unixepoch() AND expires_at>unixepoch() AND revoked_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM invitation_redemptions r WHERE r.invite_hash=i.token_hash)`)
    .bind(digest).first();
  if (!available) fail(403, 'invitation_unavailable');
  // Availability is only a cheap precheck. Redemption MUST be in the account
  // batch; the database trigger rechecks expiry/revocation and rejects races.
}
