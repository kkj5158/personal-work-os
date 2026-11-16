// Run through official Railway CLI `run` against pos-auth-dev. No credentials are logged or persisted.
// Uses a disposable GoTrue identity, normal password authentication, real two-stage OAuth consent,
// MCP SDK tool calls and canonical backend persisted rereads. It never uses the owner's session.
import {createPrivateKey,sign,randomBytes,randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {writeFileSync,readFileSync} from 'node:fs';
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
async function tool(c,name,args={}){await new Promise(resolve=>setTimeout(resolve,2400));const r=await c.callTool({name,arguments:args});if(r.isError){const code=r.content?.[0]?.text?.match(/^(VALIDATION|FORBIDDEN|CONFLICT|RATE_LIMIT|OUTCOME_UNKNOWN):/)?.[1]??'UNKNOWN';throw Error('MCP_CALL_FAILED_'+name.toUpperCase()+'_'+code);}return JSON.parse(r.content[0].text).data;}

try{
 if(new URL(process.env.API_EXTERNAL_URL??'https://invalid.invalid').origin!==new URL(auth).origin)throw Error('DEV_AUTH_IDENTITY_FENCE');
 const keys=[];function find(v){if(v&&typeof v==='object'){if(v.kty==='EC'&&v.d)keys.push(v);else Object.values(v).forEach(find);}}find(JSON.parse(process.env.GOTRUE_JWT_KEYS??'null'));if(keys.length!==1)throw Error('DEV_AUTH_KEY_FENCE');jwk=keys[0];
 const created=await authRequest('/admin/users','POST',{email,password,email_confirm:true,user_metadata:{qaRunId:runId,purpose:'ORBIT MONEY disposable statement reconciliation QA'}});const user=await created.json();ok(created.ok&&user.email===email,'CREATE_OWNED_SYNTHETIC_IDENTITY');owner=user.id;
 const login=await fetch(auth+'/token?grant_type=password',{method:'POST',headers:{apikey:process.env.POS_AUTH_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password}),redirect:'error'});const signed=await login.json();ok(login.ok&&signed.user?.id===owner,'NORMAL_SYNTHETIC_PASSWORD_AUTH');native=signed.access_token;
 const account=await backend('/api/money/accounts','POST',{provider:'IBK',displayName:'Synthetic statement verification',role:'SPENDING',maskedReference:'975-******-01-014',suffix:null});
 const registration=await fetch(issuer+'/reg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'MONEY reconciliation synthetic '+runId,redirect_uris:[callback],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',scope:'orbit:read orbit:write:money'})});clientMetadata=await registration.json();ok(registration.status===201,'REAL_DCR');
 readSession=await oauth('orbit:read');
 await mcp(readSession,async c=>{ok((await c.listTools()).tools.length===88,'REMOTE_CATALOG_88');const denied=await c.callTool({name:'money_recon_intake_start',arguments:{accountId:account.id,provider:'IBK',format:'PDF',sha256:'a'.repeat(64),byteLength:100}});ok(denied.isError,'READ_GRANT_STATEMENT_UPLOAD_DENIED');});
 writeSession=await oauth('orbit:read orbit:write:money');
 await mcp(writeSession,async c=>{
  const cap=await tool(c,'money_recon_get_capabilities');ok(cap.privateRetentionConfigured&&cap.maxBatch===50,'REMOTE_PRIVATE_RETENTION_READY');
  const bytes=readFileSync(process.env.MONEY_RECON_SOURCE_FILE);const start=await tool(c,'money_recon_intake_start',{accountId:account.id,provider:'IBK',format:'PDF',sha256:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length});
  for(let offset=0,index=0;offset<bytes.length;offset+=30000,index++)await tool(c,'money_recon_intake_chunk',{uploadId:start.uploadId,index,base64:bytes.subarray(offset,Math.min(bytes.length,offset+30000)).toString('base64')});
  const imported=await tool(c,'money_recon_import_statement_preview',{uploadId:start.uploadId});const statement=imported.statement;
  ok(statement.row_count===359&&Number(statement.outflow)===5479095&&Number(statement.inflow)===5554800&&Number(statement.final_balance)===78125,'REMOTE_REAL_IBK_359_TOTALS_CONTINUITY');
  const ledger=await backend('/api/money/transactions');ok(ledger.total===0,'IMPORT_HAS_ZERO_LEDGER_WRITES');
  const repeated=await tool(c,'money_recon_import_statement_preview',{uploadId:start.uploadId});ok(repeated.status==='ALREADY_IMPORTED'&&repeated.statement.id===statement.id,'DUPLICATE_FILE_IDEMPOTENT');
  const analysis=await tool(c,'money_recon_analyze',{statementId:statement.id});ok(analysis.rowCount===359,'REMOTE_DURABLE_ANALYSIS_359');
  const rows=await tool(c,'money_recon_list_rows',{id:statement.id,limit:25,offset:0});const netflix=rows.items.find(r=>r.row_number===16);ok(netflix&&Number(netflix.amount)===17000,'EXACT_IMMUTABLE_BANK_ROW_SELECTED');
  const preview=await tool(c,'money_recon_batch_preview',{runId:analysis.runId,items:[{rowId:netflix.id,action:'REGISTER_CASH'}]});ok(preview.approval==='APPROVAL_REQUIRED'&&(await backend('/api/money/transactions')).total===0,'PREVIEW_ROLLBACK_NO_FINANCIAL_WRITE');
  const requestId=randomUUID(),args={previewId:preview.previewId,fingerprint:preview.fingerprint,requestId,confirmed:true};const executed=await tool(c,'money_recon_batch_execute',args);ok(executed.status==='APPLIED','SYNTHETIC_EXACT_PREVIEW_EXECUTION');const replay=await tool(c,'money_recon_batch_execute',args);ok(replay.status==='APPLIED'&&(await backend('/api/money/transactions')).total===1,'DURABLE_REQUEST_REPLAY_CASH_ONCE');
  const outcome=await tool(c,'money_get_operation_outcome',{requestId});ok(outcome.status==='APPLIED','UNKNOWN_RESPONSE_ORIGINAL_REQUEST_RECOVERY');
  const source=await tool(c,'money_recon_get_candidate_details',{id:netflix.id});ok(source.status==='BOOKED_CONFIRMED'&&source.newCashAllowed===false,'POSTEXECUTION_STATEMENT_EFFECT_DEDUP');
  const observation=await tool(c,'money_get_statement_balance_observation',{id:statement.id});ok(Number(observation.finalBalance)===78125&&observation.doesNotSetCurrentAccountBalance,'BANK_OBSERVATION_NOT_BALANCE_MUTATION');
  const foreign=await c.callTool({name:'money_recon_get_statement',arguments:{id:randomUUID()}});ok(foreign.isError,'MISSING_FOREIGN_STATEMENT_UNREADABLE');
  report.syntheticFinancialExecutions=1;report.productionFinancialExecutions=0;report.statementRows=359;
 });
 report.status='PASS';
}catch(e){report.status='FAIL';report.reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:'HOSTED_QA_FAILED';report.failureDetail=String(e.message).slice(0,700);process.exitCode=1;}

