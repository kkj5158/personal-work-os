// Run through official Railway CLI `run` against pos-auth-dev. No credentials are logged or persisted.
// Uses a disposable GoTrue identity, normal password authentication, real two-stage OAuth consent,
// MCP SDK tool calls and canonical backend persisted rereads. It never uses the owner's session.
import {createPrivateKey,sign,randomBytes,randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {Client} from '../integrations/orbit-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StreamableHTTPClientTransport} from '../integrations/orbit-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import {createRemoteJWKSet,jwtVerify} from '../integrations/orbit-mcp/node_modules/jose/dist/webapi/index.js';
const issuer='https://orbit-pos-mcp-dev-development.up.railway.app',auth='https://pos-auth-dev-development.up.railway.app/auth/v1',api='https://workflow-api-development-development.up.railway.app',web='https://workflow-web-development-development.up.railway.app';
const resource=issuer+'/mcp',callback='https://chatgpt.com/connector_platform_oauth_redirect',runId=randomUUID(),email=`orbit-money-qa-${runId}@example.invalid`,password=randomBytes(32).toString('base64url');
const report={runId,environment:'DEV',method:'REAL_HOSTED_SYNTHETIC_OAUTH_MCP_BACKEND',checks:[],inChatCall:false,ownerSessionUsed:false,startedAt:new Date().toISOString()};
let owner,native,readSession,writeSession,clientMetadata,jwk;
function ok(v,name){if(!v)throw Error(name);report.checks.push({name,status:'PASS'});}
function admin(){const now=Math.floor(Date.now()/1000),enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const payload=enc({alg:'ES256',kid:jwk.kid,typ:'JWT'})+'.'+enc({iss:process.env.GOTRUE_JWT_ISSUER,aud:process.env.GOTRUE_JWT_AUD,role:'service_role',iat:now,exp:now+120});return payload+'.'+sign('sha256',Buffer.from(payload),{key:createPrivateKey({key:jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'}).toString('base64url');}
async function authRequest(path,method,body,token=admin()){return fetch(auth+path,{method,headers:{apikey:process.env.POS_AUTH_PUBLISHABLE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});}
async function backend(path,method='GET',body,token=native){const r=await fetch(api+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('BACKEND_HTTP_'+r.status);return r.json();}
async function oauth(scope){
 const jar=new Map(),verifier=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url');
 const url=new URL(issuer+'/auth');for(const[k,v]of Object.entries({client_id:clientMetadata.client_id,redirect_uri:callback,response_type:'code',scope,resource,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'consent'}))url.searchParams.set(k,v);
 let current=url.toString(),nativeConsent=false,brokerConsent=false;
 async function request(target,init={}){const origin=new URL(target).origin;if(![issuer,new URL(auth).origin,web].includes(origin))throw Error('OAUTH_ORIGIN_FENCE');const headers=new Headers(init.headers);if(jar.has(origin))headers.set('Cookie',[...jar.get(origin)].map(([k,v])=>k+'='+v).join('; '));const r=await fetch(target,{...init,headers,redirect:'manual',signal:AbortSignal.timeout(20000)});const cookies=jar.get(origin)??new Map();for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}jar.set(origin,cookies);return r;}
 for(let i=0;i<30;i++){
  const u=new URL(current);
  if(current.startsWith(callback)){
   ok(u.searchParams.get('state')===state&&!u.searchParams.has('error')&&u.searchParams.has('code'),'OAUTH_CALLBACK_'+scope);
   const r=await fetch(issuer+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientMetadata.client_id,redirect_uri:callback,code:u.searchParams.get('code'),code_verifier:verifier,resource}),redirect:'error'});const session=await r.json();ok(r.status===200&&session.refresh_token,'OAUTH_CODE_PKCE_'+scope);
   const verified=await jwtVerify(session.access_token,createRemoteJWKSet(new URL(issuer+'/jwks')),{issuer,audience:resource,algorithms:['ES256'],typ:'at+jwt'});ok(verified.payload.sub===owner&&verified.payload.client_id===clientMetadata.client_id&&scope.split(' ').every(s=>verified.payload.scope.split(' ').includes(s)),'OAUTH_IDENTITY_SCOPES_'+scope);report.checks.push({name:'TWO_STAGE_CONSENT_'+scope,status:'PASS',nativeConsent,brokerConsent});return session;
  }
  if(u.origin===web&&u.pathname==='/oauth/consent'){
   const id=u.searchParams.get('authorization_id');ok(Boolean(id),'NATIVE_CONSENT_REQUEST');const details=await authRequest('/oauth/authorizations/'+encodeURIComponent(id),'GET',undefined,native);const d=await details.json();ok(details.ok&&(d.scope==='openid'||d.redirect_url),'NATIVE_CONSENT_DETAILS');
   if(d.redirect_url){current=d.redirect_url;nativeConsent=true;continue;}
   ok(d.redirect_uri===issuer+'/interaction/upstream','NATIVE_CALLBACK_BOUNDARY');const accepted=await authRequest('/oauth/authorizations/'+encodeURIComponent(id)+'/consent','POST',{action:'approve'},native);const a=await accepted.json();ok(accepted.ok&&a.redirect_url,'NATIVE_EXPLICIT_APPROVAL');nativeConsent=true;current=a.redirect_url;continue;
  }
  const r=await request(current);
  if(r.status>=300&&r.status<400){current=new URL(r.headers.get('location'),current).toString();continue;}
  const html=await r.text(),csrf=html.match(/name="csrf" value="([^"]+)"/)?.[1];if(!csrf)throw Error('OAUTH_INTERACTION_HTTP_'+r.status);
  ok(html.includes('orbit:read')&&(!scope.includes('orbit:write:money')||html.includes('orbit:write:money')),'BROKER_SCOPE_DISCLOSURE');
  const accepted=await request(issuer+'/interaction/confirm',{method:'POST',headers:{Origin:issuer,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,decision:'allow'})});ok(accepted.status===303,'BROKER_EXPLICIT_APPROVAL');brokerConsent=true;current=new URL(accepted.headers.get('location'),issuer).toString();
 }
 throw Error('OAUTH_REDIRECT_LIMIT');
}
async function mcp(session,exercise){const c=new Client({name:'MONEY isolated hosted QA',version:'1'});try{await c.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:'Bearer '+session.access_token}}}));return await exercise(c);}finally{await c.close();}}
async function tool(c,name,args={}){const r=await c.callTool({name,arguments:args});if(r.isError)throw Error('MCP_CALL_FAILED_'+name);return JSON.parse(r.content[0].text).data;}
try{
 if(new URL(process.env.API_EXTERNAL_URL??'https://invalid.invalid').origin!==new URL(auth).origin)throw Error('DEV_AUTH_IDENTITY_FENCE');
 const keys=[];function find(v){if(v&&typeof v==='object'){if(v.kty==='EC'&&v.d)keys.push(v);else Object.values(v).forEach(find);}}find(JSON.parse(process.env.GOTRUE_JWT_KEYS??'null'));if(keys.length!==1)throw Error('DEV_AUTH_KEY_FENCE');jwk=keys[0];
 const created=await authRequest('/admin/users','POST',{email,password,email_confirm:true,user_metadata:{qaRunId:runId,purpose:'ORBIT MONEY disposable integration QA'}});const user=await created.json();ok(created.ok&&user.email===email&&user.user_metadata?.qaRunId===runId,'CREATE_OWNED_SYNTHETIC_IDENTITY');owner=user.id;
 const login=await fetch(auth+'/token?grant_type=password',{method:'POST',headers:{apikey:process.env.POS_AUTH_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password}),redirect:'error'});const signedIn=await login.json();ok(login.ok&&signedIn.user?.id===owner,'NORMAL_SYNTHETIC_PASSWORD_AUTH');native=signedIn.access_token;
 await backend('/api/money/accounts');
 const registration=await fetch(issuer+'/reg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'ORBIT MONEY synthetic '+runId,redirect_uris:[callback],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',scope:'orbit:read orbit:write:money'})});clientMetadata=await registration.json();ok(registration.status===201,'REAL_DCR');
 readSession=await oauth('orbit:read');
 await mcp(readSession,async c=>{const list=await c.listTools();ok(list.tools.length===74,'TOOL_DISCOVERY_74');for(const t of list.tools.filter(t=>t.name.startsWith('get_'))){const r=await c.callTool({name:t.name,arguments:{}});ok(!r.isError,'LEGACY_'+t.name);}const r=await c.callTool({name:'money_create_category',arguments:{requestId:randomUUID(),name:'Must not be saved',kind:'EXPENSE',color:'#123456'}});ok(r.isError,'READ_GRANT_WRITE_DENIED');});
 writeSession=await oauth('orbit:read orbit:write:money');
 await mcp(writeSession,async c=>{
  const requestId=randomUUID(),args={requestId,name:'합성 QA 카테고리',kind:'EXPENSE',color:'#123456'},created=await tool(c,'money_create_category',args);ok(created.status==='APPLIED','REAL_MCP_CATEGORY_CREATE');const cat=created.result.persisted;
  const replay=await tool(c,'money_create_category',args);ok(replay.result.persisted.id===cat.id,'IDEMPOTENT_CREATE_REPLAY');
  const change=await tool(c,'money_set_category_color',{requestId:randomUUID(),categoryId:cat.id,expectedVersion:cat.version,expectedColor:cat.color,color:'#abcdef'});ok(change.status==='APPLIED'&&change.result.persisted.version===cat.version,'REAL_COLOR_CAS_SEMANTIC_VERSION');
  const categories=await backend('/api/money/categories');ok(categories.some(v=>v.id===cat.id&&v.color==='#abcdef'),'CANONICAL_PERSISTED_COLOR_REREAD');
  const outcome=await tool(c,'money_get_operation_outcome',{requestId});ok(outcome.status==='APPLIED','LOST_RESPONSE_OUTCOME_RECOVERY');
  const account=await backend('/api/money/accounts','POST',{provider:'TEST',displayName:'ORBIT MONEY QA disposable',role:'SPENDING',maskedReference:null,suffix:null});
  await backend('/api/money/tracking','PUT',{expense:[account.id],income:[],expectedVersion:0});
  const fact=await backend('/api/money/transactions','POST',{type:'EXPENSE',fromAccountId:account.id,toAccountId:null,amount:1200,occurredAt:new Date().toISOString(),counterpartyText:'SYNTHETIC ORBIT QA',categoryId:null,memo:'Synthetic fixture only',excluded:false});
  const current=await tool(c,'money_get_bookkeeping_item',{id:fact.id});
  const classified=await tool(c,'money_set_bookkeeping_category',{requestId:randomUUID(),items:[{id:fact.id,transactionVersion:current.book.transactionVersion,overrideVersion:current.book.version,projectionVersion:current.book.projectionVersion,classificationVersion:current.classification.version,categoryId:cat.id}]});ok(classified.status==='APPLIED','REAL_MCP_CLASSIFICATION');
  const actual=await backend('/api/money/bookkeeping/'+fact.id);ok(actual.categoryId===cat.id,'CANONICAL_PERSISTED_CLASSIFICATION_REREAD');
  const original=await backend('/api/money/transactions/'+fact.id);ok(Number(original.amount)===1200&&original.type==='EXPENSE'&&original.fromAccountId===account.id,'FINANCIAL_FACTS_UNCHANGED');
 });
 const refresh=await fetch(issuer+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:clientMetadata.client_id,refresh_token:writeSession.refresh_token,resource}),redirect:'error'});const rotated=await refresh.json();ok(refresh.ok&&rotated.refresh_token!==writeSession.refresh_token,'HOSTED_REFRESH_ROTATION');writeSession=rotated;
 report.status='PASS';
}catch(e){report.status='FAIL';report.reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:'HOSTED_QA_FAILED';process.exitCode=1;}
finally{
 const cleanup={oauthGrants:'NOT_CREATED',moneyFixture:'NOT_CREATED',authIdentity:'NOT_CREATED'};
 if(clientMetadata)try{for(const session of [readSession,writeSession])if(session?.refresh_token)await fetch(issuer+'/token/revocation',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientMetadata.client_id,token:session.refresh_token,token_type_hint:'refresh_token'})});cleanup.oauthGrants='PASS';}catch{cleanup.oauthGrants='FAIL';}
 if(owner)try{
  const result=execFileSync('cmd.exe',['/d','/c','railway','run','--project','2b52b232-38b2-44b6-b97e-4caba54f90bc','--environment','9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c','--service','eba7d263-7dc3-448a-a6b8-c2994721b597','--no-local','--','node','qa/orbit-money-fixture-cleanup.mjs',owner,runId],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:60000});if(!result.includes('SYNTHETIC_MONEY_CLEANUP_PASS'))throw Error();cleanup.moneyFixture='PASS';
 }catch{cleanup.moneyFixture='FAIL';}
 if(owner)try{const r=await authRequest('/admin/users/'+owner,'DELETE');cleanup.authIdentity=r.ok?'PASS':'FAIL';}catch{cleanup.authIdentity='FAIL';}
 report.cleanup=cleanup;report.finishedAt=new Date().toISOString();if(Object.values(cleanup).includes('FAIL')){process.exitCode=1;report.fixture={owner,runId,email};}
 if(process.env.ORBIT_MONEY_QA_REPORT)writeFileSync(process.env.ORBIT_MONEY_QA_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
