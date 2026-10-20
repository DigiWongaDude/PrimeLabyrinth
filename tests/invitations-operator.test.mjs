import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS, invitationDigest, issueInvitation, issueSql, revokeInvitation, revokeSql } from '../tools/invitations-local.mjs';

test('operator issue uses a 32-byte token, versioned digest and bounded TTL without putting the token in SQL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'between-operator-test-'));
  try {
    let sql;
    const output = join(root, 'invitation.json');
    const result = await issueInvitation({ output, reference: 'test-fixture', execute: async file => { sql = await readFile(file, 'utf8'); }, now: 1700000000 });
    const record = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(record.id, result.id);
    assert.equal(record.token.length, 64);
    assert.match(record.token, /^[0-9a-f]{64}$/);
    assert.equal(record.expiresAt, 1700000000 + DEFAULT_TTL_SECONDS);
    assert.match(sql, new RegExp(invitationDigest(record.token)));
    assert.doesNotMatch(sql, new RegExp(record.token));
    assert.doesNotMatch(JSON.stringify(result), new RegExp(record.token));
    if (process.platform !== 'win32') assert.equal((await stat(output)).mode & 0o077, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('operator utility rejects unsafe TTL and repository output, and revocation SQL has no token input', async () => {
  await assert.rejects(issueInvitation({ ttlSeconds: 0, execute: async () => {} }), /ttl/);
  await assert.rejects(issueInvitation({ ttlSeconds: MAX_TTL_SECONDS + 1, execute: async () => {} }), /ttl/);
  await assert.rejects(issueInvitation({ output: join(process.cwd(), 'raw-invitation.json'), execute: async () => {} }), /outside the repository/);
  assert.match(revokeSql('123e4567-e89b-12d3-a456-426614174000'), /UPDATE invitations/);
  await assert.rejects(revokeInvitation('not-an-id', { execute: async () => {} }), /invalid invitation id/);
});
