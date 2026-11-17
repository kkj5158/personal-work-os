import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {SignJWT,generateKeyPair,exportJWK,createLocalJWKSet,jwtVerify} from 'jose';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createApp} from './app.mjs';
import {Upstream,opaque,challenge} from './upstream.mjs';
import {Store} from './store.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {moneyTools} from '../money-tools.mjs';
import {diaryTools} from '../diary-tools.mjs';

const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
async function listen(server){await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port;}
async function close(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
function jar(user,authOrigin){
 const cookies=new Map();
 return async function request(url,init={}){
  const origin=new URL(url).origin,headers=new Headers(init.headers);
  if(cookies.has(origin))headers.set('Cookie',[...cookies.get(origin)].map(([k,v])=>k+'='+v).join('; '));
  if(origin===authOrigin)headers.set('X-QA-Identity',user);
  const r=await fetch(url,{...init,headers,redirect:'manual'});
  const saved=cookies.get(origin)??new Map();
  for(const c of r.headers.getSetCookie()){const [pair]=c.split(';'),i=pair.indexOf('=');saved.set(pair.slice(0,i),pair.slice(i+1));}
  cookies.set(origin,saved);return r;
 };
}
async function setup(){
 const pair=await generateKeyPair('ES256'),publicJwk={...await exportJWK(pair.publicKey),kid:'pos-qa',alg:'ES256'};
 const codes=new Map(),refreshes=new Map();let refreshCount=0;
 const authServer=createServer(async(req,res)=>{
  const u=new URL(req.url,'http://local');
  const send=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(obj));};
  if(u.pathname==='/.well-known/jwks.json')return send(200,{keys:[publicJwk]});
  if(u.pathname==='/oauth/authorize'){
   const code=opaque();codes.set(code,{sub:req.headers['x-qa-identity'],challenge:u.searchParams.get('code_challenge'),redirect:u.searchParams.get('redirect_uri'),nonce:u.searchParams.get('nonce')});
   const redirect=new URL(u.searchParams.get('redirect_uri'));redirect.searchParams.set('code',code);redirect.searchParams.set('state',u.searchParams.get('state'));res.writeHead(303,{Location:redirect.toString()});return res.end();
  }
  if(u.pathname==='/oauth/token'){
   let raw='';for await(const part of req)raw+=part;const f=new URLSearchParams(raw);let saved;
   if(f.get('grant_type')==='authorization_code'){
    saved=codes.get(f.get('code'));
    if(!saved||saved.redirect!==f.get('redirect_uri')||saved.challenge!==challenge(f.get('code_verifier')||''))return send(400,{error:'invalid_grant'});
    codes.delete(f.get('code'));
   }else{saved=refreshes.get(f.get('refresh_token'));refreshes.delete(f.get('refresh_token'));refreshCount++;}
   if(!saved||![A,B].includes(saved.sub))return send(400,{error:'invalid_grant'});
   const access=await new SignJWT({sub:saved.sub,role:'authenticated',client_id:'upstream-client'}).setIssuer(authOrigin).setAudience('authenticated').setIssuedAt().setExpirationTime('5m').setProtectedHeader({alg:'ES256',kid:'pos-qa'}).sign(pair.privateKey);
   const identity=await new SignJWT({sub:saved.sub,nonce:saved.nonce}).setIssuer(authOrigin).setAudience('upstream-client').setIssuedAt().setExpirationTime('5m').setProtectedHeader({alg:'ES256',kid:'pos-qa'}).sign(pair.privateKey);
   const refresh=opaque();refreshes.set(refresh,saved);return send(200,{access_token:access,id_token:identity,refresh_token:refresh,token_type:'Bearer',expires_in:300});
  }
  send(404,{error:'not_found'});
 });
 const authOrigin=await listen(authServer),server=createServer(),issuer=await listen(server);
 const config={issuer,resource:issuer+'/mcp',allowLoopback:true,storeFile:':memory:',masterKey:randomBytes(32),auth:authOrigin,authIssuer:authOrigin,upstreamClient:'upstream-client',publishableKey:'synthetic-public',api:'https://personal-work-os-prod-production.up.railway.app'};
 const store=new Store(':memory:',config.masterKey),upstream=new Upstream(config,store,{jwks:createLocalJWKSet({keys:[publicJwk]})});
 let reads=0,writes=0;
 const fetcher=async(url,options)=>{
  const u=new URL(url);
  if(u.origin!==config.api)throw Error('Unexpected test network');
  const token=options.headers.Authorization.slice(7);
  const body=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
  if(u.pathname.startsWith('/api/naver-archive/')){
   const verified=await jwtVerify(options.headers['X-Orbit-Diary-Proof'],createLocalJWKSet({keys:[runtime.publicKey]}),{issuer,audience:config.api,algorithms:['ES256']});
   const {createHash}=await import('node:crypto'),hash=v=>createHash('sha256').update(v).digest('hex');
   assert.equal(verified.payload.purpose,'orbit-diary-v1');assert.equal(verified.payload.sub,body.sub);
   assert.equal(verified.payload.scope,options.method==='GET'||u.pathname.endsWith('/duplicate-check')?'orbit:read:diary':'orbit:write:diary');
   assert.equal(verified.payload.upstream_hash,hash(token));assert.equal(verified.payload.request_hash,hash(options.method+'\n'+u.pathname+u.search+'\n'+(options.body??'')));
   if(options.method!=='GET')writes++;
  }
  if(u.pathname.startsWith('/api/orbit/money/v1/')){
   const verified=await jwtVerify(options.headers['X-Orbit-Money-Proof'],createLocalJWKSet({keys:[runtime.publicKey]}),{issuer,audience:config.api,algorithms:['ES256']});
   assert.equal(verified.payload.sub,body.sub);assert.equal(verified.payload.upstream_client,config.upstreamClient);
   assert.equal(verified.payload.scope,options.method==='POST'?'orbit:write:money':'orbit:read');
   const {createHash}=await import('node:crypto'),hash=v=>createHash('sha256').update(v).digest('hex');
   assert.equal(verified.payload.upstream_hash,hash(token));assert.equal(verified.payload.request_hash,hash(options.method+'\n'+u.pathname+u.search+'\n'+(options.body??'')));
   if(options.method==='POST')writes++;
  }
  reads++;return new Response(JSON.stringify({schemaVersion:1,data:[{syntheticOwner:body.sub}]}),{headers:{'Content-Type':'application/json'}});
 };
 const runtime=await createApp(config,{store,upstream,fetcher});server.on('request',runtime.app);
 async function register(redirect='http://127.0.0.1:14999/callback',scope='orbit:read'){
  const r=await fetch(issuer+'/reg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'Synthetic MCP client',redirect_uris:[redirect],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',scope})});
  return {status:r.status,body:await r.json()};
 }
 async function flow(client,user=A,{decision='allow',verifier=opaque(),scope='orbit:read',resource=config.resource,method='S256',tamperCsrf=false,origin=issuer}={}){
  const request=jar(user,authOrigin),url=new URL(issuer+'/auth');
  for(const[k,v]of Object.entries({client_id:client.client_id,redirect_uri:client.redirect_uris[0],response_type:'code',scope,resource,state:'qa-state',code_challenge:challenge(verifier),code_challenge_method:method}))url.searchParams.set(k,v);
  let current=url.toString(),r,body;
  for(let i=0;i<20;i++){
   r=await request(current);
   if(r.status>=300&&r.status<400){
    const next=new URL(r.headers.get('location'),current).toString();
    if(next.startsWith(client.redirect_uris[0]))return {callback:new URL(next),verifier,request};
    current=next;continue;
   }
   body=await r.text();
   const csrf=/name="csrf" value="([^"]+)"/.exec(body)?.[1];
   if(!csrf)return {response:r,body,verifier,request};
   assert.ok(r.headers.get('referrer-policy')==='same-origin','Consent navigation preserves same-origin Origin without cross-site referrer leakage');
   r=await request(issuer+'/interaction/confirm',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:tamperCsrf?'wrong':csrf,decision})});
   if(r.status<300||r.status>=400)return {response:r,body:await r.text(),verifier,request};
   current=new URL(r.headers.get('location'),current).toString();
  }
  throw Error('Synthetic flow exceeded redirect bound');
 }
 async function token(client,code,verifier,extra={}){
  const r=await fetch(issuer+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,redirect_uri:client.redirect_uris[0],code,code_verifier:verifier,resource:config.resource,...extra})});return {status:r.status,body:await r.json()};
 }
 const mcp=(token,method='tools/list',params={})=>fetch(config.resource,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 return {...runtime,config,issuer,register,flow,token,mcp,get reads(){return reads;},get writes(){return writes;},get refreshCount(){return refreshCount;},cleanup:async()=>{await close(server);await close(authServer);store.close();}};
}

