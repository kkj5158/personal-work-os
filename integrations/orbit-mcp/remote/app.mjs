import express from 'express';
import Provider,{errors} from 'oidc-provider';
import {exportJWK,generateKeyPair,createLocalJWKSet,jwtVerify} from 'jose';
import {createHmac} from 'node:crypto';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {tools,call,validate} from '../server.mjs';
import {Store} from './store.mjs';
import {Upstream,uuid,opaque,equal} from './upstream.mjs';
import {redirectAllowed} from './config.mjs';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=(title,body)=>'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+'</title><body><main><h1>'+escape(title)+'</h1>'+body+'</main></body></html>';
export async function createApp(config,{store,upstream,fetcher=fetch}={}){
 store??=new Store(config.storeFile,config.masterKey);
 let jwk=store.get('Key','signing');
 if(!jwk){const {privateKey}=await generateKeyPair('ES256',{extractable:true});jwk={...await exportJWK(privateKey),kid:opaque(),use:'sig',alg:'ES256'};store.put('Key','signing',jwk);}
 const publicKey={...jwk};delete publicKey.d;const verifier=createLocalJWKSet({keys:[publicKey]});
 upstream??=new Upstream(config,store,{fetcher});
 const provider=new Provider(config.issuer,{
  adapter:store.adapter(),jwks:{keys:[jwk]},
  cookies:{keys:[createHmac('sha256',config.masterKey).update('orbit-cookie-v1').digest('base64url')],short:{signed:true,httpOnly:true,sameSite:'lax'},long:{signed:true,httpOnly:true,sameSite:'lax'}},
  responseTypes:['code'],scopes:['orbit:read'],subjectTypes:['public'],pkce:{required:()=>true},
  clientAuthMethods:['none','client_secret_basic','client_secret_post'],
  clientDefaults:{grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',id_token_signed_response_alg:'ES256'},
  clientBasedCORS:(_ctx,origin)=>origin==='https://chatgpt.com'||config.allowLoopback&&/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin),
  interactions:{url:()=>'/interaction'},
  features:{
   devInteractions:{enabled:false},registration:{enabled:true,initialAccessToken:false},registrationManagement:{enabled:false},
   clientIdMetadataDocument:{enabled:false},requestObjects:{enabled:false},
   revocation:{enabled:true},userinfo:{enabled:false},rpInitiatedLogout:{enabled:false},pushedAuthorizationRequests:{enabled:false},
   resourceIndicators:{enabled:true,defaultResource:()=>config.resource,useGrantedResource:()=>true,
    getResourceServerInfo:(_ctx,resource)=>{if(resource!==config.resource)throw new errors.InvalidTarget();return {scope:'orbit:read',audience:config.resource,accessTokenTTL:300,accessTokenFormat:'jwt',jwt:{sign:{alg:'ES256'}}};}}
  },
  extraClientMetadata:{properties:['orbit_policy'],validator:(_ctx,_key,_value,metadata)=>{
   const value=metadata.redirect_uris;
   if(!Array.isArray(value)||value.length<1||value.length>4||value.some(uri=>!redirectAllowed(uri,config.allowLoopback)))throw new errors.InvalidClientMetadata('Unsupported redirect URI');
   if(!['none','client_secret_post','client_secret_basic'].includes(metadata.token_endpoint_auth_method))throw new errors.InvalidClientMetadata('Unsupported authentication method');
   if(!metadata.grant_types.includes('authorization_code')||metadata.grant_types.some(v=>!['authorization_code','refresh_token'].includes(v)))throw new errors.InvalidClientMetadata('Unsupported grant');
   if(metadata.scope&&metadata.scope.split(' ').some(v=>v!=='orbit:read'))throw new errors.InvalidClientMetadata('Unsupported scope');
   for(const key of ['jwks_uri','jwks','sector_identifier_uri','request_uris','initiate_login_uri'])if(metadata[key]!==undefined)throw new errors.InvalidClientMetadata('Unsupported remote metadata');
  }},
  findAccount:async(_ctx,id)=>uuid.test(id)&&store.get('Upstream',id)?{accountId:id,claims:async()=>({sub:id})}:undefined,
  extraTokenClaims:(_ctx,token)=>({orbit_grant:token.grantId}),
  issueRefreshToken:(_ctx,client,source)=>client.grantTypeAllowed('refresh_token')&&source.scopes.has('orbit:read'),
  expiresWithSession:()=>false,rotateRefreshToken:()=>true,
  ttl:{AccessToken:300,AuthorizationCode:60,RefreshToken:30*86400,Grant:30*86400,Session:8*3600,Interaction:600},
  renderError:async(ctx,out)=>{ctx.type='html';ctx.body=html('ORBIT 연결을 완료하지 못했습니다','<p>요청이 만료되었거나 허용되지 않았습니다. 연결 화면에서 다시 시작하세요.</p>');}
 });
 provider.proxy=true;
 // Keep personal claims, authorization parameters and request bodies out of logs.
 provider.on('server_error',()=>{});
 const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
 const limits=new Map();
 function limited(key,max,seconds){
  const now=Date.now();let item=limits.get(key);
  if(!item||item.until<now){item={until:now+seconds*1000,count:0};limits.set(key,item);}
  if(limits.size>10000)for(const[k,v]of limits)if(v.until<now)limits.delete(k);
  if(limits.size>10000||++item.count>max)return true;return false;
 }
 app.use((req,res,next)=>{
  res.set({'Cache-Control':'private, no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; style-src 'none'","Strict-Transport-Security":'max-age=31536000'});
  if(req.method==='GET'&&req.path==='/health')return res.json({status:'ok',service:'orbit-pos-mcp',tools:20});
  if(req.headers.host!==new URL(config.issuer).host)return res.status(400).json({error:'invalid_request'});
  if(!config.allowLoopback&&!req.secure)return res.status(400).json({error:'https_required'});
  if(req.headers['content-length']&&Number(req.headers['content-length'])>65536)return res.status(413).end();
  if(req.path==='/reg'&&(store.count('Client')>=256||limited('reg:'+req.ip,10,3600)))return res.status(429).json({error:'temporarily_unavailable'});
  if(req.path!=='/health'&&limited('all:'+req.ip,180,60))return res.status(429).set('Retry-After','60').json({error:'temporarily_unavailable'});
  next();
 });
 const resourceMetadata={resource:config.resource,authorization_servers:[config.issuer],scopes_supported:['orbit:read'],bearer_methods_supported:['header'],resource_name:'ORBIT POS read-only context'};
 app.get(['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'],(_req,res)=>res.set('Access-Control-Allow-Origin','*').json(resourceMetadata));
 const authChallenge=(res,status,error)=>res.status(status).set('WWW-Authenticate','Bearer resource_metadata="'+config.issuer+'/.well-known/oauth-protected-resource/mcp", scope="orbit:read"'+(error?', error="'+error+'"':'')).json({error:error||'unauthorized'});
 async function authenticate(req,res,next){
  try{
   if(req.headers.origin&&req.headers.origin!==config.issuer&&req.headers.origin!=='https://chatgpt.com')return authChallenge(res,403,'invalid_request');
   const match=/^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.authorization||'');if(!match)return authChallenge(res,401);
   const {payload}=await jwtVerify(match[1],verifier,{issuer:config.issuer,audience:config.resource,algorithms:['ES256'],typ:'at+jwt',requiredClaims:['sub','exp','iat','client_id','orbit_grant'],clockTolerance:0});
   if(!uuid.test(payload.sub))return authChallenge(res,401,'invalid_token');
   if(payload.scope!=='orbit:read')return authChallenge(res,403,'insufficient_scope');
   const grant=await provider.Grant.find(payload.orbit_grant);
   if(!grant||grant.accountId!==payload.sub||grant.clientId!==payload.client_id)return authChallenge(res,401,'invalid_token');
   if(limited('user:'+payload.sub,60,60))return res.status(429).set('Retry-After','60').json({error:'rate_limited'});
   req.orbitUser=payload.sub;next();
  }catch{return authChallenge(res,401,'invalid_token');}
 }
 app.post('/mcp',authenticate,express.json({limit:'64kb',strict:true}),async(req,res)=>{
  const server=new Server({name:'orbit-pos-context-v1',version:'1.0.0'},{capabilities:{tools:{}}});
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:tools.map(tool=>({...tool,securitySchemes:[{type:'oauth2',scopes:['orbit:read']}],_meta:{securitySchemes:[{type:'oauth2',scopes:['orbit:read']}]}}))}));
  server.setRequestHandler(CallToolRequestSchema,async({params})=>{
   try{
    validate(params.name,params.arguments??{});
    const token=await upstream.token(req.orbitUser);
    const data=await call(params.name,params.arguments??{},{origin:config.api,token,fetcher});
    return {content:[{type:'text',text:JSON.stringify(data)}]};
   }catch{return {isError:true,content:[{type:'text',text:'POS context unavailable. Reauthorize or check bounded arguments.'}]};}
  });
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{transport.close().catch(()=>{});server.close().catch(()=>{});});
  try{await server.connect(transport);await transport.handleRequest(req,res,req.body);}
  catch{if(!res.headersSent)res.status(500).json({jsonrpc:'2.0',id:null,error:{code:-32603,message:'MCP request unavailable'}});}
 });
 app.all('/mcp',authenticate,(_req,res)=>res.status(405).set('Allow','POST').json({error:'method_not_allowed'}));
 const form=express.urlencoded({extended:false,limit:'8kb',parameterLimit:8});
 app.get('/interaction',async(req,res,next)=>{
  try{
   const d=await provider.interactionDetails(req,res);
   if(d.prompt.name==='login')return res.redirect(303,upstream.authorize(d.uid));
   if(d.prompt.name!=='consent')throw Error('INTERACTION_INVALID');
   const client=await provider.Client.find(d.params.client_id);
   const csrf=opaque();store.put('Csrf',d.uid,{csrf},600);
   res.type('html').send(html('ORBIT POS 읽기 연결 승인','<p>연결 앱: '+escape(client.clientName||'이름 없는 앱')+'</p><p>반환 주소: '+escape(d.params.redirect_uri)+'</p><p>클라이언트: '+escape(client.clientId)+'</p><p>orbit:read — 수면·DIET·일정·업무·체크리스트·MONEY의 개인 기록을 20개 읽기 도구로 조회합니다. 기록 생성·수정·삭제 권한은 없습니다.</p><p>선택한 앱이 개인 기록을 읽을 수 있습니다. 신뢰하는 연결인지 확인하세요.</p><form method="post" action="/interaction/confirm"><input type="hidden" name="csrf" value="'+escape(csrf)+'"><button name="decision" value="allow">읽기 연결 허용</button> <button name="decision" value="deny">거절</button></form>'));
  }catch(e){next(e);}
 });
 app.get('/interaction/upstream',async(req,res,next)=>{
  try{
   const d=await provider.interactionDetails(req,res);
   if(d.prompt.name!=='login'||req.query.error)throw Error('POS_LOGIN_REQUIRED');
   const sub=await upstream.callback(d.uid,req.query.state,req.query.code);
   await provider.interactionFinished(req,res,{login:{accountId:sub}},{mergeWithLastSubmission:false});
  }catch(e){next(e);}
 });
 app.post('/interaction/confirm',form,async(req,res,next)=>{
  try{
   const d=await provider.interactionDetails(req,res),saved=store.take('Csrf',d.uid);
   if(req.headers.origin!==config.issuer||!saved||!equal(saved.csrf,req.body.csrf)||d.prompt.name!=='consent')throw Error('CONSENT_INVALID');
   if(req.body.decision==='deny')return await provider.interactionFinished(req,res,{error:'access_denied',error_description:'User declined access'},{mergeWithLastSubmission:false});
   if(req.body.decision!=='allow')throw Error('CONSENT_INVALID');
   const grant=d.grantId?await provider.Grant.find(d.grantId):new provider.Grant({accountId:d.session.accountId,clientId:d.params.client_id});
   const details=d.prompt.details;
   if(details.missingOIDCScope)grant.addOIDCScope(details.missingOIDCScope.join(' '));
   if(details.missingOIDCClaims)grant.addOIDCClaims(details.missingOIDCClaims);
   for(const[indicator,scopes]of Object.entries(details.missingResourceScopes??{})){
    if(indicator!==config.resource||scopes.some(s=>s!=='orbit:read'))throw Error('CONSENT_INVALID');
    grant.addResourceScope(indicator,scopes.join(' '));
   }
   const grantId=await grant.save();
   await provider.interactionFinished(req,res,{consent:{grantId}},{mergeWithLastSubmission:true});
  }catch(e){next(e);}
 });
 app.use(provider.callback());
 app.use((_error,_req,res,_next)=>{if(!res.headersSent)res.status(400).type('html').send(html('ORBIT 연결 요청을 확인하세요','<p>요청이 만료되었거나 인증할 수 없습니다. 연결 화면에서 다시 시작하세요.</p>'));});
 return {app,provider,store,upstream,publicKey};
}
