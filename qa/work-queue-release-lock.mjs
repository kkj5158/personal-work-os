// One task-owned release lease; never removes an incumbent or stale lock.
import {readFile} from 'node:fs/promises';import readline from 'node:readline';
import {acquireLock,git} from './runtime/core.mjs';
import {randomUUID} from 'node:crypto';
const file='D:/DEV_Space/personal-work-os/.git/pos-central-qa.lock';
const owner={runId:'work-queue-mcp-release-'+randomUUID(),pid:process.pid,worktree:process.cwd(),revision:git(process.cwd(),'rev-parse','HEAD'),system:'WORK_QUEUE_MCP_DEV_PROD_RELEASE',startedAt:new Date().toISOString()};
let release,stop=false,last;
readline.createInterface({input:process.stdin}).on('line',async line=>{if(line.trim()==='stop'){stop=true;if(release)await release();process.exit(0);}});
for(let i=0;i<1440&&!stop;i++){
 try{release=await acquireLock(file,owner);console.log(JSON.stringify({status:'RELEASE_LOCK_ACQUIRED',...owner}));break;}
 catch(e){if(e.status!=='BLOCKED_RESOURCE')throw e;let observed;try{observed=JSON.parse(await readFile(file,'utf8'));}catch{}if(observed?.runId!==last){last=observed?.runId;console.log(JSON.stringify({status:'WAITING_FOR_EXISTING_RELEASE',owner:observed?.system,pid:observed?.pid,startedAt:observed?.startedAt}));}await new Promise(r=>setTimeout(r,2500));}
}
if(!release){console.log(JSON.stringify({status:'RELEASE_LOCK_NOT_ACQUIRED'}));process.exit(1);}
