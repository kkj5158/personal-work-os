import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import {loadEnvironment} from '../qa/runtime/environment.mjs';
const {values}=await loadEnvironment(process.cwd());const schema='sleep_web_qa_'+randomUUID().replaceAll('-','');
await fs.writeFile('.qa/sleep-web-v1/runtime.json',JSON.stringify({pid:process.pid,schema,backend:'http://127.0.0.1:8462',frontend:'http://localhost:13027'}));
const log=await fs.open('.qa/sleep-web-v1/runtime-backend.log','w');
const child=spawn('cmd.exe',['/d','/c','gradlew.bat -I ../scripts/sleep-web-runtime.gradle sleepWebDev --console=plain'],{cwd:'backend',env:{...process.env,...values,SLEEP_WEB_QA_SCHEMA:schema,JAVA_HOME:'C:/Program Files/Eclipse Adoptium/jdk-21.0.12.8-hotspot'},stdio:['ignore',log.fd,log.fd]});
let frontend,webLog,stopping=false;
const stop=async()=>{if(stopping)return;stopping=true;for(const c of [frontend,child])if(c&&c.exitCode===null)await new Promise(resolve=>{const kill=spawn('taskkill.exe',['/PID',String(c.pid),'/T','/F'],{stdio:'ignore'});kill.on('exit',resolve);});await log.close();await webLog?.close();console.log('Owned runtime stopped. Schema retained for evidence/explicit cleanup:',schema);process.exit(0);};
createInterface({input:process.stdin}).on('line',line=>{if(line.trim()==='stop')void stop();});process.on('SIGINT',stop);process.on('SIGTERM',stop);
child.on('exit',code=>{if(!stopping){console.log('Backend exited:',code);void stop();}});
for(let i=0;i<180&&!stopping;i++){try{const r=await fetch('http://127.0.0.1:8462/api/sleep/v1/today');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,1000));if(i===179)throw Error('Backend readiness timeout');}
if(!stopping){webLog=await fs.open('.qa/sleep-web-v1/runtime-frontend.log','w');frontend=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','13027'],{cwd:'frontend',env:{...process.env,NEXT_PUBLIC_API_BASE_URL:'http://127.0.0.1:8462',NEXT_PUBLIC_APP_ENV:'dev'},stdio:['ignore',webLog.fd,webLog.fd]});for(let i=0;i<60;i++){try{if((await fetch('http://localhost:13027/life/sleep')).ok)break;}catch{}if(i===59)throw Error('Frontend readiness timeout');await new Promise(r=>setTimeout(r,1000));}console.log('Owned Sleep Web QA ready:',schema,'http://localhost:13027 — type stop for cleanup');}
