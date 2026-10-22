// G5 accounts only. Bearer sessions live in this tab, never in share links or
// persistent localStorage. Legacy recovery-code storage is not silently removed.
import {JourneyClient, JourneyError} from './journey-client.js';
const ACCOUNT_KEY='between-g5-account-v1', OAUTH_KEY='between-g5-google-v1';
const JOURNEY_KEY='between-g5-account-journey-v1';
export class AccountClient {
  constructor(base,storage=sessionStorage,fetcher=(...args)=>fetch(...args)){
    this.base=base.replace(/\/$/,'');this.storage=storage;this.fetcher=fetcher;
    this.session=JSON.parse(storage.getItem(ACCOUNT_KEY)||'null');
    if(this.session?.api!==this.base)this.session=null;
    const scoped={getItem:()=>storage.getItem(JOURNEY_KEY),setItem:(_,value)=>storage.setItem(JOURNEY_KEY,value)};
    this.journey=new JourneyClient(this.base,scoped,fetcher);
  }
  async request(route,data,token=this.session?.token){
    const response=await this.fetcher(`${this.base}/v1/${route}`,{
      method:data===undefined?'GET':'POST',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000),
      headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(data===undefined?{}:{'Content-Type':'application/json'})},
      ...(data===undefined?{}:{body:JSON.stringify(data)})
    });
    const result=await response.json();
    if(!response.ok)throw new JourneyError(result.error||'server_error',response.status);
    return result;
  }
  async accept(result){
    const old=this.journey.record;
    if(old?.pending && this.session?.profile?.publicId!==result.profile.publicId)throw new Error('Resolve your pending move before changing travellers.');
    // Rotation/recovery has already invalidated the old token. Keep the new
    // credential even when the following journey fetch loses its connection.
    this.session={api:this.base,token:result.token,expiresAt:result.expiresAt,profile:result.profile};
    this.storage.setItem(ACCOUNT_KEY,JSON.stringify(this.session));
    this.journey.record={api:this.base,token:result.token,registered:true,snapshot:null,pending:null};
    try{
      const snapshot=await this.journey.request('journey');
      if(old?.pending && old.snapshot?.travellerId!==snapshot.travellerId)throw new Error('Resolve your pending move before changing travellers.');
      this.journey.record.snapshot=snapshot;
      if(old?.snapshot?.travellerId===snapshot.travellerId)this.journey.record.pending=old.pending;
      this.journey.save();
      return {journey:await this.journey.connect(),recoveryKey:result.recoveryKey,profile:result.profile};
    }catch(error){
      // If the first fetch failed, retain the old snapshot/pending command for
      // resume; never restore an already-revoked session credential.
      if(!this.journey.record.snapshot)this.journey.record=old;
      throw error;
    }
  }
  async login(username,password){return this.accept(await this.request('auth/login',{username,password},null))}
  async signup(username,password,displayName,legacyToken=null,invitation=undefined){
    return this.accept(await this.request(legacyToken?'auth/upgrade':'auth/signup',{
      username,password,displayName,...(!legacyToken&&invitation!==undefined?{invitation}:{})
    },legacyToken));
  }
  async recover(publicId,recoveryKey,username,password){
    return this.accept(await this.request('auth/recover',{publicId,recoveryKey,username,password},null));
  }
  async resume(){
    if(!this.session)throw new Error('Sign in to resume your traveller.');
    // Rotation is explicit and preserves authentication age: it cannot extend
    // permission for sensitive settings without signing in again.
    return this.accept(await this.request('auth/rotate',{}));
  }
  async logout(){
    if(this.journey.record?.pending)throw new Error('Retry your pending move before signing out.');
    await this.request('auth/logout',{});
    this.clear();
  }
  clear(){this.storage.removeItem(ACCOUNT_KEY);this.storage.removeItem(JOURNEY_KEY);this.session=null;this.journey.record=null;}
  async name(displayName){
    const profile=await this.request('account/name',{displayName});this.session.profile=profile;
    this.storage.setItem(ACCOUNT_KEY,JSON.stringify(this.session));return profile;
  }
  async changePassword(currentPassword,username,password){return this.accept(await this.request('account/password',{currentPassword,username,password}))}
  async recoveryKey(){return this.accept(await this.request('account/recovery',{}))}
  async anonymise(confirmation){
    if(this.journey.record?.pending)throw new Error('Retry your pending move before deleting your account.');
    await this.request('account/anonymise',{confirmation});this.clear();
  }
  async startGoogle(mode,displayName,legacyToken=null,invitation=undefined){
    const verifier=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
    const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const result=await this.request('auth/google/start',{
      mode,challenge,displayName,...(mode==='login'&&invitation!==undefined?{invitation}:{})
    },mode==='migrate'?legacyToken:mode==='login'?null:this.session?.token);
    this.storage.setItem(OAUTH_KEY,JSON.stringify({api:this.base,state:result.state,verifier,mode,legacyToken}));
    return result.url;
  }
  async completeGoogle(params){
    const saved=JSON.parse(this.storage.getItem(OAUTH_KEY)||'null');
    this.storage.removeItem(OAUTH_KEY);
    if(!saved||saved.api!==this.base||params.get('state')!==saved.state||!params.get('code')||params.has('error'))throw new Error('Google sign-in was cancelled or expired. Please try again.');
    return this.accept(await this.request('auth/google/complete',{state:saved.state,code:params.get('code'),verifier:saved.verifier},saved.mode==='migrate'?saved.legacyToken:saved.mode==='login'?null:this.session?.token));
  }
}
