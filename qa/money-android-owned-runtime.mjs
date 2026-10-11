import path from 'node:path';
import fs from 'node:fs/promises';
import https from 'node:https';
import {randomUUID} from 'node:crypto';
import {loadEnvironment,systemEnvironment} from './runtime/environment.mjs';
import {ownedProcess,available,save,git} from './runtime/core.mjs';

// Foreground runtime, existing shared services, run-owned schema, disabled external providers.
const root=process.cwd(),android=path.resolve(process.argv[2]??'D:/DEV_SPACE/money-sys-mobile');
const id=randomUUID().replaceAll('-','').slice(0,20),schema='qa_money_web_'+id;
const dir=path.join(root,'.qa/android',id),backend=path.join(root,'backend');
await fs.mkdir(dir,{recursive:true});
const {values}=await loadEnvironment(root),env={...systemEnvironment(),...values},tasks=[];
// This owner exists only in the schema's synthetic qa_fixture_users table.
// It avoids contending with another suite's canonical development-owner lock.
env.APP_DEV_USER_ID=randomUUID();
const state={schema,syntheticOwner:env.APP_DEV_USER_ID,revision:git(root,'rev-parse','HEAD'),ownerPid:process.pid,status:'STARTING',providers:'DISABLED',url:'https://localhost:8443',createdAt:new Date().toISOString(),processes:[]};
function start(name,exe,args,cwd,environment=env){const p=ownedProcess(exe,args,{name,cwd,env:environment,logFile:path.join(dir,name+'.log'),secrets:Object.values(values),onStart:p=>state.processes.push(p)});tasks.push(p);return p;}
const java=path.join(env.JAVA_HOME,'bin/java.exe');let classpath,created=false,stop;
const hold=new Promise(resolve=>{stop=resolve;});process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('message',m=>{if(m==='stop')stop();});
const agent=new https.Agent({ca:await fs.readFile(path.join(android,'.local-dev/dev-cert.pem'))});
function request(method,p,body){return new Promise((resolve,reject)=>{const bytes=body?JSON.stringify(body):null;const r=https.request('https://localhost:8443/api/money'+p,{method,agent,headers:bytes?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bytes)}:{},timeout:20000},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300)return reject(Error('QA_API_'+res.statusCode+':'+p));try{resolve(text?JSON.parse(text):null);}catch{reject(Error('QA_API_INVALID_RESPONSE'));}});});r.on('error',reject);r.on('timeout',()=>r.destroy(Error('QA_API_TIMEOUT')));if(bytes)r.write(bytes);r.end();});}
try {
    if(!await available(8443))throw Error('QA_HTTPS_PORT_8443_OWNED_ELSEWHERE');
    const init=path.join(dir,'classpath.init.gradle');
    await fs.writeFile(init,"allprojects { afterEvaluate { p -> if(p.plugins.hasPlugin('java')) { tasks.register('androidQaClasspath') { doLast { new File(System.getenv('ANDROID_QA_CLASSPATH')).text = sourceSets.main.runtimeClasspath.asPath } } } } }");
    await start('build','cmd.exe',['/d','/c','gradlew.bat','bootJar','androidQaClasspath','--no-daemon','--max-workers=1','--console=plain','-Dorg.gradle.jvmargs=-Xmx768m','-I',init],backend,{...env,ANDROID_QA_CLASSPATH:path.join(dir,'classpath.txt')}).wait(600000);
    classpath=await fs.readFile(path.join(dir,'classpath.txt'),'utf8');
    await start('schema-create',java,['-Xmx256m','-cp',classpath,path.join(root,'qa/suites/money/WebFixture.java'),'create',schema],backend).wait(90000);created=true;
    const url=new URL(values.DEV_DB_URL.replace(/^jdbc:/,''));url.searchParams.set('currentSchema',schema+',public');
    const jars=(await fs.readdir(path.join(backend,'build/libs'))).filter(n=>n.endsWith('.jar')&&!n.endsWith('-plain.jar'));if(jars.length!==1)throw Error('QA_JAR_IDENTITY');
    const runtime=start('backend','pwsh.exe',['-NoProfile','-File',path.join(android,'scripts/Start-V2QaHttps.ps1'),'-Jar',path.join(backend,'build/libs',jars[0])],backend,{...env,DEV_DB_URL:'jdbc:'+url.href});
    let ready=false;for(let i=0;i<45;i++){try{await request('GET','/accounts');ready=true;break;}catch{await new Promise(r=>setTimeout(r,2000));}}if(!ready)throw Error('QA_HTTPS_NOT_READY');
    const names=['IBK 생활비','우리 카드결제','신한 급여'];const accounts=[];
    for(const [i,name] of names.entries())accounts.push(await request('POST','/mobile/accounts',{account:{provider:['IBK','WOORI','SHINHAN'][i],displayName:name,role:i===2?'INCOME_HUB':'SPENDING',suffix:['2222','3333','1111'][i],includeInAssets:true,includeInStatistics:true},fundGroup:'LIVING',savingsSubtype:null}));
    const accountIds=accounts.map(a=>a.account.id);
    await request('PUT','/tracking',{expense:accountIds.slice(0,2),income:[accountIds[2]],expectedVersion:0});
    const startDate=new Date();startDate.setUTCDate(1);startDate.setUTCHours(0,0,0,0);
    for(const a of accounts)await request('POST',`/accounts/${a.account.id}/balance-records`,{type:'INITIAL_BALANCE',amount:1000000,asOf:startDate.toISOString(),note:'합성 QA 잔액 근거',expectedVersion:a.account.version,expectedCalculatedBalance:0});
    const categories=[];
    for(const [name,kind,emoji] of [['식비','EXPENSE','🍽️'],['생활용품','EXPENSE','🧺'],['근로소득','INCOME','💼']])categories.push(await request('POST','/categories',{name,kind,emoji,color:'#334155',archived:false,parentId:null,sortOrder:0}));
    const at=new Date(Date.now()-3600000).toISOString(),transactions=[];
    for(let i=0;i<3;i++)transactions.push(await request('POST','/transactions',{type:'EXPENSE',fromAccountId:accountIds[0],toAccountId:null,amount:1000+i*100,occurredAt:at,counterpartyText:'합성 카페',categoryId:null,memo:'합성 점심',excluded:false,refundOf:null,expectedVersion:null,title:'합성 점심'}));
    const current=await request('GET',`/ai/classification/recommendations/current/${transactions[0].id}`);
    await request('POST','/ai/classification/recommendations/save',{requestId:randomUUID(),items:[{id:transactions[0].id,draftId:null,revision:null,categoryId:categories[0].id,expectedStamp:current.stamp,thisTransactionOnly:false,originalStamp:null,compared:false}]});
    state.fixture={accountIds,categoryIds:categories.map(c=>c.id),transactionIds:transactions.map(t=>t.id)};
    state.status='READY';await save(path.join(dir,'state.json'),state);
    console.log(JSON.stringify({status:state.status,schema,url:state.url,revision:state.revision,evidence:path.join(dir,'state.json')}));
    await Promise.race([hold,runtime.done.then(()=>{throw Error('QA_BACKEND_EXITED');})]);
}catch(e){state.status='FAILED';state.error=e.message;process.exitCode=1;}
finally {
    for(const p of tasks.toReversed())await p.stop();
    if(created){try{await start('schema-drop',java,['-Xmx256m','-cp',classpath,path.join(root,'qa/suites/money/WebFixture.java'),'drop',schema],backend).wait(90000);state.cleanup='PASS';}catch(e){state.cleanup='FAILED';state.cleanupError=e.message;process.exitCode=1;}}
    state.stoppedAt=new Date().toISOString();await save(path.join(dir,'state.json'),state);agent.destroy();
}
