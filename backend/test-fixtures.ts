// Test-only data setup; never imported by the Worker. Legacy identities exist
// BEFORE 0004 takes its eligibility snapshot; no HTTP bypass is installed.
import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { hash } from './http';
import { randomToken } from './accounts';
import { invitationDigest } from './invitations';

export async function prepareLegacyPool(count=40) {
  await applyD1Migrations(env.DB,env.TEST_MIGRATIONS.slice(0,3));
  const pool=[];
  for(let n=0;n<count;n++){
    const t={id:crypto.randomUUID(),token:randomToken(),ip:`192.0.2.${n+1}`};
    await env.DB.prepare('INSERT INTO travellers(id,token_hash) VALUES(?,?)').bind(t.id,await hash(t.token)).run();
    pool.push(t);
  }
  await applyD1Migrations(env.DB,env.TEST_MIGRATIONS);
  return pool;
}
export async function takeLegacy(pool) {
  const t=pool.shift();
  if(!t)throw new Error('Legacy fixture pool exhausted');
  // Insert on demand so unused fixtures cannot steal first-discovery ownership.
  await env.DB.prepare("INSERT INTO visits(traveller_id,path,canonical_path,a,b,c) VALUES(?,'ROOT','g5:2,2,3:ROOT',2,2,3)").bind(t.id).run();
  return t;
}
let fixtureAddress=0;
export function unknownTraveller(){return {token:randomToken(),ip:`203.0.113.${++fixtureAddress}`}}
export async function mintInvitation() {
  const token=randomToken();
  await env.DB.prepare('INSERT INTO invitations(id,token_hash,expires_at) VALUES(?,?,unixepoch()+172800)')
    .bind(crypto.randomUUID(),await invitationDigest(token)).run();
  return token;
}