test('separate diary scopes require fresh explicit consent and signed request entitlement',async()=>{
 const s=await setup();try{
  const {body:oldClient}=await s.register();const oldFlow=await s.flow(oldClient,A);const old=await s.token(oldClient,oldFlow.callback.searchParams.get('code'),oldFlow.verifier);
  for(const name of ['naver_diary_archive_summary','naver_diary_create_post']){const args=name.endsWith('create_post')?{requestId:A,title:'SYNTHETIC',bodyText:'synthetic only',fidelityStatus:'COMPLETE_OWNER_SUPPLIED'}:{};const denied=await s.mcp(old.body.access_token,'tools/call',{name,arguments:args});assert.equal((await denied.json()).result.isError,true);}
  assert.equal(s.reads,0);assert.equal(s.writes,0);
  const scope='orbit:read orbit:read:diary orbit:write:diary';const {body:client,status}=await s.register(undefined,scope);assert.equal(status,201);
  const flow=await s.flow(client,A,{scope});const session=await s.token(client,flow.callback.searchParams.get('code'),flow.verifier);assert.equal(session.status,200);
  const clientSdk=new Client({name:'Synthetic diary scope QA',version:'1'});
  try{await clientSdk.connect(new StreamableHTTPClientTransport(new URL(s.config.resource),{requestInit:{headers:{Authorization:'Bearer '+session.body.access_token}}}));
   const read=await clientSdk.callTool({name:'naver_diary_archive_summary',arguments:{}});assert.ok(!read.isError);
   const created=await clientSdk.callTool({name:'naver_diary_create_post',arguments:{requestId:A,title:'SYNTHETIC',bodyText:'full\r\nsynthetic only',fidelityStatus:'COMPLETE_OWNER_SUPPLIED'}});assert.ok(!created.isError);assert.equal(s.writes,1);
   const money=await clientSdk.callTool({name:'money_set_category_color',arguments:{requestId:A,id:A,expectedVersion:1,color:'#112233'}});assert.equal(money.isError,true);
  }finally{await clientSdk.close();}
 }finally{await s.cleanup();}
});

