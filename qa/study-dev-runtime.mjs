// Owned loopback business DB + existing approved DEV storage. Never connects to PROD or shared business DB.
import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';import readline from 'node:readline';
import {available,ownedProcess,readiness,save,git} from './runtime/core.mjs';
const root=await fs.realpath(process.cwd()),runId='study-runtime-'+randomUUID(),dir=path.join(root,'.qa','runs',runId),data=path.join(dir,'postgres');
const ports={pg:55450,api:8189,web:3189},pg='C:/Program Files/PostgreSQL/18/bin',owner=randomUUID(),cli='C:/Users/kimji/AppData/Local/npm-cache/_npx/79fa66f96c8fdacf/node_modules/@railway/cli/bin/railway.exe';
for(const port of Object.values(ports))if(!await available(port))throw Error('OWNED_PORT_OCCUPIED:'+port);
const vars=JSON.parse(execFileSync(cli,['variable','list','--project','2b52b232-38b2-44b6-b97e-4caba54f90bc','--environment','9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c','--service','eba7d263-7dc3-448a-a6b8-c2994721b597','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
if(vars.SHARED_DESK_STORAGE_ENVIRONMENT!=='DEV'||vars.RAILWAY_ENVIRONMENT_ID!=='9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c')throw Error('DEV_STORAGE_IDENTITY_MISMATCH');
await fs.mkdir(data,{recursive:true});if(await fs.realpath(data)!==data)throw Error('OWNED_PATH_REDIRECT');
const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|GRADLE_USER_HOME)$/i.test(k))),JAVA_HOME:'C:/Program Files/Java/jdk-21',DEV_DB_URL:`jdbc:postgresql://127.0.0.1:${ports.pg}/postgres`,DEV_DB_USERNAME:'study_runtime',DEV_DB_PASSWORD:'',APP_DEV_USER_ID:owner,STUDY_STORAGE_ENABLED:'true',NEXT_PUBLIC_API_BASE_URL:`http://127.0.0.1:${ports.api}`,NEXT_PUBLIC_APP_ENV:'dev',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',SHARED_DESK_ENABLED:'false'};
for(const [k,v]of Object.entries(vars))if(k.startsWith('SHARED_DESK_STORAGE_'))env[k]=v;
const secrets=Object.values(vars).filter(v=>typeof v==='string'&&v.length>15),tasks=[],ownedKeys=[];let postgres,api,web,failure;
const result={runId,revision:git(root,'rev-parse','HEAD'),dirty:!!git(root,'status','--porcelain'),startedAt:new Date().toISOString(),database:'OWNED_LOOPBACK',sharedDatabase:'NEVER_CONNECTED',storage:'EXISTING_DEV_PROVIDER_SEPARATE_STUDY_NAMESPACE',browser:'PENDING',checks:[]};
function start(name,exe,args,cwd=root){const t=ownedProcess(exe,args,{cwd,env,name,logFile:path.join(dir,name+'.log'),secrets});tasks.push(t);return t;}
const base=`http://127.0.0.1:${ports.api}`;let snapshot;
async function request(route,body,expected=200){const r=await fetch(base+'/api/study'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(r.status!==expected)throw Error(`STUDY_HTTP_${r.status}_EXPECTED_${expected}:${route}`);return r.json();}
async function refresh(){snapshot=await request('/snapshot');return snapshot;}
async function command(action,data){const envelope={operationId:randomUUID(),expectedRevision:snapshot.revision,action,data};snapshot=await request('/commands',envelope);return envelope;}
function minimalPdf(kind,id,version){const objects=[`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << >> /Contents 4 0 R >>`,`<< /Length 0 >>\nstream\n\nendstream`,`<< /StudyWorkbookId (${id}) /StudyWorkbookVersion (${version}) /StudyDocumentKind (${kind}) >>`];let text='%PDF-1.7\n';const offsets=[0];for(const [i,obj]of objects.entries()){offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${obj}\nendobj\n`;}const xref=Buffer.byteLength(text);text+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(text);}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function upload(bytes,purpose,workbookId,version=1){
 const data={purpose,name:`study-qa-${purpose}.pdf`,size:bytes.length,type:'application/pdf',sha256:digest(bytes),...(purpose==='material'?{materialId:'qa-source'}:{workbookId,workbookVersion:version})};
 const ticket=await request('/assets',{operationId:randomUUID(),expectedRevision:snapshot.revision,action:'upload',data});ownedKeys.push(ticket.id);await refresh();
 const put=await fetch(ticket.url,{method:'PUT',headers:ticket.headers,body:bytes});if(!put.ok)throw Error('DEV_PROVIDER_PUT_FAILED:'+put.status);
 const ready=await request(`/assets/${ticket.id}/complete`,{operationId:randomUUID(),expectedRevision:snapshot.revision,action:'finalize',data:{}});if(ready.state!=='READY')throw Error('DEV_PROVIDER_FINALIZE_FAILED');await refresh();
 const content=await fetch(base+`/api/study/assets/${ticket.id}/content`);if(purpose!=='answer'){if(!content.ok||digest(Buffer.from(await content.arrayBuffer()))!==digest(bytes))throw Error('DEV_PROVIDER_BYTE_RETRIEVAL_MISMATCH');}else if(content.status!==403)throw Error('PRE_REVIEW_ANSWER_PDF_EXPOSED');
 return ticket.id;
}
try{
 await start('initdb',path.join(pg,'initdb.exe'),['-D',data,'-U','study_runtime','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale','--no-sync']).wait(120000);
 postgres=start('postgres',path.join(pg,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(ports.pg),'-c','max_connections=12']);for(let i=0;i<120&&!postgres.output.includes('ready to accept connections');i++){postgres.check();await new Promise(r=>setTimeout(r,250));}
 const bootstrap=path.join(dir,'bootstrap.sql');await fs.writeFile(bootstrap,`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); INSERT INTO auth.users VALUES('${owner}');`);
 await start('bootstrap',path.join(pg,'psql.exe'),['-h','127.0.0.1','-p',String(ports.pg),'-U','study_runtime','-d','postgres','-v','ON_ERROR_STOP=1','-f',bootstrap]).wait(30000);
 await start('backend-build','cmd.exe',['/d','/c','gradlew.bat','bootJar','--no-daemon','--max-workers=2','--console=plain'],path.join(root,'backend')).wait(600000);
 api=start('backend','C:/Program Files/Java/jdk-21/bin/java.exe',['-jar',path.join(root,'backend/build/libs/backend-0.0.1-SNAPSHOT.jar'),'--spring.profiles.active=dev','--server.address=127.0.0.1',`--server.port=${ports.api}`,'--spring.datasource.hikari.maximum-pool-size=2','--spring.datasource.hikari.minimum-idle=0','--app.money.processing-enabled=false','--app.money.classification-enabled=false','--app.absence-backfill-cron=-',`--app.dev-allowed-origins=http://127.0.0.1:${ports.web}`]);
 await readiness(base+'/api/study/capabilities',api,180000);result.checks.push({name:'fresh-full-flyway-and-jpa-validate',status:'PASS'});await refresh();
 await command('material.save',{id:'qa-source',title:'STUDY QA authored source',domain:'Synthetic test',weight:50,included:true,scope:'Owner-authored local test only',rights:'Self authored fixture',format:'pdf'});
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),id='study-qa-'+randomUUID();
 const q=(qid,kind,order)=>({id:qid,version:1,order,kind,prompt:kind==='true_false'?'This is a synthetic persistence test.':kind==='essay'?'Explain your own test observation.':'Draw the observation by hand.',responseSchema:kind==='true_false'?'boolean':kind==='essay'?'text':'attachment',source:{materialId:'qa-source',section:'Manually authored QA'}});
 const workbook={id,version:1,date,topic:'Manual STUDY backend verification',policyVersion:1,required:[q('boolean','true_false',1),q('essay','essay',2)],extension:[q('diagram','diagram',1)]};
 const binding=(part,q)=>({workbookId:id,workbookVersion:1,part,questionId:q.id,questionVersion:1}),key=(part,q)=>JSON.stringify([id,1,part,q.id,1]);
 const answerKeys=['required','extension'].flatMap(part=>workbook[part].map(q=>({binding:binding(part,q),model:'Private QA model',explanation:'Private manual explanation; no AI',rubric:['Self review only'],followUp:[]})));
 await command('workbook.import',{workbook,answerKeys});if(JSON.stringify(snapshot).includes('Private QA model'))throw Error('ANSWER_KEY_LEAK');
 const materialId=await upload(minimalPdf('material',id,1),'material',id);const questionId=await upload(minimalPdf('question',id,1),'question',id);const answerId=await upload(minimalPdf('answer',id,1),'answer',id);
 snapshot=await request(`/workbooks/${id}/1/publish`,{operationId:randomUUID(),expectedRevision:snapshot.revision,action:'publish',data:{questionAssetId:questionId,answerAssetId:answerId}});
 await command('draft.save',{binding:binding('required',workbook.required[0]),response:{value:false}});await refresh();if(snapshot.drafts[key('required',workbook.required[0])]?.response.value!==false)throw Error('FALSE_DRAFT_NOT_DURABLE');
 const input={workbookId:id,workbookVersion:1,part:'required',mode:'online',coverage:[key('required',workbook.required[0])],responses:{[key('required',workbook.required[0])]:{value:false}},attachments:[],note:'Synthetic online submission'};const attempt=await command('attempt.submit',input);await request('/commands',attempt);await refresh();if(snapshot.attempts.length!==1)throw Error('IDEMPOTENCY_DUPLICATED_ATTEMPT');
 const scanId=await upload(minimalPdf('handwritten',id,1),'handwritten',id);await command('attempt.submit',{workbookId:id,workbookVersion:1,part:'required',mode:'handwritten',coverage:[key('required',workbook.required[1])],responses:{},attachments:[{id:scanId,order:0}],note:'Synthetic durable handwritten PDF'});
 await command('feedback.add',{text:'Pending manual test feedback'});await command('policy.propose',{change:'explanation',scope:'next_week_only'});await command('policy.decide',{id:snapshot.proposals[0].id,approve:true});await command('policy.rollback',{version:1});
 await request(`/workbooks/${id}/1/review?part=required`,{});await refresh();const answerContent=await fetch(base+`/api/study/assets/${answerId}/content`);if(!answerContent.ok||digest(Buffer.from(await answerContent.arrayBuffer()))!==digest(minimalPdf('answer',id,1)))throw Error('REVIEWED_ANSWER_BYTE_MISMATCH');
 result.checks.push({name:'real-private-provider-material-pair-handwritten-draft-submit-policy',status:'PASS',objects:4});
 result.workbook={id,version:1,date,materialId,questionId,answerId,scanId};result.api='PASS';
 // Restore a resumable draft for browser reload verification; server rendering stays answer-free.
 await command('draft.save',{binding:binding('required',workbook.required[1]),response:{text:'Browser reload persistence fixture'}});
 await start('frontend-build','node',[path.join(root,'frontend/node_modules/next/dist/bin/next'),'build'],path.join(root,'frontend')).wait(600000);
 web=start('frontend','node',[path.join(root,'frontend/node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(ports.web)],path.join(root,'frontend'));await readiness(`http://127.0.0.1:${ports.web}/study`,web,180000);
 result.status='READY';await save(path.join(dir,'runtime.json'),{...result,ports,owner,processes:tasks.map(t=>({name:t.name,pid:t.child.pid}))});console.log('STUDY_RUNTIME_READY '+JSON.stringify({url:`http://127.0.0.1:${ports.web}/study`,evidence:path.join(dir,'runtime.json'),workbookId:id}));
 const terminal=readline.createInterface({input:process.stdin});await new Promise(resolve=>{terminal.on('line',line=>{if(line==='stop'){terminal.close();resolve();}});terminal.on('close',resolve);});
}catch(error){failure=error;result.status='FAIL';result.error=error.message;}
finally{
 // Exact owned synthetic namespace only. Uses adapter delete, never bucket listing or broad deletion.
 try{const list=await request('/assets');const sql=path.join(dir,'cleanup-keys.sql');await fs.writeFile(sql,"SELECT staging_key,final_key FROM study_assets;");const rows=execFileSync(path.join(pg,'psql.exe'),['-h','127.0.0.1','-p',String(ports.pg),'-U','study_runtime','-d','postgres','-A','-t','-F','\t','-f',sql],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim().split(/\r?\n/).filter(Boolean);result.cleanupObjects={discovered:list.length,exactOwnedRows:rows.length,status:'PENDING_ADAPTER_DELETE'};
  // Object deletion runs through a tiny, in-memory Java provider cleanup helper via the same namespace adapter.
  env.STUDY_CLEANUP_OWNER=owner;env.STUDY_CLEANUP_KEYS=rows.join('\n');await start('provider-cleanup','cmd.exe',['/d','/c','gradlew.bat','test','--tests','com.kafka.backend.study.StudyProviderCleanupTest','--no-daemon','--max-workers=2','--console=plain'],path.join(root,'backend')).wait(180000);result.cleanupObjects.status='PASS';
 }catch(e){result.cleanupObjects={status:'FAILED',reason:'Owned provider cleanup did not complete; preserve runtime evidence'};}
 for(const t of tasks.toReversed())if(t!==postgres)try{await t.stop();}catch{}
 if(postgres&&!postgres.exited){const pid=(await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);if(Number(pid[0])!==postgres.child.pid||path.resolve(pid[1])!==data)throw Error('POSTGRES_OWNERSHIP_MISMATCH');await start('postgres-stop',path.join(pg,'pg_ctl.exe'),['-D',data,'-m','fast','-w','stop']).wait(45000);}
 result.cleanup={portsReleased:await Promise.all(Object.values(ports).map(available)),localSyntheticDataRetained:true};result.finishedAt=new Date().toISOString();await save(path.join(dir,'result.json'),result);console.log('STUDY_RUNTIME_FINISHED '+JSON.stringify({status:result.status,cleanup:result.cleanup,cleanupObjects:result.cleanupObjects,evidence:path.join(dir,'result.json')}));
}
if(failure)throw Error('STUDY_RUNTIME_FAILED:'+failure.message);