finally{
 const cleanup={oauthGrants:'NOT_CREATED',moneyFixture:'NOT_CREATED',authIdentity:'NOT_CREATED'};
 if(clientMetadata)try{for(const session of [readSession,writeSession])if(session?.refresh_token){const revoke=await fetch(issuer+'/token/revocation',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientMetadata.client_id,token:session.refresh_token,token_type_hint:'refresh_token'})});if(!revoke.ok)throw Error('REVOKE_FAILED');const denied=await fetch(resource,{method:'POST',headers:{Authorization:'Bearer '+session.access_token}});if(denied.status!==401)throw Error('REVOKED_GRANT_ACCEPTED');}cleanup.oauthGrants='PASS';}catch{cleanup.oauthGrants='FAIL';}
 if(owner)try{
  const result=execFileSync('cmd.exe',['/d','/c','railway','run','--project','2b52b232-38b2-44b6-b97e-4caba54f90bc','--environment','9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c','--service','eba7d263-7dc3-448a-a6b8-c2994721b597','--no-local','--','node','qa/money-recon-fixture-cleanup.mjs',owner,runId],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:60000});if(!result.includes('SYNTHETIC_MONEY_CLEANUP_PASS'))throw Error();cleanup.moneyFixture='PASS';
 }catch{cleanup.moneyFixture='FAIL';}
 if(owner)try{const r=await authRequest('/admin/users/'+owner,'DELETE');const check=await authRequest('/admin/users/'+owner,'GET');cleanup.authIdentity=(r.ok||r.status===404)&&check.status===404?'PASS':'FAIL';cleanup.authDeleteStatus=r.status;cleanup.authReadbackStatus=check.status;}catch{cleanup.authIdentity='FAIL';}
 report.cleanup=cleanup;report.finishedAt=new Date().toISOString();if(Object.values(cleanup).includes('FAIL')){process.exitCode=1;report.fixture={owner,runId,email};}
 if(process.env.ORBIT_MONEY_QA_REPORT)writeFileSync(process.env.ORBIT_MONEY_QA_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
