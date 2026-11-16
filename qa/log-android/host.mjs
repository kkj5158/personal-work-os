// Fixed-target local QA coordinator. Secrets stay in memory or excluded private .qa files.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createPrivateKey,sign,randomUUID,randomBytes,createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
const root=path.resolve(import.meta.dirname,'../..');
const dir=path.join(root,'.qa/log-android');
const evidence='D:/DEV_Space/pos-log-android-artifacts-20261117';
const project='2b52b232-38b2-44b6-b97e-4caba54f90bc';
const scopes={dev:{env:'9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c',api:'eba7d263-7dc3-448a-a6b8-c2994721b597',auth:'d3351c87-4d62-44eb-b171-055462d0ca19',url:'https://workflow-api-development-development.up.railway.app',authUrl:'https://pos-auth-dev-development.up.railway.app'},prod:{env:'c2c20488-311f-4b9e-9ec9-d79508123176',api:'e46b58f4-e829-430f-a4c4-b27e24d46f19',url:'https://personal-work-os-prod-production.up.railway.app'}};
function cli(args){return execFileSync('cmd.exe',['/d','/c','npx','--yes','@railway/cli@5.71.0',...args],{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:120000});}
function variables(scope,service){return JSON.parse(cli(['variable','list','--project',project,'--environment',scope.env,'--service',service,'--json']));}
async function save(name,value){await fs.mkdir(evidence,{recursive:true});await fs.writeFile(path.join(evidence,name),JSON.stringify(value,null,2)+'\n');}
function png(width,height,color){
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const bytes=Buffer.concat([Buffer.from(name),data]),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length);bytes.copy(out,4);out.writeUInt32BE(crc(bytes),out.length-4);return out;};
 const head=Buffer.alloc(13);head.writeUInt32BE(width);head.writeUInt32BE(height,4);head[8]=8;head[9]=2;
 const rows=Buffer.alloc(height*(width*3+1));for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)rows[y*(width*3+1)+1+x*3+c]=Math.min(255,color[c]+Math.floor(x/width*20));
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',head),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
let adminVars;
function adminToken(){const keys=[];const walk=v=>{if(v&&typeof v==='object'){if(v.kty==='EC'&&v.d)keys.push(v);else Object.values(v).forEach(walk);}};walk(JSON.parse(adminVars.GOTRUE_JWT_KEYS));if(keys.length!==1)throw Error('AUTH_KEY_FENCE');const jwk=keys[0],now=Math.floor(Date.now()/1000),enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const data=enc({alg:'ES256',kid:jwk.kid,typ:'JWT'})+'.'+enc({iss:adminVars.GOTRUE_JWT_ISSUER,aud:adminVars.GOTRUE_JWT_AUD,role:'service_role',iat:now,exp:now+120});return data+'.'+sign('sha256',Buffer.from(data),{key:createPrivateKey({key:jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'}).toString('base64url');}
async function auth(route,method,body){const r=await fetch(scopes.dev.authUrl+'/auth/v1'+route,{method,headers:{apikey:adminVars.POS_AUTH_PUBLISHABLE_KEY,Authorization:'Bearer '+adminToken(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000),redirect:'error'});if(!r.ok)throw Error('AUTH_OPERATION_'+r.status);return r.status===204?{}:r.json();}
async function login(actor){const r=await fetch(scopes.dev.authUrl+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:adminVars.POS_AUTH_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:actor.email,password:actor.password}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('QA_LOGIN_FAILED');return r.json();}
async function request(actor,route,method='GET',body){const r=await fetch(scopes.dev.url+'/api/log'+route,{method,headers:{Authorization:'Bearer '+actor.session.access_token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('QA_HTTP_'+r.status+'_'+route.replace(/[a-f0-9-]{36}/g,'ID'));return r.status===204?{}:r.json();}
async function setup(){
 await fs.mkdir(dir,{recursive:true});
 try{await fs.access(path.join(dir,'session.json'));throw Error('EXISTING_QA_RUN_PRESERVED');}catch(e){if(e.code!=='ENOENT')throw e;}
 adminVars=variables(scopes.dev,scopes.dev.auth);
 if(adminVars.RAILWAY_ENVIRONMENT_ID!==scopes.dev.env||adminVars.RAILWAY_SERVICE_ID!==scopes.dev.auth)throw Error('DEV_AUTH_FENCE');
 const runId=randomUUID(),actors=[];const data={runId,actors};
 await fs.mkdir(path.join(evidence,'fixtures'),{recursive:true});
 for(const [i,color]of [[1,[151,180,190]],[2,[181,194,169]],[3,[213,192,165]]])await fs.writeFile(path.join(evidence,`fixtures/photo-${i}.png`),png(i===2?160:240,i===2?240:160,color));
 for(const label of ['a','b']){
  const actor={label,email:`log-qa-${runId}-${label}@example.invalid`,password:randomBytes(32).toString('base64url')};
  const user=await auth('/admin/users','POST',{email:actor.email,password:actor.password,email_confirm:true,user_metadata:{qaRunId:runId,purpose:'POS LOG Android disposable QA'}});
  actor.id=user.id;actors.push(actor);await fs.writeFile(path.join(dir,'session.json'),JSON.stringify(data));actor.session=await login(actor);
 }
 const a=actors[0];data.prefix='logqa_'+runId.slice(0,8);
 data.primary=await request(a,'/profiles','POST',{id:randomUUID(),name:'LOG Android QA',handle:data.prefix+'_a',bio:'나의 일상을 기록합니다.\nAndroid · Web 공유 검증'});
 data.secondary=await request(a,'/profiles','POST',{id:randomUUID(),name:'LOG Second QA',handle:data.prefix+'_b',bio:'프로필 분리 검증'});
 const images=[];
 for(let i=1;i<=3;i++){
  const bytes=await fs.readFile(path.join(evidence,`fixtures/photo-${i}.png`)),id=randomUUID();
  await request(a,`/profiles/${data.primary.id}/images`,'POST',{id,name:`photo-${i}.png`,sizeBytes:bytes.length,mime:'image/png',sha256:createHash('sha256').update(bytes).digest('hex')});
  const r=await fetch(`${scopes.dev.url}/api/log/profiles/${data.primary.id}/images/${id}/bytes`,{method:'PUT',headers:{Authorization:'Bearer '+a.session.access_token,'Content-Type':'application/octet-stream'},body:bytes});if(r.status!==204)throw Error('QA_UPLOAD_FAILED');
  await request(a,`/profiles/${data.primary.id}/images/${id}/complete`,'POST',{});images.push(id);
 }
 data.images=images;
 data.mediaPost=await request(a,`/profiles/${data.primary.id}/posts`,'POST',{id:randomUUID(),text:'Android Web 동기화 기준 기록\n사진 순서 1 · 2 · 3',images});
 data.textPost=await request(a,`/profiles/${data.primary.id}/posts`,'POST',{id:randomUUID(),text:'다이어트 본격적으로 시작하자.\n오래 지속할 수 있는 방법으로.',images:[]});
 await request(a,`/profiles/${data.primary.id}/active`,'PUT');
 await fs.writeFile(path.join(dir,'session.json'),JSON.stringify(data));
 await save('fixture-manifest.json',{runId,owners:actors.map(a=>a.id),profiles:[data.primary.id,data.secondary.id],mediaPost:data.mediaPost.id,imageCount:3,scope:'DEV disposable identities only',credentials:'excluded .qa/log-android/session.json'});
 console.log('DEV_QA_FIXTURES_READY');
}
async function config(){
 const dev=variables(scopes.dev,scopes.dev.auth);
 const prodApi=variables(scopes.prod,scopes.prod.api);
 const apiDev=variables(scopes.dev,scopes.dev.api);
 const prodKey=prodApi.SUPABASE_ANON_KEY||prodApi.POS_AUTH_PUBLISHABLE_KEY;
 const prodUrl=prodApi.SUPABASE_URL||prodApi.SUPABASE_AUTH_URL||prodApi.SUPABASE_JWT_ISSUER;
 // API usually exposes issuer only: retrieve public browser configuration from the existing static page.
 const html=await (await fetch('https://kafka-sys.life/login')).text();
 const scripts=[...html.matchAll(/src="([^" ]+\.js[^" ]*)"/g)].map(m=>m[1]);
 let publicKey=prodKey;
 for(const script of scripts){if(publicKey)break;const text=await(await fetch(new URL(script,'https://kafka-sys.life'))).text();publicKey=text.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];}
 if(!dev.POS_AUTH_PUBLISHABLE_KEY?.startsWith('sb_publishable_')||!publicKey?.startsWith('sb_publishable_'))throw Error('PUBLIC_KEY_DISCOVERY_FAILED');
 await fs.writeFile(path.join(root,'android-log/local.properties'),`sdk.dir=D:/AndroidDev/Sdk\nlog.devPublishableKey=${dev.POS_AUTH_PUBLISHABLE_KEY}\nlog.prodPublishableKey=${publicKey}\n`);
 await save('public-config-verification.json',{devApi:scopes.dev.url,devAuth:scopes.dev.authUrl,prodApi:scopes.prod.url,prodIssuer:prodUrl,devIssuer:apiDev.SUPABASE_JWT_ISSUER,keys:'PUBLIC publishable only; values withheld',backendChange:false});
 console.log('PUBLIC_ANDROID_CONFIGURATION_WRITTEN');
}
async function chronological(){
 const data=JSON.parse(await fs.readFile(path.join(dir,'session.json'),'utf8'));adminVars=variables(scopes.dev,scopes.dev.auth);const actor=data.actors[0];actor.session=await login(actor);
 const p=data.primary.id,created=[];let pinned;
 try{
  const old=await request(actor,`/profiles/${p}/posts/${data.mediaPost.id}`);
  pinned=await request(actor,`/profiles/${p}/posts/${old.id}`,'PATCH',{revision:old.revision,action:'pinned',value:true});
  for(let i=0;i<35;i++)created.push(await request(actor,`/profiles/${p}/posts`,'POST',{id:randomUUID(),text:'Chronological QA '+i,images:[]}));
  const normal=await request(actor,`/profiles/${p}/posts?limit=30`),mobile=await request(actor,`/profiles/${p}/posts?chronological=true&limit=30`);
  if(normal.posts[0].id!==old.id||mobile.posts[0].id!==created.at(-1).id||mobile.posts.some(x=>x.id===old.id)||mobile.nextOffset!==30)throw Error('CHRONOLOGICAL_CONTRACT_FAILED');
  await save('dev-chronological-contract.json',{status:'PASS',normalKeepsPinnedFirst:true,nativeLatestFirstAcrossPagination:true,boundedPageSize:30,temporaryPosts:35,scope:'DEV owned synthetic actor',observedAt:new Date().toISOString()});
 }finally{
  for(const post of created)await request(actor,`/profiles/${p}/posts/${post.id}/delete`,'POST',{revision:post.revision,confirm:true});
  if(pinned)await request(actor,`/profiles/${p}/posts/${pinned.id}`,'PATCH',{revision:pinned.revision,action:'pinned',value:false});
 }
 console.log('DEV_CHRONOLOGICAL_CONTRACT_PASS');
}
async function cleanup(){
 const file=path.join(dir,'session.json'),data=JSON.parse(await fs.readFile(file,'utf8'));
 adminVars=variables(scopes.dev,scopes.dev.auth);
 for(const actor of data.actors){const user=await auth('/admin/users/'+actor.id,'GET');if(user.email!==actor.email||user.user_metadata?.qaRunId!==data.runId)throw Error('CLEANUP_IDENTITY_FENCE');}
 const apiVars=variables(scopes.dev,scopes.dev.api);
 const raw=execFileSync(process.execPath,[path.join(root,'qa/log-hosted-fixture-cleanup.mjs'),data.runId,...data.actors.map(a=>a.id)],{cwd:root,env:{...process.env,...apiVars},encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:600000});
 if(!raw.includes('SYNTHETIC_LOG_CLEANUP_PASS'))throw Error('FIXTURE_CLEANUP_FAILED');
 for(const actor of data.actors){const response=await fetch(scopes.dev.authUrl+'/auth/v1/admin/users/'+actor.id,{headers:{apikey:adminVars.POS_AUTH_PUBLISHABLE_KEY,Authorization:'Bearer '+adminToken()},signal:AbortSignal.timeout(30000)});if(response.status!==404)throw Error('AUTH_IDENTITY_REMAINS');}
 await save('fixture-cleanup.json',{status:'PASS',runId:data.runId,owners:data.actors.map(a=>a.id),scope:'DEV exact synthetic run only',databaseRowsRemoved:true,providerExactKeysAcknowledged:true,authUsersAbsent:true,productionChanged:false,finishedAt:new Date().toISOString()});
 for(const name of ['session.json','device.json'])await fs.unlink(path.join(dir,name)).catch(e=>{if(e.code!=='ENOENT')throw e;});
 console.log('DEV_SYNTHETIC_DATA_OBJECT_AUTH_CLEANUP_PASS');
}
async function main(){const command=process.argv[2];if(command==='config')await config();else if(command==='setup')await setup();else if(command==='chronological')await chronological();else if(command==='cleanup')await cleanup();else if(command==='readback'){
 const data=JSON.parse(await fs.readFile(path.join(dir,'session.json'),'utf8'));adminVars=variables(scopes.dev,scopes.dev.auth);data.actors[0].session=await login(data.actors[0]);await fs.writeFile(path.join(dir,'session.json'),JSON.stringify(data));const f=await request(data.actors[0],`/profiles/${data.primary.id}/posts`);await save('dev-native-readback.json',{observedAt:new Date().toISOString(),posts:f.posts,stats:f.stats});console.log('DEV_READBACK_SAVED');
}else throw Error('Use config, setup, readback');}
main().catch(async e=>{await save('host-error.json',{status:'FAIL',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'HOST_OPERATION_FAILED'});console.error('LOG_ANDROID_HOST_FAILED: sensitive details withheld');process.exitCode=1;});
