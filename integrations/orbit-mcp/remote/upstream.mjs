import {createRemoteJWKSet,jwtVerify} from 'jose';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';

export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const opaque=()=>randomBytes(32).toString('base64url');
export const challenge=v=>createHash('sha256').update(v).digest('base64url');
export function equal(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}

export class Upstream {
 constructor(config,store,{fetcher=fetch,jwks}={}){
  this.config=config;this.store=store;this.fetch=fetcher;
  this.jwks=jwks??createRemoteJWKSet(new URL(config.auth+'/.well-known/jwks.json'),{timeoutDuration:5000,cooldownDuration:30000});
  this.locks=new Map();
 }
 authorize(uid){
  const state=opaque(),verifier=opaque(),nonce=opaque();
  this.store.put('UpstreamState',state,{uid,verifier,nonce},300);
  const url=new URL(this.config.auth+'/oauth/authorize');
  for(const[k,v]of Object.entries({client_id:this.config.upstreamClient,redirect_uri:this.config.issuer+'/interaction/upstream',response_type:'code',scope:'openid',state,nonce,code_challenge:challenge(verifier),code_challenge_method:'S256'}))url.searchParams.set(k,v);
  return url.toString();
 }
 async request(path,form){
  const response=await this.fetch(this.config.auth+path,{method:'POST',headers:{apikey:this.config.publishableKey,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('POS_AUTH_UNAVAILABLE');
  const text=await response.text();if(text.length>65536)throw Error('POS_AUTH_UNAVAILABLE');
  return JSON.parse(text);
 }
 async validate(token,{identity=false,nonce}={}){
  const {payload}=await jwtVerify(token,this.jwks,{algorithms:['ES256'],issuer:this.config.authIssuer,audience:identity?this.config.upstreamClient:'authenticated',requiredClaims:['exp','iat','sub'],clockTolerance:5});
  if(!uuid.test(payload.sub)||payload.exp<=Math.floor(Date.now()/1000))throw Error('POS_IDENTITY_INVALID');
  if(identity){if(!equal(payload.nonce,nonce))throw Error('POS_IDENTITY_INVALID');}
  else if(payload.role!=='authenticated'||payload.client_id!==this.config.upstreamClient)throw Error('POS_IDENTITY_INVALID');
  return payload;
 }
 async callback(uid,state,code){
  const saved=this.store.take('UpstreamState',state);
  if(!saved||saved.uid!==uid||!code||code.length>2048)throw Error('POS_STATE_INVALID');
  const session=await this.request('/oauth/token',{grant_type:'authorization_code',client_id:this.config.upstreamClient,redirect_uri:this.config.issuer+'/interaction/upstream',code,code_verifier:saved.verifier});
  const user=await this.validate(session.access_token);
  const identity=await this.validate(session.id_token,{identity:true,nonce:saved.nonce});
  if(user.sub!==identity.sub||!session.refresh_token)throw Error('POS_IDENTITY_INVALID');
  this.store.put('Upstream',user.sub,{access:session.access_token,refresh:session.refresh_token,expires:user.exp},30*86400);
  return user.sub;
 }
 async token(sub){
  if(!uuid.test(sub))throw Error('POS_IDENTITY_INVALID');
  // One service replica with a persistent volume; serialize rotation for each user.
  const previous=this.locks.get(sub)??Promise.resolve();
  let release;const gate=new Promise(r=>release=r);const queued=previous.catch(()=>{}).then(()=>gate);this.locks.set(sub,queued);
  await previous.catch(()=>{});
  try{
   let saved=this.store.get('Upstream',sub);if(!saved)throw Error('POS_REAUTH_REQUIRED');
   if(saved.expires<Math.floor(Date.now()/1000)+60){
    const session=await this.request('/oauth/token',{grant_type:'refresh_token',client_id:this.config.upstreamClient,refresh_token:saved.refresh});
    const user=await this.validate(session.access_token);
    if(user.sub!==sub||!session.refresh_token)throw Error('POS_IDENTITY_INVALID');
    saved={access:session.access_token,refresh:session.refresh_token,expires:user.exp};
    this.store.put('Upstream',sub,saved,30*86400);
   }
   const user=await this.validate(saved.access);if(user.sub!==sub)throw Error('POS_IDENTITY_INVALID');
   return saved.access;
  }finally{release();if(this.locks.get(sub)===queued)this.locks.delete(sub);}
 }
}
