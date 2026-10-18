// Explicitly bounded backend-only staging checks. Never creates a traveller.
// A registration probe MUST be rejected; its random credential is never printed.
import assert from 'node:assert/strict';
const api='https://between-g5-staging-api.digiwongadude.workers.dev';
const checks=[];
async function check(name,path,{origin=api,method='GET',headers={},body}={},status,expected){
  const response=await fetch(api+path,{method,headers:{...(origin?{Origin:origin}:{}),...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,status,name);
  const data=await response.json();assert.deepEqual(data,expected,name);
  assert.equal(response.headers.get('cache-control'),'no-store',name);
  assert.equal(response.headers.get('access-control-allow-origin'),origin===api?api:null,name);
  checks.push({name,status:response.status,result:data});
}
await check('health','/v1/health',{},200,{ok:true,generation:5});
await check('empty shared archive','/v1/exploration',{},200,{
  totalLocations:0,uniqueTriples:0,contributors:0,contributions:0,recentDiscoveries:[]
});
await check('private history requires credential','/v1/history',{},401,{error:'credential_required'});
await check('private journey requires credential','/v1/journey',{},401,{error:'credential_required'});
await check('unapproved frontend rejected','/v1/health',{origin:'https://digiwongadude.com'},403,{error:'origin_not_allowed'});
await check('missing origin rejected','/v1/health',{origin:''},403,{error:'origin_not_allowed'});
const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
await check('registration closed','/v1/travellers',{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:{}
},403,{error:'registration_closed'});
await check('no discoveries created by probes','/v1/exploration',{},200,{
  totalLocations:0,uniqueTriples:0,contributors:0,contributions:0,recentDiscoveries:[]
});
console.log(JSON.stringify({api,passed:true,checks},null,2));
