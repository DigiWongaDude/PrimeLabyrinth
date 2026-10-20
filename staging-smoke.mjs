// Explicitly bounded backend-only staging checks. Never creates a traveller.
// A registration probe MUST be rejected; its random credential is never printed.
import assert from 'node:assert/strict';
const api='https://between-g5-staging-api.digiwongadude.workers.dev';
const checks=[];
async function check(name,path,{origin=api,method='GET',headers={},body}={},status,expected){
  const response=await fetch(api+path,{method,headers:{...(origin?{Origin:origin}:{}),...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,status,name);
  const data=await response.json(); if (expected !== undefined) assert.deepEqual(data,expected,name);
  assert.equal(response.headers.get('cache-control'),'no-store',name);
  assert.equal(response.headers.get('access-control-allow-origin'),origin===api?api:null,name);
  const checkResult={name,status:response.status,result:data}; checks.push(checkResult); return checkResult;
}
await check('health','/v1/health',{},200,{ok:true,generation:5});
const archiveBefore = await check('shared archive is readable','/v1/exploration',{},200,undefined);
await check('private history requires credential','/v1/history',{},401,{error:'credential_required'});
await check('private journey requires credential','/v1/journey',{},401,{error:'credential_required'});
await check('unapproved frontend rejected','/v1/health',{origin:'https://digiwongadude.com'},403,{error:'origin_not_allowed'});
await check('missing origin rejected','/v1/health',{origin:''},403,{error:'origin_not_allowed'});
const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
await check('unknown legacy credential cannot register','/v1/travellers',{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:{}
},403,{error:'use_account_signup'});
const archiveAfter = await check('no discoveries created by probes','/v1/exploration',{},200,undefined);
assert.deepEqual(archiveAfter.result, archiveBefore.result, 'probes changed the shared archive');
console.log(JSON.stringify({api,passed:true,checks},null,2));
