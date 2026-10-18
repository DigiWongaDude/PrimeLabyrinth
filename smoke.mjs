// Against LOCAL Wrangler only. Generated test credential never printed or saved.
import assert from 'node:assert/strict';
import { JourneyClient } from './journey-client.js';
const api='http://localhost:8787';
function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)}}
const fetcher=(url,options)=>fetch(url,{...options,headers:{...options.headers,Origin:'http://localhost:4175'}});
const first=new JourneyClient(api,storage(),fetcher);
await first.connect();await first.move(0);await first.move(0);
const second=new JourneyClient(api,storage(),fetcher);
await second.connect(first.record.token);
assert.deepEqual(second.snapshot,first.snapshot);
await second.move('back');
assert.equal(second.snapshot.activePath,'0');
const history=await second.history();assert.equal(history.visits.length,3);
assert.equal((await first.connect()).snapshot.activePath,'0');
async function sharedStats(){
  const response=await fetch(`${api}/v1/exploration`,{headers:{Origin:'http://localhost:4175'}});
  assert.equal(response.status,200);return response.json();
}
const before=await sharedStats();
const anotherTraveller=new JourneyClient(api,storage(),fetcher);
await anotherTraveller.connect();await anotherTraveller.move(0);await anotherTraveller.move(0);
assert.notEqual(anotherTraveller.snapshot.travellerId,first.snapshot.travellerId);
assert.equal(anotherTraveller.snapshot.sharedDiscovery.isFirstDiscoverer,false);
const after=await sharedStats();
assert.equal(after.totalLocations,before.totalLocations);
assert.equal(after.uniqueTriples,before.uniqueTriples);
assert.equal(after.contributors,before.contributors+1);
assert.equal(after.contributions,before.contributions+3);
await first.connect();
assert.equal(first.snapshot.activePath,'0');
assert.equal(first.snapshot.historyCount,3);
console.log(JSON.stringify({passed:true,travellerId:second.snapshot.travellerId,activePath:second.snapshot.activePath,
  revision:second.snapshot.revision,history:history.visits.map(v=>({path:v.path,triple:v.triple})),
  shared:{totalLocations:after.totalLocations,uniqueTriples:after.uniqueTriples,newTravellerContributions:after.contributions-before.contributions}},null,2));
