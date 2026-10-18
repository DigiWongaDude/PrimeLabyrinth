// The deployed mathematical engine is imported directly, never reimplemented.
import { START, targets, encodePath, decodePath } from '../engine.js';

type Traveller = { id: string; active_path: string; revision: number };
type Visit = { path: string; canonical_path: string; parent_path: string | null; a: number; b: number; c: number; discovered_at: string };
type Command = { request_id: string; expected_revision: number; action: string; door: number | null; result_path: string };
type DB = D1DatabaseSession;
class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
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
  return db.prepare('SELECT id,active_path,revision FROM travellers WHERE token_hash=?').bind(tokenHash).first<Traveller>();
}
async function state(db: DB, id: string) {
  // One statement gives a coherent snapshot even with another browser writing.
  const row = await db.prepare(`SELECT t.id,t.active_path,t.revision,v.a,v.b,v.c,v.discovered_at,
    v.path,v.canonical_path,v.parent_path,
    (SELECT count(*) FROM visits h WHERE h.traveller_id=t.id) AS history_count
    FROM travellers t JOIN visits v ON v.traveller_id=t.id AND v.path=t.active_path WHERE t.id=?`)
    .bind(id).first<Traveller & Visit & { history_count: number }>();
  if (!row) fail(404, 'traveller_not_found');
  const active = path(row.active_path);
  return { travellerId: row.id, generation: 5, geometryGeneration: 4, revision: row.revision,
    activePath: row.active_path, string: Array.from({length:active.length+1},(_,i)=>encodePath(active.slice(0,i))),
    visit: visitJSON(row), historyCount: row.history_count, worldFloor: null };
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
  async fetch(request: Request, env: Env): Promise<Response> {
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
      const token = request.headers.get('Authorization')?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
      if (!token) fail(401,'credential_required');
      const tokenHash = await hash(token), db = env.DB.withSession('first-primary');
      let traveller = await findTraveller(db,tokenHash);
      if (route === '/v1/travellers' && request.method === 'POST') {
        exact(await body(request),[]);
        if (!traveller) {
          if (String(env.REGISTRATION_ENABLED) !== 'true') fail(403,'registration_closed');
          if (!(await env.CREATE_LIMIT.limit({key:ip})).success) fail(429,'rate_limited');
          const cap = Number(env.MAX_TRAVELLERS);
          if (!Number.isSafeInteger(cap) || cap<1 || cap>10000) fail(503,'registration_unconfigured');
          const id = crypto.randomUUID();
          await db.batch([
            db.prepare(`INSERT INTO travellers(id,token_hash) SELECT ?,? WHERE (SELECT count(*) FROM travellers)<?
              ON CONFLICT(token_hash) DO NOTHING`).bind(id,tokenHash,cap),
            db.prepare(`INSERT INTO visits(traveller_id,path,canonical_path,parent_path,a,b,c)
              SELECT id,'ROOT','g5:2,2,3:ROOT',NULL,?,?,? FROM travellers WHERE token_hash=?
              ON CONFLICT(traveller_id,path) DO NOTHING`).bind(...START,tokenHash)
          ]);
          traveller = await findTraveller(db,tokenHash);
          if (!traveller) fail(403,'registration_full');
        }
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
