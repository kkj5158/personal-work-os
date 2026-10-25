import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ownedProcess,available,readiness,git} from './runtime/core.mjs';
import {systemEnvironment} from './runtime/environment.mjs';
const root=process.cwd(),run='unified-'+Date.now(),dir=path.join(root,'.qa/runs',run),pg='C:/Program Files/PostgreSQL/18/bin',data=path.join(dir,'postgres');
await fs.mkdir(dir,{recursive:true});
const cp=(await fs.readFile('.qa/unified/classpath.txt','utf8')).trim(),owner=randomUUID(),port=55442,schema='qa_money_web_'+randomUUID().replaceAll('-','').slice(0,20);
if(!await available(port))throw Error('OWNED_PG_PORT_OCCUPIED');
const env={...systemEnvironment(),DEV_DB_URL:`jdbc:postgresql://127.0.0.1:${port}/postgres`,DEV_DB_USERNAME:'unified_synthetic',DEV_DB_PASSWORD:'synthetic-loopback-only',APP_DEV_USER_ID:owner};
const tasks=[],report={run,revision:git(root,'rev-parse','HEAD'),dirty:!!git(root,'status','--porcelain'),database:'OWNED_LOOPBACK_SYNTHETIC',sharedDEV:'NEVER_CONNECTED',checks:[],cleanup:'PENDING'};
function start(name,exe,args,cwd=root,childEnv=env){const p=ownedProcess(exe,args,{name,cwd,env:childEnv,logFile:path.join(dir,name+'.log')});tasks.push(p);return p;}
let server;
try{
 await start('initdb',pg+'/initdb.exe',['-D',data,'-U',env.DEV_DB_USERNAME,'--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale']).wait(60000);
 server=start('postgres',pg+'/postgres.exe',['-D',data,'-h','127.0.0.1','-p',String(port),'-c','max_connections=15']);
 for(let i=0;i<120;i++){server.check();if(server.output.includes('ready to accept connections'))break;await new Promise(r=>setTimeout(r,250));}
 const sql=path.join(dir,'bootstrap.sql');await fs.writeFile(sql,`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES ('${owner}'); CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;`);
 await start('auth-bootstrap',pg+'/psql.exe',['-h','127.0.0.1','-p',String(port),'-U',env.DEV_DB_USERNAME,'-d','postgres','-v','ON_ERROR_STOP=1','-f',sql]).wait(30000);
 await start('fixture','java',['-cp',cp,path.join(root,'qa/suites/money/WebFixture.java'),'create',schema],path.join(root,'backend')).wait(60000);
 const isolated={...env,DEV_DB_URL:env.DEV_DB_URL+'?currentSchema='+schema+',public'};
 const init=path.join(dir,'tests.init.gradle');await fs.writeFile(init,`allprojects { tasks.withType(Test).configureEach { maxParallelForks=1; reports.junitXml.outputLocation=file('${dir.replaceAll('\\','/')}/xml'); outputs.upToDateWhen { false } } }`);
 const filters=process.env.UNIFIED_TEST_FILTERS?.split(',')??['MoneyUnifiedBookkeepingPostgresTest','MoneyFinancialPostgresTest','MoneySavingsReadPostgresTest','MoneyReviewBatchPostgresTest','MoneyClassificationContextTest','VerifiedMoneyMatcherTest','MoneyControllerSecurityTest','MoneyWebPostgresTest','MoneyMeaningPostgresTest','MoneyReconciliationReadPostgresTest','MoneyReconciliationEvidenceScopeTest','MoneyRecommendationPostgresTest'];
 if(filters.some(f=>!/^\w+$/.test(f)))throw Error('TEST_FILTER_REJECTED');
 await start('backend-tests','cmd.exe',['/d','/c','gradlew.bat','test','--no-daemon','--console=plain','-I',init,...filters.flatMap(f=>['--tests','com.kafka.backend.money.'+f])],path.join(root,'backend'),isolated).wait(1200000);
 report.checks.push({name:'backend-tests',status:'PASS',filters});
 if(process.argv.includes('--runtime')){
  await start('seed','java',['-cp',cp,path.join(root,'qa/UnifiedBookkeepingSeed.java')],path.join(root,'backend'),{...isolated,UNIFIED_SEED:path.join(dir,'seed.json')}).wait(60000);
  const apiPort=18088,webPort=13008;if(!await available(apiPort)||!await available(webPort))throw Error('OWNED_APP_PORT_OCCUPIED');
  const api=start('backend','java',['-jar','backend/build/libs/backend-0.0.1-SNAPSHOT.jar','--spring.profiles.active=dev','--server.address=127.0.0.1',`--server.port=${apiPort}`,'--spring.flyway.enabled=false','--spring.jpa.hibernate.ddl-auto=none','--spring.datasource.hikari.maximum-pool-size=2','--spring.datasource.hikari.minimum-idle=0',`--app.dev-allowed-origins=http://127.0.0.1:${webPort}`,'--app.money.processing-enabled=false','--money.ai.classification-provider-enabled=false','--money.ai.bookkeeping-worker-enabled=false','--money.ai.classification-worker-enabled=false','--app.absence.backfill-enabled=false'],root,isolated);
  await readiness(`http://127.0.0.1:${apiPort}/api/money/accounts`,api,120000);
  const webEnv={...systemEnvironment(),NEXT_PUBLIC_API_BASE_URL:`http://127.0.0.1:${apiPort}`,NEXT_PUBLIC_APP_ENV:'dev',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''};
  await start('frontend-build',process.execPath,['node_modules/next/dist/bin/next','build'],path.join(root,'frontend'),webEnv).wait(600000);
  const web=start('frontend',process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(webPort)],path.join(root,'frontend'),webEnv);
  await readiness(`http://127.0.0.1:${webPort}/money/bookkeeping`,web,90000);
  await start('browser',process.execPath,['qa/money-unified-browser.mjs'],root,{...systemEnvironment(),UNIFIED_API:`http://127.0.0.1:${apiPort}`,UNIFIED_WEB:`http://127.0.0.1:${webPort}`,UNIFIED_REPORT:dir}).wait(600000);
  report.checks.push({name:'real-api-browser',status:'PASS'});
 }
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;}
finally{
 const errors=[];
 for(const p of tasks.toReversed())if(p!==server)try{await p.stop();}catch(e){errors.push(e.message);}
 if(server&&!server.exited)try{const lines=(await fs.readFile(path.join(data,'postmaster.pid'),'utf8')).split(/\r?\n/);if(Number(lines[0])!==server.child.pid||path.resolve(lines[1])!==data||path.dirname(data)!==dir)throw Error('PG_OWNERSHIP_MISMATCH');await start('postgres-stop',pg+'/pg_ctl.exe',['-D',data,'-m','fast','-w','-t','60','stop']).wait(75000);}catch(e){errors.push(e.message);}
 if(server)try{await server.stop();}catch(e){errors.push(e.message);}
 if(!await available(port))errors.push('PG_PORT_NOT_RELEASED');
 // Remove only the verified run-owned cluster after process shutdown.
 if(!errors.length&&path.dirname(data)===dir)await fs.rm(data,{recursive:true,force:true});
 report.cleanup=errors.length?errors:'PASS';await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,evidence:dir},null,2));
 if(errors.length)process.exitCode=1;
}