test('OAuth discovery, exact redirects, PKCE and consent errors fail closed',async()=>{
 const s=await setup();try{
  const resource=await fetch(s.config.resource,{method:'POST'});assert.ok(resource.status===401&&resource.headers.get('www-authenticate')?.includes('resource_metadata'));
  const rm=await (await fetch(s.issuer+'/.well-known/oauth-protected-resource/mcp')).json();assert.ok(rm.resource===s.config.resource&&rm.scopes_supported[0]==='orbit:read');
  const discovery=await (await fetch(s.issuer+'/.well-known/oauth-authorization-server')).json();assert.ok(discovery.issuer===s.issuer&&discovery.code_challenge_methods_supported.includes('S256')&&discovery.registration_endpoint);
  const bad=await s.register('https://evil.example/callback');assert.ok(bad.status===400);
  const {body:client,status}=await s.register();assert.ok(status===201);
  const plain=await s.flow(client,A,{method:'plain'});assert.ok(plain.callback?.searchParams.get('error'));
  const denied=await s.flow(client,A,{decision:'deny'});assert.ok(denied.callback?.searchParams.get('error')==='access_denied');
  const csrf=await s.flow(client,A,{tamperCsrf:true});assert.ok(csrf.response?.status===400);
  const origin=await s.flow(client,A,{origin:'https://evil.example'});assert.ok(origin.response?.status===400);
  const wrongResource=await s.flow(client,A,{resource:'https://wrong.example/mcp'});assert.ok(wrongResource.callback?.searchParams.get('error'));
  const scope=await s.flow(client,A,{scope:'orbit:write'});assert.ok(scope.callback?.searchParams.get('error'));
  const ok=await s.flow(client);assert.ok(ok.callback?.searchParams.get('code'));
  const wrong=await s.token(client,ok.callback.searchParams.get('code'),opaque());assert.ok(wrong.status===400);
 }finally{await s.cleanup();}
});

