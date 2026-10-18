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
console.log(JSON.stringify({passed:true,travellerId:second.snapshot.travellerId,activePath:second.snapshot.activePath,
  revision:second.snapshot.revision,history:history.visits.map(v=>({path:v.path,triple:v.triple}))},null,2));
