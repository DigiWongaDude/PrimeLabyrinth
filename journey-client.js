// G5 only. Legacy localStorage keys and mathematical engine remain untouched.
export const JOURNEY_KEY = 'between-g5-traveller-v1';
export class JourneyError extends Error {
  constructor(code, status=0) { super(code); this.status=status; }
}
export class JourneyClient {
  constructor(base, storage=localStorage, fetcher=(...args)=>fetch(...args)) {
    this.base=base.replace(/\/$/,''); this.storage=storage; this.fetcher=fetcher;
    this.record=null; this.busy=false;
    const saved=storage.getItem(JOURNEY_KEY);
    if(saved) {
      const data=JSON.parse(saved);
      if(data.api!==this.base) throw new Error('Saved credential belongs to another API. Keep your recovery code before changing servers.');
      if(!/^[0-9a-f]{64}$/.test(data.token)) throw new Error('Saved traveller credential is damaged. Use your recovery code.');
      this.record=data;
    }
  }
  get snapshot(){return this.record?.snapshot??null}
  save(){this.storage.setItem(JOURNEY_KEY,JSON.stringify(this.record))}
  async request(route, data) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await this.fetcher(`${this.base}/v1/${route}`,{
        method:data===undefined?'GET':'POST',cache:'no-store',credentials:'omit',signal:controller.signal,
        headers:{Authorization:`Bearer ${this.record.token}`,...(data===undefined?{}:{'Content-Type':'application/json'})},
        ...(data===undefined?{}:{body:JSON.stringify(data)})
      });
      const result=await response.json();
      if(!response.ok)throw new JourneyError(result.error||'server_error',response.status);
      return result;
    } finally { clearTimeout(timer); }
  }
  async connect(token=null) {
    if(this.busy)throw new Error('A save is already in progress.');
    this.busy=true;
    try {
      if(token) {
        if(this.record)throw new Error('A traveller is already stored on this browser. Resume it or use a separate browser profile.');
        if(!/^[0-9a-f]{64}$/.test(token))throw new Error('Recovery code must contain 64 lowercase hexadecimal characters.');
        // Verify imports before replacing storage, so a mistyped code does not
        // strand this browser with an unusable identity.
        this.record={api:this.base,token,registered:true,snapshot:null,pending:null};
        try{this.record.snapshot=await this.request('journey');this.save();}
        catch(error){this.record=null;throw error;}
      }
      if(!this.record) {
        const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
        this.record={api:this.base,token,registered:false,snapshot:null,pending:null};this.save();
      }
      if(!this.record.registered) {
        this.record.snapshot=await this.request('travellers',{});
        this.record.registered=true;this.save();
      }
      if(this.record.pending)return await this.flush();
      this.record.snapshot=await this.request('journey');this.save();
      return {snapshot:this.snapshot,conflict:false};
    } finally {this.busy=false;}
  }
  async move(action) {
    if(this.busy)throw new Error('A save is already in progress.');
    if(!this.snapshot)throw new Error('Connect your traveller first.');
    if(this.record.pending)throw new Error('Resolve the pending move with Retry / resume first.');
    this.busy=true;
    try {
      this.record.pending={route:action==='back'?'retrace':'advance',body:{
        requestId:crypto.randomUUID(),expectedRevision:this.snapshot.revision,
        ...(action==='back'?{}:{door:action})
      }};
      // Persist before sending: a reload after a lost response reuses this ID.
      this.save();return await this.flush();
    } finally {this.busy=false;}
  }
  async flush() {
    const pending=this.record.pending;let conflict=false;
    try {await this.request(pending.route,pending.body);}
    catch(error) {
      if(error instanceof JourneyError && [400,409].includes(error.status))conflict=true;
      else throw error; // Keep uncertain outcomes for an identical retry.
    }
    const snapshot=await this.request('journey');
    this.record.snapshot=snapshot;this.record.pending=null;this.save();
    return {snapshot,conflict};
  }
  async history(after='') {return this.request(`history${after?`?after=${encodeURIComponent(after)}`:''}`)}
}
