import crypto from 'node:crypto';import {recoverAuth} from './auth-secure.mjs';import {query,save} from './db.mjs';
const scope=process.argv[2];if(!['DEV','PROD'].includes(scope))throw Error('Exact environment required');
const s=recoverAuth(scope);process.env.POS_DESTINATION_DATABASE=s.manifest.database;
const api=scope==='DEV'?'https://workflow-api-development-development.up.railway.app':'https://personal-work-os-prod-production.up.railway.app';
const b64=x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url');
const jwk=JSON.parse(s.variables.GOTRUE_JWT_KEYS)[0],key=crypto.createPrivateKey({key:jwk,format:'jwk'});
// A protected service-role administration credential creates a disposable Auth account.
// Every session token used to test the API below is actually issued by GoTrue.
const header=b64({alg:'ES256',kid:jwk.kid,typ:'JWT'}),body=b64({iss:s.manifest.url+'/auth/v1',aud:'authenticated',role:'service_role',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600});
const admin=header+'.'+body+'.'+crypto.sign('sha256',Buffer.from(header+'.'+body),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
const email='pos-migration-'+scope.toLowerCase()+'-'+crypto.randomUUID()+'@invalid.example',password=crypto.randomBytes(32).toString('base64url');
const report={scope,startedAt:new Date().toISOString(),existingOwnerCredentialVerification:'Separate owner browser login required; this disposable-account test is not owner-login proof',tests:[],cleanup:{},pass:false};let userId,projectId,token,refresh;
async function auth(path,method,body,bearer){const r=await fetch(s.manifest.url+'/auth/v1'+path,{method,headers:{apikey:s.variables.POS_AUTH_PUBLISHABLE_KEY,'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});let data;try{data=await r.json();}catch{data={};}return {status:r.status,data};}
async function app(path,method='GET',body,bearer=token){const r=await fetch(api+path,{method,headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});let data;try{data=await r.json();}catch{data={};}return {status:r.status,data};}
function check(name,pass,detail={}){report.tests.push({name,pass,...detail});if(!pass)throw Error('Acceptance check failed: '+name);}
try{
 const created=await auth('/admin/users','POST',{email,password,email_confirm:true,app_metadata:{pos_migration_fixture:true}},admin);
 check('GoTrue creates clearly disposable confirmed-password account',created.status===200||created.status===201,{status:created.status});userId=created.data.id||created.data.user?.id;if(!userId)throw Error('Disposable account UUID missing');
 const login=await auth('/token?grant_type=password','POST',{email,password});check('Fresh password login issued by actual Railway GoTrue',login.status===200&&login.data.user?.id===userId,{status:login.status});token=login.data.access_token;refresh=login.data.refresh_token;
 check('GoTrue session uses ES256 and intended issuer/audience',JSON.parse(Buffer.from(token.split('.')[0],'base64url')).alg==='ES256'&&JSON.parse(Buffer.from(token.split('.')[1],'base64url')).iss===s.manifest.url+'/auth/v1'&&JSON.parse(Buffer.from(token.split('.')[1],'base64url')).aud==='authenticated');
 for(const endpoint of ['/api/money/accounts','/api/money/transactions','/api/workflow','/api/authoring/sessions','/api/sleep/v1/sessions','/api/sleep/v1/naps','/api/exercise/v1/state','/api/diet']){const r=await app(endpoint);check('Authenticated read '+endpoint,r.status===200,{status:r.status});}
 const ownerIds=(await query(scope,'destination',"SELECT json_build_object('ids',coalesce(json_agg(id),'[]'::json)) FROM public.projects WHERE user_id IN (SELECT id FROM auth.users WHERE coalesce(raw_app_meta_data->>'pos_migration_fixture','false')<>'true');"))[0].ids;
 const forbidden=await app('/api/workflow?ownerId='+encodeURIComponent(ownerIds[0]||'00000000-0000-0000-0000-000000000000'));check('Different authenticated user cannot read existing owner projects',forbidden.status===200&&Array.isArray(forbidden.data.projects)&&!forbidden.data.projects.some(p=>ownerIds.includes(p.id))&&forbidden.data.projects.length===0);
 const accounts=(await query(scope,'destination',"SELECT json_build_object('id',id) FROM public.money_accounts WHERE user_id IN (SELECT id FROM auth.users WHERE coalesce(raw_app_meta_data->>'pos_migration_fixture','false')<>'true') LIMIT 1;"))[0];
 if(accounts){const denied=await app('/api/money/accounts/'+accounts.id);check('Existing financial account is inaccessible to another user',denied.status===404||denied.status===403,{status:denied.status});}
 const a=await app('/api/workflow/projects','POST',{title:'POS MIGRATION QA '+scope+' '+userId,status:'READY',color:'slate',memo:'Disposable migration acceptance fixture',order:0});check('Authenticated API creates fixture on Railway',a.status===200&&!!a.data.id,{status:a.status});projectId=a.data.id;
 const stored=(await query(scope,'destination',`SELECT json_build_object('count',count(*)) FROM public.projects WHERE id='${projectId}'::uuid AND user_id='${userId}'::uuid;`))[0];check('Created fixture persists under exact authenticated UUID',stored.count===1);
 const update=await app('/api/workflow/projects/'+projectId,'PATCH',{title:'POS MIGRATION QA updated '+scope,expectedRevision:a.data.revision});check('Authenticated API updates fixture',update.status===200,{status:update.status});
 const renewal=await auth('/token?grant_type=refresh_token','POST',{refresh_token:refresh});check('Refresh actually issues new session for same UUID',renewal.status===200&&renewal.data.user?.id===userId&&!!renewal.data.access_token,{status:renewal.status});token=renewal.data.access_token;refresh=renewal.data.refresh_token;
 const absent=await app('/api/money/accounts','GET',undefined,null);check('Anonymous API request is rejected',absent.status===401,{status:absent.status});
 const broken=await app('/api/money/accounts','GET',undefined,token.slice(0,token.lastIndexOf('.')+1)+'invalid-signature');check('Invalid JWT signature is rejected',broken.status===401,{status:broken.status});
 const deleted=await app('/api/workflow/projects/'+projectId,'DELETE');check('Authenticated API removes its disposable fixture',deleted.status===204,{status:deleted.status});projectId=undefined;
 const logout=await auth('/logout','POST',{},token);check('GoTrue logout succeeds',logout.status===204||logout.status===200,{status:logout.status});const revoked=await auth('/token?grant_type=refresh_token','POST',{refresh_token:refresh});check('Logged-out refresh token is rejected',revoked.status===400||revoked.status===401,{status:revoked.status});
 const again=await auth('/token?grant_type=password','POST',{email,password});check('Fresh password login works after logout',again.status===200&&again.data.user?.id===userId,{status:again.status});token=again.data.access_token;
 report.pass=true;
}catch(e){report.failure=e.message;}
finally{
 if(projectId&&token){try{report.cleanup.projectStatus=(await app('/api/workflow/projects/'+projectId,'DELETE')).status;}catch{report.cleanup.projectStatus='FAILED';}}
 if(userId){try{const cleanup=await auth('/admin/users/'+userId,'DELETE',{},admin);report.cleanup.authStatus=cleanup.status;report.cleanup.disposableUserRemoved=cleanup.status===200||cleanup.status===204;}catch{report.cleanup.disposableUserRemoved=false;}}
 report.completedAt=new Date().toISOString();report.pass=report.pass&&report.cleanup.disposableUserRemoved;await save(scope.toLowerCase()+'-auth-api-acceptance.json',report);console.log(JSON.stringify(report));if(!report.pass)process.exitCode=1;
}
