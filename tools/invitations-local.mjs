// Private local operator helper. This file is for disposable local D1 work only.
// It never prints or accepts a raw invitation token on the command line.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const INVITATION_DOMAIN = 'between:g5:staging:invite:v1:';
export const DEFAULT_TTL_SECONDS = 48 * 60 * 60;
export const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

export function invitationDigest(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) throw new Error('invalid local invitation token');
  return createHash('sha256').update(INVITATION_DOMAIN + token).digest('hex');
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function issueSql({ id, digest, expiresAt, reference = null }) {
  return `INSERT INTO invitations(id,token_hash,expires_at,operator_reference) VALUES(${sql(id)},${sql(digest)},${Number(expiresAt)},${reference === null ? 'NULL' : sql(reference)});\n`;
}

export function revokeSql(id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('invalid invitation id');
  return `UPDATE invitations SET revoked_at=unixepoch() WHERE id=${sql(id)} AND revoked_at IS NULL;\n`;
}

function validateTtl(value) {
  const ttl = value === undefined ? DEFAULT_TTL_SECONDS : Number(value);
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > MAX_TTL_SECONDS) throw new Error('ttl must be 1..604800 seconds');
  return ttl;
}

function localOutputPath(requested, id) {
  const output = resolve(requested || join(tmpdir(), `between-invitation-${id}.json`));
  const repoRelative = relative(process.cwd(), output);
  if (repoRelative === '' || (!repoRelative.startsWith('..') && !isAbsolute(repoRelative))) {
    throw new Error('invitation output must be outside the repository');
  }
  return output;
}

export async function writePrivateInvitation(file, payload) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify(payload) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await chmod(file, 0o600);
  const info = await stat(file);
  // POSIX mode bits are authoritative on Unix. Windows user temp output is
  // protected by the account ACL; Node exposes inherited ACL bits as mode bits.
  if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) throw new Error('invitation output is not private');
}

async function executeLocalSql(file) {
  const command = process.execPath;
  const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
  try {
    await execFileAsync(command, [wrangler, 'd1', 'execute', 'between-g5', '--local', '--file', file], {
      cwd: process.cwd(), windowsHide: true, maxBuffer: 2 * 1024 * 1024
    });
  } catch (error) {
    throw new Error('local D1 command failed');
  }
}

export async function issueInvitation({ ttlSeconds, reference = null, output, execute = executeLocalSql, now = Math.floor(Date.now() / 1000) } = {}) {
  const ttl = validateTtl(ttlSeconds);
  if (reference !== null && (typeof reference !== 'string' || reference.length > 64)) throw new Error('reference must be at most 64 characters');
  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  const digest = invitationDigest(token);
  const expiresAt = now + ttl;
  const file = localOutputPath(output, id);
  const dir = await mkdtemp(join(tmpdir(), 'between-invitation-sql-'));
  await chmod(dir, 0o700);
  const sqlFile = join(dir, 'issue.sql');
  await writeFile(sqlFile, issueSql({ id, digest, expiresAt, reference }), { encoding: 'utf8', mode: 0o600 });
  try {
    await execute(sqlFile);
    try {
      await writePrivateInvitation(file, { id, token, createdAt: now, expiresAt, reference });
    } catch (error) {
      try {
        const revokeFile = join(dir, 'revoke.sql');
        await writeFile(revokeFile, revokeSql(id), { encoding: 'utf8', mode: 0o600 });
        await execute(revokeFile);
      } catch { /* preserve the original output error without printing secrets */ }
      throw error;
    }
    return { id, expiresAt, output: file };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function revokeInvitation(id, { execute = executeLocalSql } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'between-invitation-sql-'));
  await chmod(dir, 0o700);
  const file = join(dir, 'revoke.sql');
  await writeFile(file, revokeSql(id), { encoding: 'utf8', mode: 0o600 });
  try { await execute(file); return { id, revoked: true }; }
  finally { await rm(dir, { recursive: true, force: true }); }
}

function usage() {
  console.error('Usage: node tools/invitations-local.mjs issue [--out PATH] [--ttl-seconds N] [--reference TEXT]');
  console.error('       node tools/invitations-local.mjs revoke --id UUID');
  process.exitCode = 2;
}

async function main(argv) {
  const [command, ...args] = argv;
  const value = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  if (command === 'issue') {
    const result = await issueInvitation({ output: value('--out'), ttlSeconds: value('--ttl-seconds'), reference: value('--reference') ?? null });
    console.log(`Invitation written to ${result.output}; id ${result.id}; expires ${result.expiresAt}.`);
    return;
  }
  if (command === 'revoke') {
    const id = value('--id');
    if (!id) return usage();
    await revokeInvitation(id);
    console.log(`Invitation ${id} revoked locally.`);
    return;
  }
  usage();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
