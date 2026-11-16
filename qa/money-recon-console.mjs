// Run-owned loopback OAuth/MCP verification console. Tokens/codes stay in memory.
// It allows source intake/analysis/preview, never a financial execution command.
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {Client} from '../integrations/orbit-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StreamableHTTPClientTransport} from '../integrations/orbit-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import {createRemoteJWKSet,jwtVerify} from '../integrations/orbit-mcp/node_modules/jose/dist/webapi/index.js';
const environment=process.argv[2];
if(!['DEV','PROD'].includes(environment))throw Error('EXACT_ENVIRONMENT_REQUIRED');
const issuer=environment==='DEV'?'https://orbit-pos-mcp-dev-development.up.railway.app':'https://orbit-pos-mcp-prod-production.up.railway.app';
const resource=issuer+'/mcp',callback='https://chatgpt.com/connector_platform_oauth_redirect',scope='orbit:read orbit:write:money';
const random=()=>randomBytes(32).toString('base64url');
const jwks=createRemoteJWKSet(new URL(issuer+'/jwks'));
let pending,session,client,tools=[],busy=false;
const evidence={environment,method:'NORMAL_OWNER_OAUTH_PKCE_HOSTED_MCP_SDK',inChatCall:false,financialExecutions:0,calls:[],startedAt:new Date().toISOString()};
const output=process.env.MONEY_RECON_EVIDENCE_DIR;
if(!output||!path.isAbsolute(output))throw Error('ABSOLUTE_EVIDENCE_DIRECTORY_REQUIRED');
await mkdir(output,{recursive:true});
async function save(){await writeFile(path.join(output,environment.toLowerCase()+'-hosted-mcp.json'),JSON.stringify(evidence,null,2));}
async function token(body){const r=await fetch(issuer+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),redirect:'error',signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok||!data.access_token)throw Error('OAUTH_TOKEN_FAILED');const checked=await jwtVerify(data.access_token,jwks,{issuer,audience:resource,algorithms:['ES256'],typ:'at+jwt'});if(scope.split(' ').some(x=>!checked.payload.scope.split(' ').includes(x)))throw Error('OAUTH_SCOPE_MISMATCH');return {...data,expiresAt:Date.now()+data.expires_in*1000};}
async function connected(){if(!session)throw Error('OAUTH_REQUIRED');if(session.expiresAt<Date.now()+45000){session={...session,...await token({grant_type:'refresh_token',client_id:session.clientId,refresh_token:session.refresh_token,resource})};if(client)await client.close();client=undefined;evidence.refreshRotation='PASS';}if(!client){client=new Client({name:'TEAM KAFKA statement reconciliation verification',version:'1.0.0'});await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:'Bearer '+session.access_token}}}));tools=(await client.listTools()).tools;evidence.toolCount=tools.length;evidence.reconciliationTools=tools.filter(t=>t.name.includes('recon_')||t.name==='money_get_statement_balance_observation').map(t=>t.name);}}
async function call(name,args){
 if(!/^(money_recon_(get_|list_|intake_|import_|analyze$|batch_preview$)|money_get_(statement_balance_observation|account_reconciliation|reconciliation_summary|console_capabilities|transaction_financial_detail|operation_outcome|review_item)$|money_preview_(financial_correction|review_batch)$|money_list_(accounts|review_items|loans)$)/.test(name))throw Error('FINANCIAL_EXECUTION_OR_UNSUPPORTED_TOOL_BLOCKED');
 await connected();if(!tools.some(t=>t.name===name))throw Error('REMOTE_TOOL_MISSING');const started=Date.now();const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});const text=result.content?.find(x=>x.type==='text')?.text;let data;try{data=JSON.parse(text);}catch{throw Error('MCP_NON_JSON_RESPONSE');}evidence.calls.push({name,status:result.isError?'ERROR':'PASS',milliseconds:Date.now()-started,at:new Date().toISOString()});await save();if(result.isError)throw Error('MCP_OPERATION_FAILED_'+JSON.stringify(data).slice(0,300));return data;
}
const server=createServer(async(req,res)=>{
 const reply=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 if(req.headers.origin||req.headers['sec-fetch-site']||!/^127\.0\.0\.1:\d+$/.test(req.headers.host??''))return reply(403,{error:'OWNED_LOOPBACK_ONLY'});
 if(busy)return reply(409,{error:'BUSY'});busy=true;
 try{
  let body={};if(req.method==='POST'){let bytes='';for await(const chunk of req){bytes+=chunk;if(bytes.length>64000)throw Error('LOOPBACK_BODY_LIMIT');}body=bytes?JSON.parse(bytes):{};}
  if(req.url==='/start'&&req.method==='GET'){
   const r=await fetch(issuer+'/reg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'TEAM KAFKA reconciliation verification '+environment,redirect_uris:[callback],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',scope})});if(r.status!==201)throw Error('OAUTH_REGISTRATION_FAILED');pending={clientId:(await r.json()).client_id,state:random(),verifier:random()};const url=new URL(issuer+'/auth');for(const[k,v]of Object.entries({client_id:pending.clientId,redirect_uri:callback,response_type:'code',scope,resource,state:pending.state,code_challenge:createHash('sha256').update(pending.verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(k,v);return reply(200,{authorizationUrl:url.toString()});
  }
  if(req.url==='/finish'&&req.method==='POST'){
   const url=new URL(body.callback);if(!pending||url.origin!=='https://chatgpt.com'||url.pathname!=='/connector_platform_oauth_redirect'||url.searchParams.get('state')!==pending.state||url.searchParams.get('iss')!==issuer||url.searchParams.has('error'))throw Error('INVALID_OAUTH_CALLBACK');const p=pending;pending=undefined;session={...await token({grant_type:'authorization_code',client_id:p.clientId,redirect_uri:callback,code:url.searchParams.get('code'),code_verifier:p.verifier,resource}),clientId:p.clientId};await connected();evidence.oauth='PASS';await save();return reply(200,{environment,status:'AUTHENTICATED',toolCount:tools.length,reconciliationTools:evidence.reconciliationTools});
  }
  if(req.url==='/call'&&req.method==='POST')return reply(200,await call(body.name,body.args??{}));
  if(req.url==='/import'&&req.method==='POST'){
   const file=process.env.MONEY_RECON_SOURCE_FILE;if(!file||!path.isAbsolute(file)||!file.endsWith('.pdf'))throw Error('OWNER_SOURCE_FILE_REQUIRED');if(body.accountId!=='7de6a630-c09e-438d-96a9-1695fb2118a5')throw Error('OWNER_IBK_ACCOUNT_FENCE');const bytes=await readFile(file);const intake=await call('money_recon_intake_start',{accountId:body.accountId,provider:'IBK',format:'PDF',sha256:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length});const uploadId=intake.data.uploadId;for(let off=0,index=0;off<bytes.length;off+=30000,index++)await call('money_recon_intake_chunk',{uploadId,index,base64:bytes.subarray(off,Math.min(off+30000,bytes.length)).toString('base64')});const result=await call('money_recon_import_statement_preview',{uploadId});evidence.statementId=result.data.statement.id;await save();return reply(200,result);
  }
  if(req.url==='/cleanup'&&req.method==='POST'){if(client){await client.close();client=undefined;}if(session){const r=await fetch(issuer+'/token/revocation',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:session.clientId,token:session.refresh_token,token_type_hint:'refresh_token'}),redirect:'error'});if(!r.ok)throw Error('REVOKE_FAILED');session=undefined;}evidence.qaGrantRevoked=true;evidence.finishedAt=new Date().toISOString();await save();return reply(200,{environment,qaGrantRevoked:true});}
  if(req.url==='/status')return reply(200,{...evidence,authenticated:Boolean(session)});
  return reply(404,{error:'NOT_FOUND'});
 }catch(error){const reason=String(error.message).replace(/(?:access_token|refresh_token|code)=\S+/g,'[REDACTED]').slice(0,500);evidence.lastError=reason;await save();return reply(400,{error:reason});}finally{busy=false;}
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({environment,bridge:'http://127.0.0.1:'+server.address().port,status:'OWNED_QA_READY'})));
function stop(){session=undefined;pending=undefined;server.close(()=>process.exit(0));}process.once('SIGINT',stop);process.once('SIGTERM',stop);
