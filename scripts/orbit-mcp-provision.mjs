// Run ONLY through official "railway run" against the selected POS auth service.
// No secret values are emitted or written to files. This is not shipped in MCP.
import {createPrivateKey,sign,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const project='2b52b232-38b2-44b6-b97e-4caba54f90bc';
const targets={
 DEV:{environment:'9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c',api:'eba7d263-7dc3-448a-a6b8-c2994721b597',mcp:'43a27932-e8c1-497f-acb6-5072652b6984',web:'b7f1a522-21a4-488e-b4e1-fbd4c60ce4ae',auth:'https://pos-auth-dev-development.up.railway.app/auth/v1',issuer:'https://orbit-pos-mcp-dev-development.up.railway.app'},
 PROD:{environment:'c2c20488-311f-4b9e-9ec9-d79508123176',api:'e46b58f4-e829-430f-a4c4-b27e24d46f19',mcp:'5c3b6558-f1fa-4836-bab0-123af47823b8',web:'5818a578-b7a2-443a-aaad-ce10f6bb708c',auth:'https://pos-auth-prod-production.up.railway.app/auth/v1',issuer:'https://orbit-pos-mcp-prod-production.up.railway.app'}
};
let listShape;
try{
 const scope=process.argv[2],t=targets[scope];if(!t)throw Error('TARGET');
 if(process.env.API_EXTERNAL_URL?.replace(/\/$/,'')!==t.auth||!process.env.GOTRUE_JWT_ISSUER||!process.env.POS_AUTH_PUBLISHABLE_KEY)throw Error('IDENTITY_FENCE');
 let jwk;function find(v){if(v&&typeof v==='object'){if(v.kty==='EC'&&v.d){if(jwk)throw Error('AMBIGUOUS_KEY');jwk=v;}else for(const c of Object.values(v))find(c);}}
 find(JSON.parse(process.env.GOTRUE_JWT_KEYS));if(!jwk)throw Error('AUTH_KEY');
 const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),now=Math.floor(Date.now()/1000);
 const data=enc({alg:'ES256',kid:jwk.kid,typ:'JWT'})+'.'+enc({iss:process.env.GOTRUE_JWT_ISSUER,aud:process.env.GOTRUE_JWT_AUD,role:'service_role',iat:now,exp:now+180});
 const admin=data+'.'+sign('sha256',Buffer.from(data),{key:createPrivateKey({key:jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'}).toString('base64url');
 const headers={apikey:process.env.POS_AUTH_PUBLISHABLE_KEY,Authorization:'Bearer '+admin,'Content-Type':'application/json'};
 const request=async(method,body)=>{
  const r=await fetch(t.auth+'/admin/oauth/clients',{method,headers,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('AUTH_CLIENT_HTTP_'+r.status);return r.json();
 };
 const list=await request('GET'),clients=Array.isArray(list)?list:list.clients??list.items??list.data??(Object.keys(list).length===0?[]:undefined);
 listShape=Object.keys(list);
 if(!Array.isArray(clients))throw Error('CLIENT_LIST_SHAPE');
 const callback=t.issuer+'/interaction/upstream',name='ORBIT POS read-only relay '+scope;
 let client=clients.find(c=>c.client_name===name&&c.redirect_uris?.length===1&&c.redirect_uris[0]===callback);
 let created=false;
 if(!client){client=await request('POST',{client_name:name,client_uri:t.issuer,client_type:'public',token_endpoint_auth_method:'none',redirect_uris:[callback],grant_types:['authorization_code','refresh_token'],response_types:['code'],scope:'openid'});created=true;}
 if(!/^[0-9a-f-]{36}$/i.test(client.client_id)||client.token_endpoint_auth_method!=='none')throw Error('CLIENT_IDENTITY');
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA)$/i.test(k)));
 const cli=(args,input)=>execFileSync('cmd.exe',['/d','/c','npx','--yes','@railway/cli@5.71.0',...args],{env,encoding:'utf8',input,stdio:['pipe','pipe','pipe'],windowsHide:true});
 const old=JSON.parse(cli(['variable','list','--project',project,'--environment',t.environment,'--service',t.mcp,'--json']));
 if(old.ORBIT_MASTER_KEY&&!/^[a-f0-9]{64}$/.test(old.ORBIT_MASTER_KEY))throw Error('EXISTING_VAULT_KEY_INVALID');
 if(!old.ORBIT_MASTER_KEY)cli(['variable','set','ORBIT_MASTER_KEY','--stdin','--project',project,'--environment',t.environment,'--service',t.mcp,'--skip-deploys'],randomBytes(32).toString('hex'));
 // Public configuration and a public auth key; signing/DB credentials are excluded.
 for(const[k,v]of Object.entries({ORBIT_POS_ENV:scope,ORBIT_ISSUER:t.issuer,ORBIT_UPSTREAM_CLIENT_ID:client.client_id,POS_AUTH_ISSUER:process.env.GOTRUE_JWT_ISSUER,POS_AUTH_PUBLISHABLE_KEY:process.env.POS_AUTH_PUBLISHABLE_KEY,ORBIT_DATA_DIR:'/data',PORT:'3000',NODE_ENV:'production'}))
  cli(['variable','set',k,'--stdin','--project',project,'--environment',t.environment,'--service',t.mcp,'--skip-deploys'],v);
 for(const[k,v]of Object.entries({NEXT_PUBLIC_ORBIT_MCP_ORIGIN:t.issuer,NEXT_PUBLIC_ORBIT_OAUTH_CLIENT_ID:client.client_id}))
  cli(['variable','set',k,'--stdin','--project',project,'--environment',t.environment,'--service',t.web,'--skip-deploys'],v);
 cli(['variable','set','APP_ORBIT_OAUTH_CLIENT_IDS','--stdin','--project',project,'--environment',t.environment,'--service',t.api,'--skip-deploys'],client.client_id);
 console.log(JSON.stringify({scope,created,clientId:client.client_id,mcpIssuer:t.issuer,status:'PROVISIONED',vaultKeyRotated:false}));
}catch(e){
 const safe=/^(TARGET|IDENTITY_FENCE|AMBIGUOUS_KEY|AUTH_KEY|AUTH_CLIENT_HTTP_\d+|CLIENT_LIST_SHAPE|CLIENT_IDENTITY|EXISTING_VAULT_KEY_INVALID)$/.test(e.message)?e.message:'PROVISION_FAILED';
 console.log(JSON.stringify({status:'FAIL',reason:safe,listShape:safe==='CLIENT_LIST_SHAPE'?listShape:undefined}));process.exitCode=1;
}
