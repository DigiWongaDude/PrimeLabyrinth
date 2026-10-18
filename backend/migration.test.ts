import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { expect, test } from 'vitest';

test('additive migration backfills earliest discovery and preserves existing private saves',async()=>{
  await applyD1Migrations(env.DB,env.TEST_MIGRATIONS.slice(0,1));
  for(const id of ['old-a','old-b']){
    await env.DB.prepare('INSERT INTO travellers(id,token_hash,active_path,revision) VALUES(?,?,?,?)').bind(id,`test-hash-${id}`,'0',1).run();
    await env.DB.prepare(`INSERT INTO visits(traveller_id,path,canonical_path,a,b,c,discovered_at)
      VALUES(?,'ROOT','g5:2,2,3:ROOT',2,2,3,'2026-10-01T00:00:00.000Z')`).bind(id).run();
    await env.DB.prepare(`INSERT INTO visits(traveller_id,path,canonical_path,parent_path,a,b,c,discovered_at)
      VALUES(?,'0','g5:2,2,3:0','ROOT',3,3,5,?)`).bind(id,id==='old-b'?'2026-10-01T01:00:00.000Z':'2026-10-02T01:00:00.000Z').run();
  }
  const beforeVisits=(await env.DB.prepare('SELECT * FROM visits ORDER BY traveller_id,path').all()).results;
  const beforeTravellers=(await env.DB.prepare('SELECT * FROM travellers ORDER BY id').all()).results;
  await applyD1Migrations(env.DB,env.TEST_MIGRATIONS);
  expect((await env.DB.prepare('SELECT * FROM visits ORDER BY traveller_id,path').all()).results).toEqual(beforeVisits);
  expect((await env.DB.prepare('SELECT * FROM travellers ORDER BY id').all()).results).toEqual(beforeTravellers);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM discoveries').first('n')).toBe(2);
  expect(await env.DB.prepare("SELECT first_traveller_id FROM discoveries WHERE path='ROOT'").first('first_traveller_id')).toBe('old-a');
  expect(await env.DB.prepare("SELECT first_traveller_id,first_discovered_at FROM discoveries WHERE path='0'").first()).toEqual({first_traveller_id:'old-b',first_discovered_at:'2026-10-01T01:00:00.000Z'});
  await env.DB.prepare(`INSERT INTO commands(traveller_id,request_id,expected_revision,action,door,result_path,parent_path,a,b,c)
    VALUES('old-a',?,1,'advance',0,'00','0',3,3,7)`).bind(crypto.randomUUID()).run();
  expect(await env.DB.prepare('SELECT count(*) AS n FROM discoveries').first('n')).toBe(3);
  expect(await env.DB.prepare("SELECT active_path,revision FROM travellers WHERE id='old-a'").first()).toEqual({active_path:'00',revision:2});
  // Reapplying the migration set is safe and does not reset attribution.
  await applyD1Migrations(env.DB,env.TEST_MIGRATIONS);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM discoveries').first('n')).toBe(3);
});
