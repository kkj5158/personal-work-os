export const environments={
 DEV:{api:'https://workflow-api-development-development.up.railway.app',auth:'https://pos-auth-dev-development.up.railway.app/auth/v1',web:'https://workflow-web-development-development.up.railway.app'},
 PROD:{api:'https://personal-work-os-prod-production.up.railway.app',auth:'https://pos-auth-prod-production.up.railway.app/auth/v1',web:'https://kafka-sys.life'}
};
export function configFromEnv(env=process.env){
 const target=environments[env.ORBIT_POS_ENV];
 if(!target||!env.ORBIT_ISSUER||!env.ORBIT_MASTER_KEY?.match(/^[a-f0-9]{64}$/)||!env.ORBIT_UPSTREAM_CLIENT_ID||!env.POS_AUTH_PUBLISHABLE_KEY||!env.POS_AUTH_ISSUER)throw Error('ORBIT_CONFIG_INVALID');
 const url=new URL(env.ORBIT_ISSUER);
 if(url.protocol!=='https:'||url.origin!==env.ORBIT_ISSUER)throw Error('ORBIT_HTTPS_ORIGIN_REQUIRED');
 if(env.POS_USER_ACCESS_TOKEN||env.RAILWAY_TOKEN||env.DATABASE_URL||env.DEBUG)throw Error('ORBIT_FORBIDDEN_RUNTIME_SECRET');
 return {...target,issuer:url.origin,resource:url.origin+'/mcp',authIssuer:env.POS_AUTH_ISSUER,upstreamClient:env.ORBIT_UPSTREAM_CLIENT_ID,publishableKey:env.POS_AUTH_PUBLISHABLE_KEY,masterKey:Buffer.from(env.ORBIT_MASTER_KEY,'hex'),storeFile:(env.ORBIT_DATA_DIR||'/data')+'/oauth.sqlite',port:Number(env.PORT||3000),allowLoopback:false};
}
// Claude web/desktop/mobile connectors: Anthropic's single documented hosted callback.
export const CLAUDE_HOSTED_CALLBACK='https://claude.ai/api/mcp/auth_callback';
// RFC 8252 native loopback callback used by Claude Code: http, localhost/127.0.0.1,
// explicit unprivileged port, exactly /callback. Only public (auth method none)
// clients whose every redirect is loopback may register one (see app.mjs validator).
export function nativeLoopbackRedirect(uri){
 try{
  const u=new URL(uri),port=Number(u.port);
  return u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)&&/^[0-9]{4,5}$/.test(u.port)&&port>=1024&&port<=65535&&u.pathname==='/callback'&&!u.username&&!u.password&&!u.search&&!u.hash&&uri==='http://'+u.hostname+':'+u.port+'/callback';
 }catch{return false;}
}
export function redirectAllowed(uri,allowLoopback=false){
 try{
  const u=new URL(uri);if(u.username||u.password||u.hash||u.search)return false;
  if(u.protocol==='https:'&&u.hostname==='chatgpt.com'&&!u.port)
   return u.pathname==='/connector_platform_oauth_redirect'||/^\/(?:connector\/oauth|oauth\/codex)\/[a-zA-Z0-9_-]{1,160}$/.test(u.pathname);
  if(uri===CLAUDE_HOSTED_CALLBACK)return true;
  if(nativeLoopbackRedirect(uri))return true;
  return allowLoopback&&u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&u.pathname==='/callback';
 }catch{return false;}
}
