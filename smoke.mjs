// Against LOCAL Wrangler only. Run `npm run migrate:local` and
// `npm run dev:accounts` first. Invitations are issued by the private helper,
// read from a temporary restrictive file, then the file is deleted.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { AccountClient } from './account-client.js';
import { issueInvitation, revokeInvitation } from './tools/invitations-local.mjs';

const api = process.env.BETWEEN_SMOKE_API || 'http://localhost:8787';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(api)) throw new Error('smoke.mjs is local-only');
const origin = 'http://localhost:4175';
const fetcher = (url, options = {}) => fetch(url, { ...options, headers: { ...options.headers, Origin: origin } });
function storage() {
  const map = new Map();
  return { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
}

async function invitedAccount(label) {
  const username = `smk${label[0]}${Date.now().toString(36)}${randomBytes(2).toString('hex')}`.slice(0, 32);
  const password = `Smoke-${randomBytes(18).toString('hex')}`;
  const account = new AccountClient(api, storage(), fetcher);
  const invitation = await issueInvitation({ reference: `smoke-${label}` });
  let token;
  try {
    ({ token } = JSON.parse(await readFile(invitation.output, 'utf8')));
    const result = await account.signup(username, password, `Smoke ${label}`, null, token);
    return { account, username, password, result };
  } catch (error) {
    await revokeInvitation(invitation.id).catch(() => {});
    throw error;
  } finally {
    await rm(invitation.output, { force: true });
  }
}

const first = await invitedAccount('first');
await first.account.journey.move(0);
await first.account.journey.move(0);
const firstHistory = await first.account.journey.history();
assert.equal(firstHistory.visits.length, 3);

// Two-device continuity uses normal account login and reaches the same traveller.
const secondDevice = new AccountClient(api, storage(), fetcher);
await secondDevice.login(first.username, first.password);
assert.equal(secondDevice.journey.snapshot.travellerId, first.account.journey.snapshot.travellerId);
assert.equal(secondDevice.journey.snapshot.activePath, first.account.journey.snapshot.activePath);

async function sharedStats() {
  const response = await fetcher(`${api}/v1/exploration`, {});
  assert.equal(response.status, 200);
  return response.json();
}
const before = await sharedStats();
const second = await invitedAccount('second');
await second.account.journey.move(0);
await second.account.journey.move(0);
assert.notEqual(second.account.journey.snapshot.travellerId, first.account.journey.snapshot.travellerId);
assert.equal(second.account.journey.snapshot.sharedDiscovery.isFirstDiscoverer, false);
const after = await sharedStats();
assert.equal(after.totalLocations, before.totalLocations);
assert.equal(after.uniqueTriples, before.uniqueTriples);
assert.equal(after.contributors, before.contributors + 1);
assert.equal(after.contributions, before.contributions + 3);

// The old anonymous route must never mint an identity, even while local
// registration is enabled for this disposable smoke run.
const unknown = randomBytes(32).toString('hex');
const probe = await fetcher(`${api}/v1/travellers`, {
  method: 'POST', headers: { Authorization: `Bearer ${unknown}`, 'Content-Type': 'application/json' }, body: '{}'
});
assert.equal(probe.status, 403);
assert.deepEqual(await probe.json(), { error: 'use_account_signup' });

console.log(JSON.stringify({ passed: true, activePath: first.account.journey.snapshot.activePath,
  history: firstHistory.visits.map(v => ({ path: v.path, triple: v.triple })),
  shared: { totalLocations: after.totalLocations, uniqueTriples: after.uniqueTriples,
    newTravellerContributions: after.contributions - before.contributions } }, null, 2));
