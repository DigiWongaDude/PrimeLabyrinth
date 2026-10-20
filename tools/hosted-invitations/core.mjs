import {createHash, randomBytes, randomUUID} from 'node:crypto';

export const TARGET=Object.freeze({
  account:'afef76524a17ba7db8f11d31b56d215a',
  database:'8280b0ec-4f1c-42e9-918f-613c7578c83c',name:'between-g5-staging'
});
export const SQL=Object.freeze({
  insert:"INSERT INTO invitations (id, token_hash, created_at, expires_at, operator_reference) VALUES (?, ?, unixepoch(), unixepoch() + CAST(? AS INTEGER), NULLIF(?, ''));",
  read:`SELECT id, token_hash, created_at, expires_at, operator_reference, revoked_at,
    EXISTS(SELECT 1 FROM invitation_redemptions r WHERE r.invite_hash=i.token_hash) AS redeemed,
    unixepoch() AS server_now FROM invitations i WHERE id=?;`,
  revoke:"UPDATE invitations SET revoked_at=unixepoch() WHERE id=? AND revoked_at IS NULL;",
  migrations:"SELECT name FROM d1_migrations ORDER BY id;"
});
export const MIGRATIONS=Object.freeze(['0001_journeys.sql','0002_shared_exploration.sql','0003_accounts.sql','0004_invitations.sql']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX=/^[0-9a-f]{64}$/;
const uuid=value=>typeof value==='string'&&value.length===36&&UUID.test(value);
const hex=value=>typeof value==='string'&&value.length===64&&HEX.test(value);
const STATES=['PREPARED','WRITE_UNKNOWN','ISSUED','REVOKE_UNKNOWN','REVOKED','EXPIRED','REDEEMED','DELIVERED'];
const TERMINAL=['REVOKED','EXPIRED','REDEEMED','DELIVERED'];
const NEXT={
  PREPARED:['WRITE_UNKNOWN','ISSUED','REVOKE_UNKNOWN','REVOKED','EXPIRED','REDEEMED'],
  WRITE_UNKNOWN:['WRITE_UNKNOWN','ISSUED','REVOKE_UNKNOWN','REVOKED','EXPIRED','REDEEMED'],
  ISSUED:['ISSUED','REVOKE_UNKNOWN','REVOKED','EXPIRED','REDEEMED','DELIVERED'],
  REVOKE_UNKNOWN:['REVOKE_UNKNOWN','REVOKED','EXPIRED','REDEEMED'],
  DELIVERED:['DELIVERED','REVOKE_UNKNOWN','REVOKED','EXPIRED','REDEEMED'],
  REVOKED:['REVOKED'],EXPIRED:['EXPIRED'],REDEEMED:['REDEEMED']
};
export class OperatorError extends Error {
  constructor(code){super(code);this.name='OperatorError';}
}
export function requireThat(value,code){if(!value)throw new OperatorError(code);}
export function safeError(error){return error instanceof OperatorError?error.message:'operator_failed';}
const sha=text=>createHash('sha256').update(text).digest('hex');
export function digest(token){requireThat(hex(token),'invalid_token');return sha('between:g5:staging:invite:v1:'+token);}
export function validateTarget(target){
  requireThat(target?.account===TARGET.account&&target?.database===TARGET.database&&target?.name===TARGET.name,'wrong_target');
}
export function validateOptions(ttl=172800,reference=''){
  requireThat(Number.isSafeInteger(ttl)&&ttl>=1&&ttl<=604800,'invalid_ttl');
  requireThat(typeof reference==='string'&&reference.length<=64&&!/[\x00-\x1f\x7f-\x9f]/.test(reference),'invalid_reference');
}
function validateRecord(r){
  requireThat(r&&r.version===1&&uuid(r.id)&&hex(r.digest)&&STATES.includes(r.state)&&
    Number.isSafeInteger(r.sequence)&&r.sequence>=0&&r.sequence<1000000&&/^[0-9a-f]{40}$/.test(r.source),'invalid_journal');
  validateTarget(r.target);validateOptions(r.ttl,r.reference);
}
const immutable=r=>JSON.stringify([r.id,r.digest,r.ttl,r.reference,r.source,r.target]);
const fileFor=r=>`${r.id}.${String(r.sequence).padStart(6,'0')}.json`;
export function summary(r){
  return {id:r.id,state:r.state,sequence:r.sequence,source:r.source,database:TARGET.database,
    ...(r.createdAt!==undefined?{createdAt:r.createdAt,expiresAt:r.expiresAt}:{})};
}
export async function load(store,id) {
  requireThat(uuid(id),'invalid_id');await store.check();
  const names=(await store.list()).filter(n=>n.startsWith(id+'.')&&n.endsWith('.json')).sort();
  requireThat(names.length>0,'journal_missing');
  let previous;
  for(let i=0;i<names.length;i++){
    let envelope,r;
    try{envelope=JSON.parse(await store.read(names[i]));requireThat(sha(envelope.payload)===envelope.checksum,'invalid_journal');r=JSON.parse(envelope.payload);}
    catch{throw new OperatorError('invalid_journal');}
    validateRecord(r);
    requireThat(r.id===id&&r.sequence===i&&names[i]===fileFor(r),'invalid_journal');
    requireThat(previous?immutable(previous)===immutable(r)&&NEXT[previous.state].includes(r.state):r.state==='PREPARED','invalid_journal');
    previous=r;
  }
  return previous;
}
async function save(store,r){
  validateRecord(r);await store.check();
  const payload=JSON.stringify(r);
  await store.create(fileFor(r),JSON.stringify({payload,checksum:sha(payload)}));
}
async function move(store,r,state,extra={}){
  requireThat(NEXT[r.state].includes(state),'invalid_transition');
  const next={...r,...extra,state,sequence:r.sequence+1};
  await save(store,next);return next;
}
async function cleanup(store,r){
  if(TERMINAL.includes(r.state))await store.deleteToken(`${r.id}.token`);
  return summary(r);
}
export async function prepare(store,{ttl=172800,reference='',source,target=TARGET}={}) {
  validateTarget(target);validateOptions(ttl,reference);
  requireThat(/^[0-9a-f]{40}$/.test(source),'invalid_source');
  await store.check(); // BEFORE generating plaintext, including offline fixtures.
  const files=await store.list(),ids=new Set(files.map(name=>name.split('.')[0]));
  for(const existingId of ids){
    const existing=await load(store,existingId);
    requireThat(TERMINAL.includes(existing.state)&&!files.includes(`${existingId}.token`),'unfinished_operation');
  }
  const id=randomUUID(),token=randomBytes(32).toString('hex');
  const r={version:1,id,digest:digest(token),ttl,reference,source,target:{...TARGET},state:'PREPARED',sequence:0};
  await store.create(`${id}.token`,token);
  // A crash here leaves an orphan private token, never an issued remote record.
  // Do not infer a missing journal or mint a replacement automatically.
  await save(store,r);
  return summary(r);
}
export async function status(store,id){return cleanup(store,await load(store,id));}

// No ambient fetch or credentials: callers explicitly supply both. Never retries.
export function d1Client({fetcher,credential,target=TARGET}) {
  validateTarget(target);
  requireThat(typeof fetcher==='function'&&typeof credential==='string'&&credential.length>0&&!/[\r\n]/.test(credential),'credential_required');
  const base=`https://api.cloudflare.com/client/v4/accounts/${TARGET.account}/d1/database/${TARGET.database}`;
  async function request(path,body) {
    try{
      const response=await fetcher(base+path,{
        method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{Authorization:`Bearer ${credential}`,...(body?{'Content-Type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{})
      });
      requireThat(response.ok&&!response.redirected,'d1_response_uncertain');
      const reader=response.body.getReader();let size=0;const chunks=[];
      try{
        for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
          requireThat(size<=65536,'d1_response_uncertain');chunks.push(value);}
      }finally{await reader.cancel();}
      const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requireThat(result.success===true&&Array.isArray(result.errors)&&result.errors.length===0,'d1_response_uncertain');
      return result.result;
    }catch{throw new OperatorError('d1_response_uncertain');}
  }
  async function query(sql,params) {
    const result=await request('/query',{sql,params});
    requireThat(Array.isArray(result)&&result.length===1&&result[0].success===true&&
      Array.isArray(result[0].results)&&Number.isSafeInteger(result[0].meta?.changes)&&result[0].meta.changes>=0,'d1_response_uncertain');
    return result[0];
  }
  return {
    async verify(){
      const metadata=await request('');
      requireThat(metadata?.uuid===TARGET.database&&metadata?.name===TARGET.name,'wrong_target');
      const result=await query(SQL.migrations,[]);
      requireThat(result.meta.changes===0&&JSON.stringify(result.results.map(r=>r.name))===JSON.stringify(MIGRATIONS),'migration_mismatch');
    },
    async read(id){
      requireThat(uuid(id),'invalid_id');
      const result=await query(SQL.read,[id]);
      requireThat(result.meta.changes===0&&result.results.length<=1,'d1_response_uncertain');
      return result.results[0]||null;
    },
    async insert(r){
      validateRecord(r);
      const result=await query(SQL.insert,[r.id,r.digest,String(r.ttl),r.reference]);
      requireThat(result.meta.changes===1,'d1_response_uncertain');
    },
    async revoke(id){
      requireThat(uuid(id),'invalid_id');
      const result=await query(SQL.revoke,[id]);
      requireThat(result.meta.changes===0||result.meta.changes===1,'d1_response_uncertain');
    }
  };
}
function inspect(r,row) {
  if(!row)return null;
  requireThat(row.id===r.id&&row.token_hash===r.digest&&
    row.operator_reference===(r.reference||null)&&
    Number.isSafeInteger(row.created_at)&&Number.isSafeInteger(row.expires_at)&&
    row.expires_at-row.created_at===r.ttl&&Number.isSafeInteger(row.server_now)&&
    row.server_now>=row.created_at&&(row.revoked_at===null||
      Number.isSafeInteger(row.revoked_at)&&row.revoked_at>=row.created_at)&&
    (row.redeemed===0||row.redeemed===1),'record_conflict');
  if(r.createdAt!==undefined)requireThat(r.createdAt===row.created_at&&r.expiresAt===row.expires_at,'record_conflict');
  return row.redeemed===1?'REDEEMED':row.revoked_at!==null?'REVOKED':row.expires_at<=row.server_now?'EXPIRED':'ISSUED';
}
async function readback(store,api,r,{revoking=false}={}){
  await store.check();
  const row=await api.read(r.id),state=inspect(r,row);
  requireThat(state!==null,'record_absent');
  if(revoking)requireThat(state!=='ISSUED','revocation_unconfirmed');
  // Do not rewind DELIVERED to ISSUED or a pending revoke to deliverable status.
  const nextState=(r.state==='DELIVERED'&&state==='ISSUED')?'DELIVERED':state;
  const next=await move(store,r,nextState,{createdAt:row.created_at,expiresAt:row.expires_at});
  return cleanup(store,next);
}
export async function reconcile(store,api,id){
  const r=await load(store,id);
  if(TERMINAL.includes(r.state)&&r.state!=='DELIVERED')return cleanup(store,r);
  await store.check();await api.verify();
  return readback(store,api,r,{revoking:r.state==='REVOKE_UNKNOWN'});
}
async function approved(store,approve,verb,id){
  requireThat(typeof approve==='function'&&await approve({verb,id,database:TARGET.database})===true,'approval_required');
  await store.check();
}
export async function issue(store,api,id,{approve,preflight,retry=false}={}){
  let r=await load(store,id);
  requireThat(retry?r.state==='WRITE_UNKNOWN':r.state==='PREPARED','reconcile_required');
  // No generic "force": operator must supply verified backup/closed-flags preflight.
  requireThat(typeof preflight==='function'&&await preflight()===true,'preflight_required');
  requireThat(digest(await store.read(`${id}.token`))===r.digest,'record_conflict');
  await store.check();await api.verify();
  const existing=await api.read(id);
  if(existing){
    inspect(r,existing); // Conflicting immutable data is a hard stop.
    throw new OperatorError('reconcile_required');
  }
  await approved(store,approve,retry?'RETRY':'ISSUE',id);
  r=await move(store,r,'WRITE_UNKNOWN');
  await store.check();await api.insert(r);
  return readback(store,api,r);
}
export async function revoke(store,api,id,{approve}={}){
  let r=await load(store,id);
  if(TERMINAL.includes(r.state)&&r.state!=='DELIVERED')return cleanup(store,r);
  await store.check();await api.verify();
  const row=await api.read(id),state=inspect(r,row);
  requireThat(state!==null,'record_absent');
  if(state!=='ISSUED')return readback(store,api,r,{revoking:true});
  await approved(store,approve,'REVOKE',id);
  r=await move(store,r,'REVOKE_UNKNOWN');
  await store.check();await api.revoke(id);
  return readback(store,api,r,{revoking:true});
}
export async function delivered(store,api,id,{approve}={}){
  let r=await load(store,id);
  requireThat(r.state==='ISSUED','reconcile_required');
  await store.check();await api.verify();
  const row=await api.read(id);
  requireThat(inspect(r,row)==='ISSUED','invitation_not_live');
  await approved(store,approve,'DELIVERED',id);
  r=await move(store,r,'DELIVERED');
  return cleanup(store,r);
}