test('real OAuth code exchange and SDK Streamable HTTP isolate all20 tools and rotate refresh',async()=>{
 const s=await setup();try{
  const {body:client}=await s.register();
  const a=await s.flow(client,A),b=await s.flow(client,B);
  const ta=await s.token(client,a.callback.searchParams.get('code'),a.verifier),tb=await s.token(client,b.callback.searchParams.get('code'),b.verifier);
  assert.ok(ta.status===200&&tb.status===200&&ta.body.refresh_token&&tb.body.refresh_token);
  const verified=await jwtVerify(ta.body.access_token,createLocalJWKSet({keys:[s.publicKey]}),{issuer:s.issuer,audience:s.config.resource,algorithms:['ES256'],typ:'at+jwt',requiredClaims:['sub','exp','iat','client_id','orbit_grant']});
  const grant=await s.provider.Grant.find(verified.payload.orbit_grant);
  assert.ok(grant&&grant.accountId===A&&grant.clientId===client.client_id,'Synthetic grant is present and bound');
  for(const tool of ['', 'get_diet_context']){
   const env={...process.env,ORBIT_QA_MCP_URL:s.config.resource,ORBIT_QA_MCP_TOKEN:ta.body.access_token,ORBIT_QA_TOOL:tool};
   const run=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../../../qa/orbit-mcp-inspector.mjs',import.meta.url))],{env,timeout:30000,windowsHide:true});
   const inspected=JSON.parse(run.stdout);assert.ok(inspected.status==='PASS'&&(tool?inspected.toolResponseJson:inspected.toolCount===20+moneyTools.length+diaryTools.length),'MCP Inspector verified synthetic streamable HTTP: '+JSON.stringify(inspected));
  }
  for(const [session,owner]of [[ta,A],[tb,B]]){
   const client=new Client({name:'ORBIT synthetic integration',version:'1.0.0'});
   await client.connect(new StreamableHTTPClientTransport(new URL(s.config.resource),{requestInit:{headers:{Authorization:'Bearer '+session.body.access_token}}}));
   const list=await client.listTools();assert.equal(list.tools.length,20+moneyTools.length+diaryTools.length);
   for(const tool of list.tools.filter(t=>t.name.startsWith('get_'))){const result=await client.callTool({name:tool.name,arguments:{}});assert.ok(!result.isError&&JSON.parse(result.content[0].text).data[0].syntheticOwner===owner);}
   const before=s.reads;const bad=await client.callTool({name:'get_diet_context',arguments:{userId:B}});assert.ok(bad.isError&&s.reads===before);
   await client.close();
  }
  const current=s.store.get('Upstream',A);current.expires=0;s.store.put('Upstream',A,current,300);
  await Promise.all([s.upstream.token(A),s.upstream.token(A)]);assert.ok(s.refreshCount===1);
  const rotate=await fetch(s.issuer+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.client_id,refresh_token:ta.body.refresh_token,resource:s.config.resource})});
  const rt=await rotate.json();assert.ok(rotate.status===200&&rt.refresh_token!==ta.body.refresh_token);
  const reuse=await fetch(s.issuer+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.client_id,refresh_token:ta.body.refresh_token,resource:s.config.resource})});
  assert.ok(reuse.status===400);
  const rejected=await s.mcp(rt.access_token);assert.ok(rejected.status===401);
  const other=await s.mcp(tb.body.access_token);assert.ok(other.status===200);
  const wrongClient=await s.register();
  const crossClient=await fetch(s.issuer+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:wrongClient.body.client_id,refresh_token:tb.body.refresh_token,resource:s.config.resource})});
  assert.ok(crossClient.status===400);
  const replay=await s.token(client,b.callback.searchParams.get('code'),b.verifier);assert.ok(replay.status===400);
  assert.ok((await s.mcp(tb.body.access_token)).status===401);
 }finally{await s.cleanup();}
});

