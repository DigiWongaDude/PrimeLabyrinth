// The deployed mathematical engine is imported directly, never reimplemented.
import { targets, encodePath, decodePath } from '../engine.js';
import { ApiError } from './http';
import { authenticate, accountRoute, type AccountEnv } from './accounts';
import { invitationRequestRoute } from './invitation-requests';

type Traveller = { id: string; active_path: string; revision: number };
type Visit = { path: string; canonical_path: string; parent_path: string | null; a: number; b: number; c: number; discovered_at: string };
type Command = { request_id: string; expected_revision: number; action: string; door: number | null; result_path: string };
type DB = D1DatabaseSession;
function fail(status: number, code: string): never { throw new ApiError(status, code); }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function hash(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') fail(415, 'json_required');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'missing_body');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > 2048) { await reader.cancel(); fail(413, 'body_too_large'); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let data: unknown;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'invalid_json'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'invalid_body');
  return Object.fromEntries(Object.entries(data));
}
function exact(data: Record<string, unknown>, keys: string[]) {
  if (Object.keys(data).some(k => !keys.includes(k)) || keys.some(k => !(k in data))) fail(400, 'unexpected_fields');
}
function path(code: string) {
  if (code.length > 8192 || !/^(ROOT|(?:[0-9A-F]|\[[1-9A-F][0-9A-F]+\])+)$/.test(code)) fail(400, 'invalid_path');
  const values = decodePath(code);
  if (values.length > 1200 || values.some(n => !Number.isSafeInteger(n)) || encodePath(values) !== code) fail(400, 'invalid_path');
  return values;
}
function visitJSON(v: Visit) {
  return { path: v.path, canonicalPath: v.canonical_path, parentPath: v.parent_path,
    triple: [v.a,v.b,v.c], discoveredAt: v.discovered_at, worldFloor: null };
}
async function findTraveller(db: DB, tokenHash: string) {
  return authenticate(db,tokenHash);
}
async function exploration(db: DB) {
  // One read transaction: derived counts, never independently incremented totals.
  const [totals,recent] = await db.batch<Record<string,string|number|null>>([
    db.prepare(`SELECT (SELECT count(*) FROM discoveries) AS totalLocations,
      (SELECT count(*) FROM (SELECT a,b,c FROM discoveries GROUP BY a,b,c)) AS uniqueTriples,
      (SELECT count(DISTINCT traveller_id) FROM visits) AS contributors,
      (SELECT count(*) FROM visits) AS contributions`),
    db.prepare(`SELECT generation,root_triple AS rootTriple,path,canonical_path AS canonicalPath,
      parent_path AS parentPath,a,b,c,first_discovered_at AS firstDiscoveredAt,
      p.public_id AS discovererId,p.display_name AS discovererName
      FROM discoveries d JOIN profiles p ON p.traveller_id=d.first_traveller_id
      ORDER BY first_discovered_at DESC,canonical_path LIMIT 10`)
  ]);
  // Explicit public projection: no owner IDs, credentials or personal timelines.
  return { ...totals.results[0], recentDiscoveries: recent.results.map(row => ({
    generation:row.generation,rootTriple:row.rootTriple,path:row.path,canonicalPath:row.canonicalPath,
    parentPath:row.parentPath,triple:[row.a,row.b,row.c],firstDiscoveredAt:row.firstDiscoveredAt,
    discoverer:{publicId:row.discovererId,displayName:row.discovererName}
  })) };
}
async function state(db: DB, id: string) {
  // One statement gives a coherent snapshot even with another browser writing.
  const row = await db.prepare(`SELECT t.id,t.active_path,t.revision,v.a,v.b,v.c,v.discovered_at,
    v.path,v.canonical_path,v.parent_path,
    (SELECT count(*) FROM visits h WHERE h.traveller_id=t.id) AS history_count,
    d.first_discovered_at,d.first_traveller_id=t.id AS is_first_discoverer,
    p.public_id AS discoverer_id,p.display_name AS discoverer_name,
    (SELECT count(*) FROM visits h WHERE h.canonical_path=v.canonical_path) AS location_travellers,
    (SELECT count(*) FROM discoveries) AS total_locations,
    (SELECT count(*) FROM (SELECT a,b,c FROM discoveries GROUP BY a,b,c)) AS unique_triples
    FROM travellers t JOIN visits v ON v.traveller_id=t.id AND v.path=t.active_path
    JOIN discoveries d ON d.canonical_path=v.canonical_path
    JOIN profiles p ON p.traveller_id=d.first_traveller_id WHERE t.id=?`)
    .bind(id).first<Traveller & Visit & { history_count:number; first_discovered_at:string;
      is_first_discoverer:number; location_travellers:number; total_locations:number; unique_triples:number;
      discoverer_id:string; discoverer_name:string }>();
  if (!row) fail(404, 'traveller_not_found');
  const active = path(row.active_path);
  return { travellerId: row.id, generation: 5, geometryGeneration: 4, revision: row.revision,
    activePath: row.active_path, string: Array.from({length:active.length+1},(_,i)=>encodePath(active.slice(0,i))),
    visit: visitJSON(row), historyCount: row.history_count, worldFloor: null,
    sharedDiscovery: { canonicalPath:row.canonical_path,firstDiscoveredAt:row.first_discovered_at,
      isFirstDiscoverer:row.is_first_discoverer===1,travellerCount:row.location_travellers,
      discoverer:{publicId:row.discoverer_id,displayName:row.discoverer_name} },
    exploration: { totalLocations:row.total_locations,uniqueTriples:row.unique_triples } };
}
function ack(c: Command) { return { requestId: c.request_id, revision: c.expected_revision + 1, activePath: c.result_path }; }
async function command(db: DB, traveller: Traveller, data: Record<string, unknown>, action: string) {
  exact(data, action === 'advance' ? ['requestId','expectedRevision','door'] : ['requestId','expectedRevision']);
  if (typeof data.requestId !== 'string' || !uuid.test(data.requestId) || !Number.isSafeInteger(data.expectedRevision) || Number(data.expectedRevision)<0) fail(400,'invalid_command');
  const requestId = data.requestId, revision = Number(data.expectedRevision);
  const door = action === 'advance' ? data.door : null;
  if (action === 'advance' && (typeof door !== 'number' || !Number.isSafeInteger(door) || door<0 || door>255)) fail(400,'invalid_door');
  const readCommand = () => db.prepare('SELECT * FROM commands WHERE traveller_id=? AND request_id=?').bind(traveller.id,requestId).first<Command>();
  const check = (c: Command) => {
    if (c.expected_revision !== revision || c.action !== action || c.door !== door) fail(409,'request_id_reused');
    return ack(c);
  };
  const previous = await readCommand(); if (previous) return check(previous);
  if (traveller.revision !== revision) fail(409,'stale_revision');
  const current = await db.prepare('SELECT * FROM visits WHERE traveller_id=? AND path=?').bind(traveller.id,traveller.active_path).first<Visit>();
  if (!current) fail(500,'missing_current_visit');
  const active = path(traveller.active_path);
  let nextPath: string, parentPath: string | null, triple: number[];
  if (action === 'advance') {
    const choices = targets([current.a,current.b,current.c]);
    if (typeof door !== 'number' || door >= choices.length) fail(400,'invalid_door');
    if (active.length >= 1200) fail(409,'path_limit');
    triple = choices[door]; nextPath = encodePath([...active,door]); parentPath = current.path;
  } else {
    if (!active.length) fail(409,'already_at_root');
    nextPath = encodePath(active.slice(0,-1));
    const parent = await db.prepare('SELECT * FROM visits WHERE traveller_id=? AND path=?').bind(traveller.id,nextPath).first<Visit>();
    if (!parent) fail(500,'missing_parent_visit');
    triple = [parent.a,parent.b,parent.c]; parentPath = parent.parent_path;
  }
  try {
    await db.prepare(`INSERT INTO commands(traveller_id,request_id,expected_revision,action,door,result_path,parent_path,a,b,c)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(traveller.id,requestId,revision,action,door,nextPath,parentPath,...triple).run();
  } catch (error) {
    // Concurrent identical retry may have won. Read primary again to resolve it.
    const existing = await readCommand(); if (existing) return check(existing);
    const message = String(error);
    if (/stale_revision|UNIQUE constraint/.test(message)) fail(409,'stale_revision');
    if (/journey_limit|visit_limit/.test(message)) fail(409,'journey_limit');
    throw error;
  }
  return { requestId, revision:revision+1, activePath:nextPath };
}

export default {
  async fetch(request: Request, env: AccountEnv): Promise<Response> {
    // Presentation-only entrance: API origin checks below remain unchanged.
    if (request.method === 'GET' && new URL(request.url).pathname === '/') {
      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>THE BETWEEN — Access Denied</title>
<style>
html, body { margin: 0; min-height: 100%; background: #080b09; }
body { display: flex; justify-content: center; align-items: center; min-height: 100vh; }
img { display: block; width: 100%; max-width: 900px; height: auto; }
</style>
</head>
<body>
<img src="https://digiwongadude.com/between/assets/minotaur-access-denied.png" alt="THE BETWEEN — ACCESS DENIED. This entrance is not yet open to the public. Please use the official game client.">
</body>
</html>`;
      return new Response(html, { status: 200, headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src https://digiwongadude.com; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
      } });
    }
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map(x=>x.trim()).includes(origin) && origin !== '';
    const headers: Record<string,string> = { 'Cache-Control':'no-store', 'Vary':'Origin', 'X-Content-Type-Options':'nosniff' };
    if (allowed) headers['Access-Control-Allow-Origin'] = origin;
    const respond = (data: unknown, status=200) => Response.json(data,{status,headers});
    try {
      if (!allowed) fail(403,'origin_not_allowed');
      if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,
        'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Allow-Headers':'Authorization, Content-Type'}});
      const url = new URL(request.url), route = url.pathname;
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      if (!(await env.REQUEST_LIMIT.limit({key:ip})).success) fail(429,'rate_limited');
      if (route === '/v1/health' && request.method === 'GET') return respond({ok:true,generation:5});
      if (route === '/v1/invitation-requests') return respond(await invitationRequestRoute(request,env,env.DB.withSession('first-primary'),ip),202);
      const db = env.DB.withSession('first-primary');
      if (route === '/v1/exploration' && request.method === 'GET') return respond(await exploration(db));
      if (route === '/v1/discovery' && request.method === 'GET') {
        const code=url.searchParams.get('path')||'ROOT'; path(code);
        const row=await db.prepare(`SELECT d.canonical_path,d.a,d.b,d.c,d.first_discovered_at,p.public_id,p.display_name
          FROM discoveries d JOIN profiles p ON p.traveller_id=d.first_traveller_id WHERE d.canonical_path=?`)
          .bind(`g5:2,2,3:${code}`).first<{canonical_path:string;a:number;b:number;c:number;first_discovered_at:string;public_id:string;display_name:string}>();
        if (!row) fail(404,'not_found');
        return respond({canonicalPath:row.canonical_path,triple:[row.a,row.b,row.c],firstDiscoveredAt:row.first_discovered_at,
          discoverer:{publicId:row.public_id,displayName:row.display_name}});
      }
      const token = request.headers.get('Authorization')?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
      const tokenHash = token ? await hash(token) : null;
      const traveller = tokenHash ? await findTraveller(db,tokenHash) : null;
      if (route.startsWith('/v1/auth/') || route==='/v1/account' || route.startsWith('/v1/account/')) {
        return respond(await accountRoute(request,env,db,traveller,tokenHash,ip));
      }
      if (!tokenHash) fail(401,'credential_required');
      if (route === '/v1/travellers' && request.method === 'POST') {
        exact(await body(request),[]);
        // Resume only under EVERY account/registration flag combination. New
        // identities must enter via the atomic invitation-aware account routes.
        if (!traveller) fail(403,'use_account_signup');
        return respond(await state(db,traveller.id));
      }
      if (!traveller) fail(401,'unknown_credential');
      if (route === '/v1/journey' && request.method === 'GET') return respond(await state(db,traveller.id));
      if (route === '/v1/history' && request.method === 'GET') {
        const after = url.searchParams.get('after') || '';
        if (after) path(after);
        const rows = await db.prepare(`SELECT * FROM visits WHERE traveller_id=? AND path>? ORDER BY path LIMIT 101`)
          .bind(traveller.id,after).all<Visit>();
        return respond({visits:rows.results.slice(0,100).map(visitJSON),next:rows.results.length>100?rows.results[99].path:null});
      }
      if (['/v1/advance','/v1/retrace'].includes(route) && request.method === 'POST') {
        return respond(await command(db,traveller,await body(request),route.slice(4)));
      }
      fail(404,'not_found');
    } catch (error) {
      if (error instanceof ApiError) return respond({error:error.code},error.status);
      // Never log requests, Authorization headers, raw SQL errors or credentials.
      console.error(JSON.stringify({event:'journey_api_failure'}));
      return respond({error:'temporarily_unavailable'},503);
    }
  }
} satisfies ExportedHandler<Env>;
