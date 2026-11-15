// A disposable loopback database and ordinary TEAM KAFKA browser handoff.
// Never loads shared DEV/PROD credentials or starts a separate browser/profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {available,ownedProcess,readiness,git,save} from './runtime/core.mjs';
import {systemEnvironment} from './runtime/environment.mjs';
const root=process.cwd(),run='account-ledger-'+Date.now(),dir=path.join(root,'.qa/runs',run),data=path.join(dir,'postgres'),pg='C:/Program Files/PostgreSQL/18/bin';
const reviewRegression=process.argv.includes('--review-regression');
const ports={pg:reviewRegression?55467:55473,api:18097,web:13017},owner=randomUUID(),username='account_ledger_synthetic',children=[];
for(const port of Object.values(ports))if(!await available(port))throw Error('OWNED_PORT_OCCUPIED:'+port);
await fs.mkdir(dir,{recursive:true});
const env={...systemEnvironment(),DEV_DB_URL:`jdbc:postgresql://127.0.0.1:${ports.pg}/postgres`,DEV_DB_USERNAME:username,DEV_DB_PASSWORD:'',APP_DEV_USER_ID:owner,NEXT_PUBLIC_APP_ENV:'dev',NEXT_PUBLIC_API_BASE_URL:`http://127.0.0.1:${ports.api}`,NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''};
function start(name,command,args,cwd=root){console.log('ACCOUNT_LEDGER_STAGE '+name);const task=ownedProcess(command,args,{cwd,env,name,logFile:path.join(dir,name+'.log')});children.push(task);return task;}
let postgres;
const report={run,revision:git(root,'rev-parse','HEAD'),dirty:!!git(root,'status','--porcelain'),database:'OWNED_LOOPBACK_SYNTHETIC',sharedDatabase:'NEVER_CONNECTED',ports,owner,dir,status:'RUNNING'};
const baseline=process.argv.includes('--baseline')||reviewRegression;
try{
 await start('initdb',pg+'/initdb.exe',['-D',data,'-U',username,'--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale','--no-sync']).wait(180000);
 postgres=start('postgres',pg+'/postgres.exe',['-D',data,'-h','127.0.0.1','-p',String(ports.pg),'-c','max_connections=20']);
 for(let i=0;i<120&&!postgres.output.includes('ready to accept connections');i++){postgres.check();await new Promise(r=>setTimeout(r,250));}
 const bootstrap=path.join(dir,'bootstrap.sql');await fs.writeFile(bootstrap,`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${owner}');`);
 await start('bootstrap',pg+'/psql.exe',['-h','127.0.0.1','-p',String(ports.pg),'-U',username,'-d','postgres','-v','ON_ERROR_STOP=1','-f',bootstrap]).wait(30000);
 await start('backend-build','cmd.exe',['/d','/c','gradlew.bat','bootJar','--no-daemon','--console=plain'],path.join(root,'backend')).wait(600000);
 const api=start('api','java',['-jar',path.join(root,'backend/build/libs/backend-0.0.1-SNAPSHOT.jar'),'--spring.profiles.active=dev','--server.address=127.0.0.1',`--server.port=${ports.api}`,'--spring.datasource.hikari.maximum-pool-size=2',`--app.dev-allowed-origins=http://127.0.0.1:${ports.web}`,'--app.money.processing-enabled=false','--money.ai.classification-provider-enabled=false','--money.ai.classification-worker-enabled=false','--money.ai.bookkeeping-worker-enabled=false','--app.absence-backfill-cron=-']);
 await readiness(`http://127.0.0.1:${ports.api}/api/money/accounts`,api,180000);
 const filters=reviewRegression?['MoneyOwnerReviewPostgresTest','MoneyReviewV2PostgresTest']:baseline?['MoneyUnifiedBookkeepingPostgresTest','MoneyFinancialPostgresTest','MoneySavingsReadPostgresTest','MoneyControllerSecurityTest']:['MoneyAccountLedgerPostgresTest','MoneyAccountLedgerSecurityTest','MoneyUnifiedBookkeepingPostgresTest','MoneyFinancialPostgresTest','MoneySavingsReadPostgresTest','MoneyReviewBatchPostgresTest','MoneyClassificationContextTest','VerifiedMoneyMatcherTest','MoneyControllerSecurityTest','MoneyWebPostgresTest','MoneyMeaningPostgresTest','MoneyReconciliationReadPostgresTest','MoneyReconciliationEvidenceScopeTest','MoneyRecommendationPostgresTest'];
 // Existing suites are named explicitly; unknown/missing filters fail rather than silently skip.
 const existing=(await fs.readdir(path.join(root,'backend/src/test/java/com/kafka/backend/money'))).map(f=>f.replace('.java',''));
 report.requestedTests=filters;report.unavailableTests=filters.filter(f=>!existing.includes(f));
 if(report.unavailableTests.length)throw Error('REQUIRED_SUITE_MISSING:'+report.unavailableTests.join(','));
 const active=filters;
 await start('backend-tests','cmd.exe',['/d','/c','gradlew.bat','test',...active.flatMap(f=>['--tests','com.kafka.backend.money.'+f]),'--no-daemon','--rerun-tasks','--console=plain'],path.join(root,'backend')).wait(900000);
 await fs.cp(path.join(root,'backend/build/test-results/test'),path.join(dir,'backend-tests'),{recursive:true});report.tests='PASS';
 if(!baseline){
  const call=async(url,payload,method)=>{const r=await fetch(`http://127.0.0.1:${ports.api}/api/money${url}`,{method:method??(payload?'POST':'GET'),headers:{'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});if(!r.ok)throw Error('FIXTURE_API_'+r.status+':'+url+':'+await r.text());return r.status===204?null:r.json();};
  const accounts=[];for(const [i,role]of ['SPENDING','INCOME_HUB','SAVINGS','CASH'].entries())accounts.push(await call('/accounts',{provider:role==='CASH'?'CASH':'IBK',displayName:['합성 생활비','합성 수입','합성 저축','합성 현금'][i],role,suffix:role==='CASH'?null:String(9700+i),includeInAssets:false}));
  const [a,b,s]=accounts,at='2026-11-10T01:00:00Z';
  await call('/tracking',{expense:[a.id],income:[b.id],expectedVersion:0},'PUT');
  const cats=await call('/categories/defaults',{}),expenseCategory=cats.find(c=>c.kind==='EXPENSE'&&!c.archived),incomeCategory=cats.find(c=>c.kind==='INCOME'&&!c.archived);
  const tx=async(type,from,to,amount,title,extra={})=>call('/transactions',{type,fromAccountId:from?.id??null,toAccountId:to?.id??null,amount,occurredAt:at,title,counterpartyText:'합성 검증 거래처',memo:'소유자 운영 데이터 아님',excluded:false,...extra});
  const expense=await tx('EXPENSE',a,null,12000,'합성 소비',{categoryId:expenseCategory.id});
  const income=await tx('INCOME',null,b,80000,'합성 수입',{categoryId:incomeCategory.id});
  const transfer=await tx('TRANSFER',b,a,30000,'합성 이체');
  const savings=await tx('TRANSFER',a,s,5000,'합성 저축');
  const withdrawal=await tx('TRANSFER',s,a,1000,'합성 저축 회수');
  const refund=await tx('REFUND',null,a,2000,'합성 환불',{refundOf:expense.id});
  const loan=await call('/loans',{name:'합성 대출',lender:'합성 기관',type:'PERSONAL',originalPrincipal:100000,remainingPrincipal:100000,paymentAccountId:a.id,status:'ACTIVE',expectedVersion:0});
  const payment=await call('/loan-payments',{loanId:loan.id,paymentAccountId:a.id,amount:1100,principal:1000,interest:90,fee:10,occurredAt:at,note:'합성 상환',expectedLoanVersion:loan.version});
  const receipt=await tx('INCOME',null,b,500,'합성 대출 수령');
  const receiptRow=await call('/account-ledger/rows/'+receipt.id),currentLoan=(await call('/loans')).find(l=>l.id===loan.id);
  const receiptDraft={fingerprint:receiptRow.fingerprint,edit:{requestId:randomUUID(),expectedVersion:receiptRow.version,action:'TYPE',type:'LOAN_RECEIPT',loanId:loan.id,loanVersion:currentLoan.version,reason:'독립 합성 대출 수령 검증'}};
  const receiptPreview=await call('/account-ledger/rows/'+receipt.id+'/preview',receiptDraft);
  if(receiptPreview.status!=='APPLIED')throw Error('SYNTHETIC_RECEIPT_PREVIEW_FAILED');
  const receiptOutcome=await call('/account-ledger/rows/'+receipt.id+'/execute',{...receiptDraft,previewToken:receiptPreview.previewToken});
  if(receiptOutcome.status!=='APPLIED')throw Error('SYNTHETIC_RECEIPT_EXECUTE_FAILED');
  const unresolved=await tx('EXPENSE',a,null,333,'합성 의미 미확정');
  for(let i=0;i<53;i++)await tx('EXPENSE',a,null,10+i,'합성 페이지 '+String(i).padStart(2,'0'));
  const raw=await call('/notifications',{postedAt:at,text:'합성 미처리 증거',title:'합성 알림',deviceId:run});
  const sql=path.join(dir,'fixture.sql');await fs.writeFile(sql,`UPDATE money_transactions SET meaning_state='UNRESOLVED' WHERE user_id='${owner}' AND id='${unresolved.id}'; UPDATE money_raw_notifications SET state='REVIEW_REQUIRED',processing_reason='SYNTHETIC_REVIEW' WHERE user_id='${owner}' AND id='${raw.notification.id}';`);
  await start('fixture-state',pg+'/psql.exe',['-h','127.0.0.1','-p',String(ports.pg),'-U',username,'-d','postgres','-v','ON_ERROR_STOP=1','-f',sql]).wait(30000);
  report.fixture={accounts:accounts.map(x=>({id:x.id,name:x.displayName})),expense:expense.id,income:income.id,transfer:transfer.id,savings:savings.id,withdrawal:withdrawal.id,refund:refund.id,loan:loan.id,payment:payment.id,receipt:receipt.id,unresolved:unresolved.id,raw:raw.notification.id,expenseCategory:expenseCategory.id,incomeCategory:incomeCategory.id};
  const snapshot=async name=>{const file=path.join(dir,name+'.sql');await fs.writeFile(file,`SELECT json_build_object('canonicalCount',(SELECT count(*) FROM money_transactions WHERE user_id='${owner}' AND NOT excluded AND merged_into IS NULL),'transferCount',(SELECT count(*) FROM money_transactions WHERE user_id='${owner}' AND type='TRANSFER' AND NOT excluded AND merged_into IS NULL),'rawCount',(SELECT count(*) FROM money_raw_notifications WHERE user_id='${owner}'),'rawDigest',(SELECT md5(coalesce(string_agg(raw_payload::text,'' ORDER BY id),'')) FROM money_raw_notifications WHERE user_id='${owner}'),'sourceCount',(SELECT count(*) FROM money_transaction_sources WHERE user_id='${owner}'),'loanDebt',(SELECT remaining_principal FROM money_loans WHERE user_id='${owner}' AND id='${loan.id}'));`);const task=start(name,pg+'/psql.exe',['-h','127.0.0.1','-p',String(ports.pg),'-U',username,'-d','postgres','-v','ON_ERROR_STOP=1','-At','-f',file]);await task.wait(30000);return JSON.parse(task.output.trim());};
  report.integrityBefore=await snapshot('integrity-before');
  await start('web-build',process.execPath,['node_modules/next/dist/bin/next','build'],path.join(root,'frontend')).wait(600000);
  const web=start('web',process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(ports.web)],path.join(root,'frontend'));
  await readiness(`http://127.0.0.1:${ports.web}/money/ledger`,web,120000);await save(path.join(root,'.qa/account-ledger-runtime.json'),report);console.log('ACCOUNT_LEDGER_READY '+dir);
  const deadline=Date.now()+90*60000;
  while(Date.now()<deadline){api.check();web.check();try{await fs.access(path.join(dir,'stop'));break;}catch{}await new Promise(r=>setTimeout(r,500));}
  report.integrityAfter=await snapshot('integrity-after');
  for(const key of ['canonicalCount','transferCount','rawCount','rawDigest','sourceCount','loanDebt'])if(report.integrityBefore[key]!==report.integrityAfter[key])throw Error('SYNTHETIC_PRESERVATION_FAILED:'+key);
  report.integrity='PASS';
 }
 report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.message;console.error(e.message);process.exitCode=1;}
finally{
 const errors=[];for(const child of children.toReversed())if(child!==postgres)try{await child.stop();}catch(e){errors.push(e.message);}
 if(postgres&&!postgres.exited){const identity=(await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);if(Number(identity[0])!==postgres.child.pid||path.resolve(identity[1])!==data||Number(identity[3])!==ports.pg)throw Error('OWNED_POSTGRES_IDENTITY_MISMATCH');try{await start('postgres-stop',pg+'/pg_ctl.exe',['-D',data,'-m','fast','-w','-t','30','stop']).wait(45000);}catch(e){errors.push(e.message);}}
 if(postgres)try{await postgres.stop();}catch(e){errors.push(e.message);}for(const port of Object.values(ports))if(!await available(port))errors.push('OWNED_PORT_NOT_RELEASED:'+port);
 if(!errors.length&&path.dirname(data)===dir&&path.dirname(dir)===path.join(root,'.qa/runs')){await fs.rm(data,{recursive:true,force:true});report.databaseFilesRemoved=true;}
 report.cleanup=errors.length?errors:'PASS';await save(path.join(dir,'result.json'),report);console.log(JSON.stringify(report));
}
