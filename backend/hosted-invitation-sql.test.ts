// Local D1 only: exercise the exact hosted adapter templates against migration 0004.
import {env} from 'cloudflare:workers';
import {applyD1Migrations} from 'cloudflare:test';
import {beforeAll,expect,test} from 'vitest';
import {SQL} from '../tools/hosted-invitations/core.mjs';

beforeAll(async()=>{await applyD1Migrations(env.DB,env.TEST_MIGRATIONS);});
for(const ttl of ['1','172800','604800']){
  test(`hosted INSERT uses database timestamps and string parameter TTL ${ttl}`,async()=>{
    const id=crypto.randomUUID(),digest='a'.repeat(32)+crypto.randomUUID().replaceAll('-','');
    await env.DB.prepare(SQL.insert).bind(id,digest,ttl,'').run();
    const row=await env.DB.prepare(SQL.read).bind(id).first();
    expect(row.expires_at-row.created_at).toBe(Number(ttl));
    expect(row.operator_reference).toBeNull();
    expect(row.redeemed).toBe(0);
    expect(row.revoked_at).toBeNull();
    expect(row.server_now).toBeGreaterThanOrEqual(row.created_at);
  });
}
for(const ttl of ['0','604801']){
  test(`migration 0004 rejects hosted TTL ${ttl}`,async()=>{
    await expect(env.DB.prepare(SQL.insert).bind(crypto.randomUUID(),'b'.repeat(32)+crypto.randomUUID().replaceAll('-',''),ttl,'').run())
      .rejects.toThrow();
  });
}
test('hosted revocation is one-way, bound by UUID, with no flag dependency',async()=>{
  const id=crypto.randomUUID();
  await env.DB.prepare(SQL.insert).bind(id,'c'.repeat(32)+crypto.randomUUID().replaceAll('-',''),'172800','fixture').run();
  expect((await env.DB.prepare(SQL.revoke).bind(id).run()).meta.changes).toBe(1);
  expect((await env.DB.prepare(SQL.revoke).bind(id).run()).meta.changes).toBe(0);
  expect((await env.DB.prepare(SQL.read).bind(id).first()).revoked_at).not.toBeNull();
});
