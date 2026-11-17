// Ephemeral normal owner OAuth + PKCE and official MCP transport. No stored credentials.
// Loopback accepts CLI requests only. Callback codes travel directly from the approved
// browser driver to /finish, never through model output, files or browser storage APIs.
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {Client} from '../integrations/orbit-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StreamableHTTPClientTransport} from '../integrations/orbit-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import {createRemoteJWKSet,jwtVerify} from '../integrations/orbit-mcp/node_modules/jose/dist/webapi/index.js';
import {queueTools} from '../integrations/orbit-mcp/work-queue-tools.mjs';
const environment=process.argv[2];
const issuer=environment==='DEV'?'https://orbit-pos-mcp-dev-development.up.railway.app':environment==='PROD'?'https://orbit-pos-mcp-prod-production.up.railway.app':null;
if(!issuer)throw Error('EXACT_ENVIRONMENT_REQUIRED');
const resource=issuer+'/mcp',callback='https://chatgpt.com/oauth/codex/work-queue-owner-qa',scope='orbit:read orbit:write:work-queue';
const legacyReads=new Set(['money_get_console_capabilities','get_workflow_tasks_context']);
const jwks=createRemoteJWKSet(new URL(issuer+'/jwks')),allowed=new Set([...queueTools.map(t=>t.name),...legacyReads]);
let pending,session,client,claims,phase='READY';
const random=()=>randomBytes(32).toString('base64url');
const assert=(condition,reason)=>{if(!condition)throw Error(reason);};
async function post(path,body){const r=await fetch(issuer+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),redirect:'error',signal:AbortSignal.timeout(25000)});let data;try{data=await r.json();}catch{}return {status:r.status,data};}
async function verify(){const {payload}=await jwtVerify(session.access_token,jwks,{algorithms:['ES256'],issuer,audience:resource,typ:'at+jwt',requiredClaims:['sub','exp','client_id','orbit_grant']});assert(payload.client_id===session.clientId&&scope.split(' ').every(s=>payload.scope.split(' ').includes(s)),'CLAIMS_OR_SCOPE');claims=payload;}
async function ready(){
 assert(session,'OWNER_CONSENT_REQUIRED');
 if(!claims||claims.exp*1000<Date.now()+45000){
  if(client){await client.close();client=undefined;}
  const r=await post('/token',{grant_type:'refresh_token',client_id:session.clientId,refresh_token:session.refresh_token,resource});assert(r.status===200&&r.data?.refresh_token,'REFRESH_FAILED');session={...session,...r.data};await verify();
 }
 if(!client){client=new Client({name:'WORK QUEUE owner-authorized release verification',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:'Bearer '+session.access_token}}}));}
}
const server=createServer(async(req,res)=>{
 const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 if(req.headers.origin||req.headers['sec-fetch-site']||!/^127\.0\.0\.1:\d+$/.test(req.headers.host??''))return reply(403,{error:'CLI_LOOPBACK_ONLY'});
 try{
  if(req.url==='/start'&&req.method==='POST'){
   assert(!session&&!pending,'SESSION_EXISTS');const r=await fetch(issuer+'/reg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'WORK QUEUE owner verification '+environment,redirect_uris:[callback],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',scope})});assert(r.status===201,'REGISTRATION_FAILED');
   const d=await r.json();pending={clientId:d.client_id,state:random(),verifier:random()};const url=new URL(issuer+'/auth');for(const[k,v]of Object.entries({client_id:pending.clientId,redirect_uri:callback,response_type:'code',scope,resource,state:pending.state,code_challenge:createHash('sha256').update(pending.verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(k,v);phase='AWAITING_NORMAL_OWNER_CONSENT';return reply(200,{authorizationUrl:url.href});
  }
  let input;if(req.method==='POST'&&req.url!=='/start'){let raw='';for await(const part of req){raw+=part;assert(raw.length<=65536,'BODY_TOO_LARGE');}input=raw?JSON.parse(raw):{};}
  if(req.url==='/finish'&&req.method==='POST'){
   const url=new URL(input.callback);assert(pending&&url.origin==='https://chatgpt.com'&&url.pathname==='/oauth/codex/work-queue-owner-qa'&&url.searchParams.get('state')===pending.state&&url.searchParams.get('iss')===issuer&&!url.searchParams.has('error'),'CALLBACK_INVALID');
   const p=pending;pending=undefined;const r=await post('/token',{grant_type:'authorization_code',client_id:p.clientId,redirect_uri:callback,code:url.searchParams.get('code'),code_verifier:p.verifier,resource});assert(r.status===200&&r.data?.refresh_token,'CODE_EXCHANGE_FAILED');session={...r.data,clientId:p.clientId};await verify();await ready();const catalog=await client.listTools();assert(queueTools.every(t=>catalog.tools.some(x=>x.name===t.name)),'QUEUE_CATALOG_INCOMPLETE');assert(catalog.tools.some(t=>t.name.startsWith('money_')),'MONEY_CATALOG_MISSING');phase='AUTHENTICATED_MCP_READY';return reply(200,{environment,phase,queueTools:queueTools.length,totalTools:catalog.tools.length,ownerFingerprint:createHash('sha256').update(claims.sub).digest('hex').slice(0,16),inChatInvocation:false});
  }
  if(req.url==='/call'&&req.method==='POST'){
   assert(allowed.has(input.name),'TOOL_NOT_ALLOWED');if(legacyReads.has(input.name))assert(Object.keys(input.arguments??{}).length===0,'LEGACY_READ_NO_ARGUMENTS');await ready();const r=await client.callTool({name:input.name,arguments:input.arguments??{}});let value;try{value=JSON.parse(r.content?.find(c=>c.type==='text')?.text);}catch{value={message:r.content?.find(c=>c.type==='text')?.text??'NO_CONTENT'};}if(legacyReads.has(input.name))value={tool:input.name,json:true,schemaVersion:value.schemaVersion??null,contentSuppressed:true};return reply(200,{isError:!!r.isError,result:value});
  }
  if(req.url==='/cleanup'&&req.method==='POST'){
   if(client){await client.close();client=undefined;}if(session){const r=await post('/token/revocation',{client_id:session.clientId,token:session.refresh_token,token_type_hint:'refresh_token'});assert(r.status===200,'REVOKE_FAILED');}session=claims=pending=undefined;phase='QA_GRANT_REVOKED';return reply(200,{environment,phase});
  }
  if(req.url==='/status'&&req.method==='GET')return reply(200,{environment,phase,authenticated:!!session});
  return reply(404,{error:'NOT_FOUND'});
 }catch(e){const reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:'REQUEST_FAILED';return reply(400,{environment,phase,error:reason});}
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({environment,bridge:'http://127.0.0.1:'+server.address().port,pid:process.pid,status:'OWNER_OAUTH_BRIDGE_READY'})));
async function stop(){if(client)await client.close();if(session)await post('/token/revocation',{client_id:session.clientId,token:session.refresh_token,token_type_hint:'refresh_token'}).catch(()=>{});session=claims=pending=undefined;server.close(()=>process.exit(0));}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
process.stdin.setEncoding('utf8');process.stdin.on('data',data=>{if(data.trim()==='stop')void stop();});
