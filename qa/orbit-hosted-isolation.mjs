import {createPrivateKey,randomBytes,randomUUID,sign} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';

// DEV-only, disposable identity. Secrets stay in the official CLI-injected process environment.
const project='2b52b232-38b2-44b6-b97e-4caba54f90bc';
const environment='9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c';
const auth='https://pos-auth-dev-development.up.railway.app/auth/v1';
const api='https://workflow-api-development-development.up.railway.app';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cleanupMirror(id,email,runId){
 if(!uuid.test(id)||!uuid.test(runId)||email!==`orbit-qa-${runId}@example.invalid`)throw Error('Cleanup identity fence');
 const raw=process.env.DEV_DB_URL;
 if(!process.env.SPRING_PROFILES_ACTIVE?.split(',').map(s=>s.trim()).includes('hosted-dev')||!raw?.startsWith('jdbc:postgresql://'))throw Error('DEV environment required');
 const db=new URL(raw.slice(5));
 if(!db.hostname.endsWith('.railway.internal'))throw Error('DEV environment required');
 // Observed active public TCP proxy of this exact DEV database; credentials stay in env.
 db.hostname='sakura.proxy.rlwy.net';db.port='20671';
 const identity=`u.email='${email}' AND u.raw_user_meta_data->>'qaRunId'='${runId}'`;
 const sql=`DELETE FROM auth.users u WHERE u.id='${id}'::uuid AND ${identity} AND NOT EXISTS(SELECT 1 FROM projects WHERE user_id=u.id) AND NOT EXISTS(SELECT 1 FROM work_tasks WHERE user_id=u.id) AND NOT EXISTS(SELECT 1 FROM work_records WHERE user_id=u.id) AND NOT EXISTS(SELECT 1 FROM money_transactions WHERE user_id=u.id) AND NOT EXISTS(SELECT 1 FROM sleep_sessions WHERE owner_id=u.id); SELECT count(*) FROM auth.users WHERE id='${id}'::uuid;`;
 const env={...process.env,PGHOST:db.hostname,PGPORT:db.port||'5432',PGDATABASE:decodeURIComponent(db.pathname.slice(1)),PGUSER:process.env.DEV_DB_USERNAME,PGPASSWORD:process.env.DEV_DB_PASSWORD,PGCONNECT_TIMEOUT:'15'};
 if(db.searchParams.has('sslmode'))env.PGSSLMODE=db.searchParams.get('sslmode');
 let result;try{result=execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-t','-A','-v','ON_ERROR_STOP=1','-c',sql],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch(e){const message=String(e.stderr);console.log(JSON.stringify({psqlFailure:{dns:/resolve|translate host name/i.test(message),timeout:/timeout|timed out/i.test(message),authentication:/authentication|password/i.test(message),ssl:/SSL|certificate/i.test(message),schema:/does not exist/i.test(message),refused:/refused/i.test(message),internalHost:db.hostname.endsWith('.railway.internal')}}));throw e;}
 if(!result.endsWith('0'))throw Error('Synthetic mirror cleanup incomplete');
 console.log(JSON.stringify({cleanupMirror:'PASS'}));
}
if(process.argv[2]==='cleanup'){
 try{cleanupMirror(...process.argv.slice(3));}catch(e){console.log(JSON.stringify({cleanupMirror:'FAIL',errorType:e.name,code:e.code??null,exitStatus:e.status??null,reason:['Cleanup identity fence','DEV environment required','Synthetic mirror cleanup incomplete'].includes(e.message)?e.message:'PSQL_FAILED',profileMatches:process.env.SPRING_PROFILES_ACTIVE?.includes('hosted-dev')===true,jdbcPresent:process.env.DEV_DB_URL?.startsWith('jdbc:postgresql://')===true}));process.exitCode=1;}
}else{
 let id,email,runId;let adminDeleted=false,mirrorDeleted=false;const evidence={environment:'DEV',identity:'disposable synthetic GoTrue user; no email sent',results:[]};
 try{
  const authLocation=new URL(process.env.API_EXTERNAL_URL||'https://invalid.invalid');
  if(authLocation.origin!=='https://pos-auth-dev-development.up.railway.app'||!['/','/auth/v1','/auth/v1/'].includes(authLocation.pathname))throw Error('DEV auth fence');
  const parsed=JSON.parse(process.env.GOTRUE_JWT_KEYS||'null');const keys=[];
  function collect(v){if(v&&typeof v==='object'){if(v.kty==='EC'&&v.d)keys.push(v);else for(const x of Object.values(v))collect(x);}}
  collect(parsed);if(keys.length!==1)throw Error('Expected existing DEV signing key');
  const jwk=keys[0];const privateKey=createPrivateKey({key:jwk,format:'jwk'});
  const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  function adminToken(){const now=Math.floor(Date.now()/1000);const body=encode({alg:'ES256',typ:'JWT',kid:jwk.kid})+'.'+encode({iss:process.env.GOTRUE_JWT_ISSUER,aud:process.env.GOTRUE_JWT_AUD,role:'service_role',iat:now,exp:now+180});return body+'.'+sign('sha256',Buffer.from(body),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');}
  async function authRequest(path,method,body){return fetch(auth+path,{method,headers:{apikey:process.env.POS_AUTH_PUBLISHABLE_KEY,Authorization:'Bearer '+adminToken(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});}
  runId=randomUUID();email=`orbit-qa-${runId}@example.invalid`;const password=randomBytes(32).toString('base64url');
  evidence.phase='CREATE_SYNTHETIC_USER';
  const created=await authRequest('/admin/users','POST',{email,password,email_confirm:true,user_metadata:{qaRunId:runId,purpose:'ORBIT isolated read QA'}});
  if(!created.ok)throw Error('DEV synthetic user creation rejected');const user=await created.json();id=user.id;
  if(!uuid.test(id)||user.email!==email||user.user_metadata?.qaRunId!==runId)throw Error('Created identity mismatch');
  evidence.phase='NORMAL_PASSWORD_SIGN_IN';
  const login=await fetch(auth+'/token?grant_type=password',{method:'POST',headers:{apikey:process.env.POS_AUTH_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password}),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!login.ok)throw Error('Synthetic normal sign-in rejected');const session=await login.json();const token=session.access_token;
  if(session.user?.id!==id||!token)throw Error('Synthetic token mismatch');
  const routes=['sleep','recovery','diet','diet_daily','diet_progress','calendar','work_records','checklist_catalog','checklist_records','workflow_projects','workflow_tasks','workflow_day','workflow_plan','workflow_waiting','money_overview','money_transactions','money_accounts','money_loans','money_savings','money_earnings'];
  const emptyPaths={diet:['readings'],diet_daily:['data'],diet_progress:['data.items','data.checks','data.challenges','data.goals'],calendar:['data.planBlocks','data.actualBlocks'],work_records:['data'],checklist_catalog:['data.identities','data.areas','data.items'],checklist_records:['data'],workflow_projects:['data'],workflow_tasks:['data'],workflow_day:['data.blocks'],workflow_plan:['data'],workflow_waiting:['data.readyToCheck','data.waiting'],money_transactions:['data'],money_accounts:['data'],money_loans:['data','repayments'],money_savings:['data.items'],money_earnings:['data.records','data.allRecords','data.archivedRecords']};
  for(const name of routes){const route='get_'+name+'_context';evidence.phase=route;const r=await fetch(api+'/api/orbit/context/'+route,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});evidence.lastResponse={status:r.status,contentType:r.headers.get('content-type')};const j=await r.json();let empty=true;
   for(const path of emptyPaths[name]??[]){const value=path.split('.').reduce((v,k)=>v?.[k],j);if(!Array.isArray(value)||value.length!==0)empty=false;}
   if(name==='sleep'&&(j.lastCompleted!=null||j.activeSession!=null))empty=false;
   if(name==='money_overview'&&Array.isArray(j.data?.balances)&&j.data.balances.length)empty=false;
   evidence.results.push({route,status:r.status,emptySourceFacts:empty,privateNoStore:r.headers.get('cache-control')==='private, no-store'});
   if(r.status!==200||!empty)throw Error('Hosted owner isolation failed');
  }
  evidence.status='PASS';
 }catch(error){evidence.status='FAIL';evidence.errorType=error.name;evidence.error=error.message?.match(/^(DEV|Expected|Created|Synthetic|Hosted)/)?error.message:'Synthetic validation unavailable';process.exitCode=1;}
 finally{
  if(id&&email&&runId){
   // Reuse the existing DEV key only for the standard admin delete of this exact owned fixture.
   try{
    const parsed=JSON.parse(process.env.GOTRUE_JWT_KEYS);let key;function find(v){if(v&&typeof v==='object'){if(v.kty==='EC'&&v.d)key=v;else for(const x of Object.values(v))find(x);}}find(parsed);
    const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const now=Math.floor(Date.now()/1000);const body=enc({alg:'ES256',typ:'JWT',kid:key.kid})+'.'+enc({iss:process.env.GOTRUE_JWT_ISSUER,aud:process.env.GOTRUE_JWT_AUD,role:'service_role',iat:now,exp:now+60});const admin=body+'.'+sign('sha256',Buffer.from(body),{key:createPrivateKey({key,format:'jwk'}),dsaEncoding:'ieee-p1363'}).toString('base64url');
    const deleted=await fetch(auth+'/admin/users/'+id,{method:'DELETE',headers:{apikey:process.env.POS_AUTH_PUBLISHABLE_KEY,Authorization:'Bearer '+admin},redirect:'error',signal:AbortSignal.timeout(15000)});adminDeleted=deleted.ok;
   }catch{}
   try{execFileSync('cmd.exe',['/d','/c','npx','--yes','@railway/cli@5.71.0','run','--project',project,'--environment',environment,'--service','eba7d263-7dc3-448a-a6b8-c2994721b597','--no-local','--','node',process.argv[1],'cleanup',id,email,runId],{encoding:'utf8',stdio:['ignore','pipe','pipe']});mirrorDeleted=true;}catch(e){try{evidence.mirrorCleanup=JSON.parse(e.stdout.toString().trim().split(/\r?\n/).at(-1));}catch{}}
  }
  evidence.cleanup={authIdentity:!id||adminDeleted?'PASS':'FAIL',mirroredIdentity:!id||mirrorDeleted?'PASS':'FAIL'};
  if(id&&(!adminDeleted||!mirrorDeleted)){evidence.fixture={id,email,runId};process.exitCode=1;}
  if(process.env.ORBIT_QA_EVIDENCE_FILE)writeFileSync(process.env.ORBIT_QA_EVIDENCE_FILE,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));
 }
}
