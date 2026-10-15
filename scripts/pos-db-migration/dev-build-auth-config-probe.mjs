import {vars,save} from './db.mjs';import {recoverAuth} from './auth-secure.mjs';
const scope=process.argv[2]||'DEV',s=recoverAuth(scope);const v=vars(scope,s.manifest.webId);const url=s.manifest.siteUrl+'/login';const r=await fetch(url);const html=await r.text();
const files=[...new Set([...html.matchAll(/src="([^"]+\.js(?:\?[^"]*)?)"/g)].map(x=>new URL(x[1],url).href))];
let correctUrl=false,oldUrl=false,correctPublishableKey=false;
for(const file of files){const body=await (await fetch(file)).text();correctUrl ||=body.includes(s.manifest.url);oldUrl ||=body.includes(scope==='DEV'?'rmfgyrimubaxdptwqiqq.supabase.co':'yhxhvpvocsestxhoqtwa.supabase.co');correctPublishableKey ||=body.includes(s.variables.POS_AUTH_PUBLISHABLE_KEY);}
const report={at:new Date().toISOString(),url,status:r.status,files:files.length,variablesAuthUrl:v.NEXT_PUBLIC_SUPABASE_URL,variableKeyMatches:v.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY===s.variables.POS_AUTH_PUBLISHABLE_KEY,servedJs:{correctUrl,oldUrl,correctPublishableKey},secretsPrinted:false};await save(scope.toLowerCase()+'-web-auth-build-verification.json',report);console.log(JSON.stringify(report));