test('MCP rejects foreign issuer audience expired tokens scope and revoked grants',async()=>{
 const s=await setup();try{
  const {body:client}=await s.register(),f=await s.flow(client,A),t=await s.token(client,f.callback.searchParams.get('code'),f.verifier);
  assert.ok((await s.mcp(t.body.access_token)).status===200);
  const claims=JSON.parse(Buffer.from(t.body.access_token.split('.')[1],'base64url').toString()),jwk=s.store.get('Key','signing');
  const {importJWK}=await import('jose'),key=await importJWK(jwk,'ES256');
  for(const edit of [{iss:'https://foreign.example'},{aud:'https://foreign.example/mcp'},{exp:1},{sub:B},{scope:'orbit:write'},{orbit_grant:'unknown'}]){
   const token=await new SignJWT({...claims,...edit}).setProtectedHeader({alg:'ES256',kid:jwk.kid,typ:'at+jwt'}).sign(key);
   const r=await s.mcp(token);assert.ok(r.status===401||r.status===403);
  }
  const method=await fetch(s.config.resource,{method:'DELETE',headers:{Authorization:'Bearer '+t.body.access_token}});assert.ok(method.status===405);
  const origin=await fetch(s.config.resource,{method:'POST',headers:{Origin:'https://evil.example',Authorization:'Bearer '+t.body.access_token}});assert.ok(origin.status===403);
 }finally{await s.cleanup();}
});

test('OpenAI OIDC defaults interoperate without broadening the resource scope',async()=>{
 const s=await setup();try{
  const {body:client,status}=await s.register(undefined,'orbit:read openid');assert.ok(status===201);
  const f=await s.flow(client,A,{scope:'openid orbit:read'}),t=await s.token(client,f.callback.searchParams.get('code'),f.verifier);
  assert.ok(t.status===200&&t.body.id_token&&t.body.refresh_token);
  const keys=createLocalJWKSet({keys:[s.publicKey]});
  const id=await jwtVerify(t.body.id_token,keys,{issuer:s.issuer,audience:client.client_id,algorithms:['ES256']});
  const access=await jwtVerify(t.body.access_token,keys,{issuer:s.issuer,audience:s.config.resource,algorithms:['ES256'],typ:'at+jwt'});
  assert.ok(id.payload.sub===A&&access.payload.scope==='orbit:read');
  assert.ok((await s.mcp(t.body.access_token)).status===200);
  assert.ok((await s.mcp(t.body.id_token)).status===401);
 }finally{await s.cleanup();}
});

test('separate MONEY consent, signed request binding, read-grant denial, rotation and revocation',async()=>{
 const s=await setup();try{
  const {body:readClient}=await s.register(),readFlow=await s.flow(readClient),read=await s.token(readClient,readFlow.callback.searchParams.get('code'),readFlow.verifier);
  const args={requestId:A,categoryId:B,color:'#123456',expectedColor:'#ffffff',expectedVersion:0};
  const denied=await s.mcp(read.body.access_token,'tools/call',{name:'money_set_category_color',arguments:args});
  assert.equal((await denied.json()).result.isError,true);assert.equal(s.writes,0);
  const {body:writeClient,status}=await s.register(undefined,'orbit:read orbit:write:money');assert.equal(status,201);
  const writeFlow=await s.flow(writeClient,A,{scope:'orbit:read orbit:write:money'}),write=await s.token(writeClient,writeFlow.callback.searchParams.get('code'),writeFlow.verifier);assert.equal(write.status,200);
  const claims=await jwtVerify(write.body.access_token,createLocalJWKSet({keys:[s.publicKey]}),{issuer:s.issuer,audience:s.config.resource});assert.ok(claims.payload.scope.split(' ').includes('orbit:write:money'));
  const client=new Client({name:'MONEY explicit-consent synthetic',version:'1'});try{
   await client.connect(new StreamableHTTPClientTransport(new URL(s.config.resource),{requestInit:{headers:{Authorization:'Bearer '+write.body.access_token}}}));
   const tools=await client.listTools();const color=tools.tools.find(t=>t.name==='money_set_category_color');assert.equal(color.annotations.readOnlyHint,false);assert.deepEqual(color._meta.securitySchemes[0].scopes,['orbit:read','orbit:write:money']);
   const result=await client.callTool({name:'money_set_category_color',arguments:args});assert.ok(!result.isError);assert.equal(s.writes,1);
   const invalid=await client.callTool({name:'money_set_category_color',arguments:{...args,ownerId:B}});assert.equal(invalid.isError,true);assert.equal(s.writes,1);
  }finally{await client.close();}
  const refreshed=await fetch(s.issuer+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:readClient.client_id,refresh_token:read.body.refresh_token,resource:s.config.resource,scope:'orbit:read orbit:write:money'})});assert.notEqual(refreshed.status,200);
  await (await s.provider.Grant.find(claims.payload.orbit_grant)).destroy();assert.equal((await s.mcp(write.body.access_token)).status,401);
 }finally{await s.cleanup();}
});
