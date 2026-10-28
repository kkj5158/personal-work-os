// Managed local runtime: disposable PostgreSQL; real DEV GoTrue; workflow-owned DEV bucket.
// No shared business database is connected, and no credential or signed URL is written to logs.
import fs from 'node:fs/promises';import path from 'node:path';import readline from 'node:readline';import {execFileSync} from 'node:child_process';
import {available,ownedProcess,readiness,save,git} from './runtime/core.mjs';
const root=process.cwd(),dir=path.join(root,'.qa/shared-desk/runtime'),pg='C:/Program Files/PostgreSQL/18/bin',data=path.join(dir,'postgres');
const cli='C:/Users/kimji/AppData/Local/npm-cache/_npx/79fa66f96c8fdacf/node_modules/@railway/cli/bin/railway.exe';
const {fixtures}=await import('./shared-desk/auth-fixtures.mjs');const fixture=fixtures();
const project='2b52b232-38b2-44b6-b97e-4caba54f90bc',environment='9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c';
const vars=JSON.parse(execFileSync(cli,['variable','list','--project',project,'--environment',environment,'--service','eba7d263-7dc3-448a-a6b8-c2994721b597','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
const ports={pg:55488,api:8187,web:3187};for(const p of Object.values(ports))if(!await available(p))throw Error('Owned runtime port occupied: '+p);
await fs.mkdir(data,{recursive:true});
const secrets=[...Object.entries(vars).filter(([k])=>/PASSWORD|SECRET|KEY_ID|API_KEY|TOKEN/.test(k)).map(([,v])=>v),...fixture.accounts.map(x=>x.password)];
const env={...process.env,JAVA_HOME:'C:/Program Files/Java/jdk-21',DEV_DB_URL:`jdbc:postgresql://127.0.0.1:${ports.pg}/postgres`,DEV_DB_USERNAME:'desk_runtime',DEV_DB_PASSWORD:'',APP_DEV_USER_ID:fixture.accounts[0].id,DEV_SUPABASE_URL:fixture.url.replace(/\/auth\/v1$/,''),WORKFLOW_DEV_TOKEN_SHA256:'',APP_CORS_ALLOWED_ORIGINS:`http://127.0.0.1:${ports.web}`,SHARED_DESK_ENABLED:'true',SHARED_DESK_STORAGE_ENABLED:'true',SHARED_DESK_STORAGE_ENVIRONMENT:'DEV',NEXT_PUBLIC_API_BASE_URL:`http://127.0.0.1:${ports.api}`,NEXT_PUBLIC_APP_ENV:'hosted-dev',NEXT_PUBLIC_SUPABASE_URL:fixture.url.replace(/\/auth\/v1$/,''),NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixture.key};
for(const [k,v]of Object.entries(vars))if(k.startsWith('SHARED_DESK_STORAGE_')&&!['SHARED_DESK_STORAGE_ENABLED','SHARED_DESK_STORAGE_ENVIRONMENT'].includes(k))env[k]=v;
const children=[];let postgres;
function start(name,command,args,cwd=root){const task=ownedProcess(command,args,{cwd,env,name,logFile:path.join(dir,name+'.log'),secrets});children.push(task);return task;}
try{
 if(!await fs.stat(path.join(data,'PG_VERSION')).then(()=>true,()=>false))await start('initdb',path.join(pg,'initdb.exe'),['-D',data,'-U','desk_runtime','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale','--no-sync']).wait(120000);
 postgres=start('postgres',path.join(pg,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(ports.pg),'-c','max_connections=12']);
 for(let i=0;i<120&&!postgres.output.includes('ready to accept connections');i++){postgres.check();await new Promise(r=>setTimeout(r,250));}
 const boot=path.join(dir,'bootstrap.sql');await fs.writeFile(boot,`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key);${fixture.accounts.map(x=>`INSERT INTO auth.users VALUES('${x.id}');`).join('')}`);
 // First run only. A retained runtime directory is evidence; do not reset or overwrite it.
 const marker=path.join(dir,'bootstrapped');if(!await fs.stat(marker).then(()=>true,()=>false)){await start('bootstrap',path.join(pg,'psql.exe'),['-h','127.0.0.1','-p',String(ports.pg),'-U','desk_runtime','-d','postgres','-v','ON_ERROR_STOP=1','-f',boot]).wait(30000);await fs.writeFile(marker,'synthetic local fixture only');}
 await start('build','cmd.exe',['/d','/c','gradlew.bat','bootJar','--console=plain','--max-workers=2'],path.join(root,'backend')).wait(600000);
 const api=start('backend','C:/Program Files/Java/jdk-21/bin/java.exe',['-jar',path.join(root,'backend/build/libs/backend-0.0.1-SNAPSHOT.jar'),'--spring.profiles.active=hosted-dev','--server.address=127.0.0.1',`--server.port=${ports.api}`,'--spring.datasource.hikari.maximum-pool-size=2','--spring.datasource.hikari.minimum-idle=0','--app.money.processing-enabled=false','--app.money.classification-enabled=false','--app.absence-backfill-cron=-']);
 await readiness(`http://127.0.0.1:${ports.api}/actuator/health`,api,180000);
 const web=start('web','node',[path.join(root,'frontend/node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(ports.web)],path.join(root,'frontend'));
 await readiness(`http://127.0.0.1:${ports.web}/login`,web,180000);
 await save(path.join(dir,'runtime.json'),{ports,revision:git(root,'rev-parse','HEAD'),dirtySource:true,auth:'real DEV GoTrue, disposable users',businessDatabase:'isolated local fixture only',storage:'workflow-owned Railway DEV bucket',processes:children.map(t=>({name:t.name,pid:t.child.pid})),status:'READY'});console.log('SHARED_DESK_RUNTIME_READY http://127.0.0.1:3187');
 const input=readline.createInterface({input:process.stdin});await new Promise(resolve=>{input.on('line',line=>{if(line==='stop'){input.close();resolve();}});input.on('close',resolve);});
}catch(e){console.error('Owned runtime failed: '+secrets.reduce((s,x)=>s.replaceAll(x,'[REDACTED]'),String(e.message)));process.exitCode=1;}
finally{for(const t of children.toReversed())if(t!==postgres)try{await t.stop();}catch{}if(postgres&&!postgres.exited){await start('postgres-stop',path.join(pg,'pg_ctl.exe'),['-D',data,'-m','fast','-w','stop']).wait(45000);}await save(path.join(dir,'cleanup.json'),{portsReleased:await Promise.all(Object.values(ports).map(available)),sharedDatabaseTouched:false});}
