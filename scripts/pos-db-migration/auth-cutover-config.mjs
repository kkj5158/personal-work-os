import {recoverAuth,secureVariables} from './auth-secure.mjs';import {scopes,save} from './db.mjs';
const scope=process.argv[2];const s=recoverAuth(scope);const api=scope==='DEV'?{DEV_SUPABASE_URL:s.manifest.url}:{SUPABASE_JWT_ISSUER:s.manifest.url+'/auth/v1',SUPABASE_JWKS_URI:s.manifest.url+'/auth/v1/.well-known/jwks.json'};
const a=await secureVariables(scope,scopes[scope].api,api,true);
const w=await secureVariables(scope,s.manifest.webId,{NEXT_PUBLIC_SUPABASE_URL:s.manifest.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:s.variables.POS_AUTH_PUBLISHABLE_KEY},true);
await save(scope.toLowerCase()+'-auth-cutover-configuration.json',{at:new Date().toISOString(),scope,issuer:s.manifest.url+'/auth/v1',webAuthBase:s.manifest.url,api:a,web:w,deployRequired:true});console.log(JSON.stringify({scope,authVariablesChanged:true,deployRequired:true}));
