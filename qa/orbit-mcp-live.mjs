// Owned, ephemeral loopback release QA. All tokens/codes/results stay in memory.
// Only status/count metadata is returned; production records are never written.
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Client} from '../integrations/orbit-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StreamableHTTPClientTransport} from '../integrations/orbit-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import {createRemoteJWKSet,jwtVerify} from '../integrations/orbit-mcp/node_modules/jose/dist/webapi/index.js';
const environment=process.argv[2];
const issuer=environment==='DEV'?'https://orbit-pos-mcp-dev-development.up.railway.app':environment==='PROD'?'https://orbit-pos-mcp-prod-production.up.railway.app':undefined;
if(!issuer)throw Error('Exact DEV or PROD required');
const resource=issuer+'/mcp',callback='https://chatgpt.com/connector_platform_oauth_redirect';
const jwks=createRemoteJWKSet(new URL(issuer+'/jwks'));
let pending,session,summary={environment,phase:'READY'},server;
const random=()=>randomBytes(32).toString('base64url');
const post=async(path,body)=>{const r=await fetch(issuer+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),redirect:'manual',signal:AbortSignal.timeout(20000)});let json;try{json=await r.json();}catch{}return {status:r.status,json};};
async function verify(token){
 const {payload}=await jwtVerify(token,jwks,{algorithms:['ES256'],issuer,audience:resource,typ:'at+jwt',requiredClaims:['sub','exp','client_id','orbit_grant']});
 if(payload.scope!=='orbit:read'||!/^\w{8}-(\w{4}-){3}\w{12}$/.test(payload.sub))throw Error('LIVE_CLAIMS_INVALID');
 return payload;
}
function assert(value,message){if(!value)throw Error(message);}
async function exercise(){
 const checked=await verify(session.access_token);assert(checked.client_id===session.clientId,'CLIENT_BINDING');
 const client=new Client({name:'ORBIT authenticated release QA',version:'1.0.0'});
 try{
  await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:'Bearer '+session.access_token}}}));
  const list=await client.listTools();assert(list.tools.length===20&&list.tools.every(t=>t.annotations?.readOnlyHint),'TOOL_CATALOG');
  const results=[];let leaks=0;
  const forbidden=new Set(['userid','ownerid','maskedreference','suffix','imagedata','imageurl','rawpayload','rawbody','notificationbody','memo','memos','notes','memoitems','metadata','password','token','accesstoken','refreshtoken','secret','credentials','accountreference','counterparty','counterpartytext']);
  function scan(v){if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){if(forbidden.has(k.replaceAll('_','').toLowerCase()))leaks++;scan(x);}}
  for(const tool of list.tools){
   const started=Date.now(),result=await client.callTool({name:tool.name,arguments:{}});
   assert(!result.isError,'TOOL_FAILED_'+tool.name);
   const data=JSON.parse(result.content[0].text);assert('schemaVersion'in data,'JSON_SCHEMA');scan(data);
   results.push({tool:tool.name,status:'PASS',json:true,bytes:Buffer.byteLength(result.content[0].text),ms:Date.now()-started});
  }
  assert(leaks===0,'PRIVACY_KEYS');
  const reject=await client.callTool({name:'get_diet_context',arguments:{userId:'not-accepted'}});assert(reject.isError,'USER_SELECTOR');
  const inspector=[];
  for(const tool of ['', 'get_diet_context']){
   const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA)$/i.test(k)));
   Object.assign(env,{ORBIT_QA_MCP_TOKEN:session.access_token,ORBIT_QA_MCP_URL:resource,ORBIT_QA_TOOL:tool});
   const r=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./orbit-mcp-inspector.mjs',import.meta.url))],{env,timeout:45000,windowsHide:true});
   const result=JSON.parse(r.stdout);assert(result.status==='PASS'&&(tool?result.toolResponseJson:result.toolCount===20),'INSPECTOR');inspector.push(result);
  }
  const refreshed=await post('/token',{grant_type:'refresh_token',client_id:session.clientId,refresh_token:session.refresh_token,resource});
  assert(refreshed.status===200&&refreshed.json?.refresh_token!==session.refresh_token,'REFRESH_ROTATION');
  const identity=await verify(refreshed.json.access_token);assert(identity.sub===checked.sub,'REFRESH_IDENTITY');
  session={...session,...refreshed.json};
  const anonymous=await fetch(resource,{method:'POST',redirect:'manual'});assert(anonymous.status===401&&anonymous.headers.get('www-authenticate')?.includes('resource_metadata'),'ANONYMOUS');
  const registration=await fetch(issuer+'/reg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({redirect_uris:['https://evil.invalid/callback'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token']})});assert(registration.status===400,'REDIRECT_GUARD');
  summary={environment,phase:'PASS',oauth:'Authorization Code + PKCE S256 + POS sign-in + explicit consent',issuerAudienceExpiryIdentityScope:'PASS',results,forbiddenKeys:leaks,inspector,refreshRotation:'PASS',negativeChecks:{anonymous:anonymous.status,foreignRedirect:registration.status,userSelectorRejected:true},inChatToolCall:false};
 }finally{await client.close();}
}
server=createServer(async(req,res)=>{
 const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 if(req.headers.origin||req.headers['sec-fetch-site']||!req.headers.host?.startsWith('127.0.0.1:'))return reply(403,{error:'loopback_qa_only'});
 try{
  if(req.url==='/start'&&req.method==='GET'){
   const registration=await fetch(issuer+'/reg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'ORBIT release verification '+environment,redirect_uris:[callback],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',scope:'orbit:read'})});
   assert(registration.status===201,'REGISTRATION');
   const client=await registration.json();pending={clientId:client.client_id,state:random(),verifier:random()};
   const auth=new URL(issuer+'/auth');for(const[k,v]of Object.entries({client_id:pending.clientId,redirect_uri:callback,response_type:'code',scope:'orbit:read',resource,state:pending.state,code_challenge:createHash('sha256').update(pending.verifier).digest('base64url'),code_challenge_method:'S256'}))auth.searchParams.set(k,v);
   summary={environment,phase:'AWAITING_POS_CONSENT'};return reply(200,{authorizationUrl:auth.toString()});
  }
  if(req.url==='/finish'&&req.method==='POST'){
   let raw='';for await(const part of req){raw+=part;if(raw.length>8192)throw Error('QA_BODY_BOUND');}
   const url=new URL(JSON.parse(raw).callback);
   assert(pending&&url.origin==='https://chatgpt.com'&&url.pathname==='/connector_platform_oauth_redirect'&&url.searchParams.get('state')===pending.state&&url.searchParams.get('iss')===issuer&&!url.searchParams.has('error'),'CALLBACK');
   const saved=pending;pending=undefined;
   const token=await post('/token',{grant_type:'authorization_code',client_id:saved.clientId,redirect_uri:callback,code:url.searchParams.get('code'),code_verifier:saved.verifier,resource});
   assert(token.status===200&&token.json?.refresh_token,'CODE_EXCHANGE');
   session={...token.json,clientId:saved.clientId};summary={environment,phase:'CHECKING_TOOLS'};
   await exercise();console.log(JSON.stringify({environment,status:'HOSTED_OAUTH_MCP_INSPECTOR_PASS',tools:20}));return reply(200,summary);
  }
  if(req.url==='/restart-check'&&req.method==='POST'){
   assert(session,'NO_SESSION');
   const refreshed=await post('/token',{grant_type:'refresh_token',client_id:session.clientId,refresh_token:session.refresh_token,resource});
   assert(refreshed.status===200&&refreshed.json?.access_token,'PERSISTENT_REFRESH');
   session={...session,...refreshed.json};await verify(session.access_token);
   const c=new Client({name:'ORBIT persistence QA',version:'1.0.0'});try{await c.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:'Bearer '+session.access_token}}}));assert(!(await c.callTool({name:'get_diet_context',arguments:{}})).isError,'PERSISTENT_TOOL');}finally{await c.close();}
   summary.persistenceAfterRestart='PASS';return reply(200,{environment,persistenceAfterRestart:'PASS'});
  }
  if(req.url==='/cleanup'&&req.method==='POST'){
   if(session){const r=await post('/token/revocation',{client_id:session.clientId,token:session.refresh_token,token_type_hint:'refresh_token'});assert(r.status===200,'REVOKE');session=undefined;}
   summary.qaGrantRevoked=true;return reply(200,{environment,qaGrantRevoked:true});
  }
  if(req.url==='/status')return reply(200,summary);
  return reply(404,{error:'not_found'});
 }catch(e){
  const reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:'QA_REQUEST_FAILED';summary={...summary,phase:'FAIL',reason};
  console.log(JSON.stringify({environment,status:'FAIL',reason}));reply(400,{environment,phase:'FAIL',reason});
 }
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({environment,bridge:'http://127.0.0.1:'+server.address().port,status:'OWNED_QA_READY'})));
function stop(){session=undefined;pending=undefined;server.close(()=>process.exit(0));}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
