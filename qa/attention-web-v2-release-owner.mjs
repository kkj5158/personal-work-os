import path from 'node:path';
import fs from 'node:fs/promises';
import readline from 'node:readline';
import {randomUUID} from 'node:crypto';
import {acquireLock,git,save} from './runtime/core.mjs';
const root=await fs.realpath(process.cwd());
const common=await fs.realpath(path.resolve(root,git(root,'rev-parse','--git-common-dir')));
if(common.toLowerCase()!=='d:\\dev_space\\personal-work-os\\.git')throw Error('RELEASE_REPOSITORY_IDENTITY_MISMATCH');
const runId='attention-web-v2-release-'+randomUUID(),owner={runId,pid:process.pid,worktree:root,revision:git(root,'rev-parse','HEAD'),system:'WORK_QUEUE_WEB_V2_DEV_PROD_RELEASE',startedAt:new Date().toISOString()};
const release=await acquireLock(path.join(common,'pos-central-qa.lock'),owner);
const evidence='D:/Planning_SPACE/WORK_QUEUE_PLANNING_20261004/09_IMPLEMENTATION/WEB_V2_20261013';
await save(path.join(evidence,'RELEASE_OWNER.json'),owner);
console.log('WORK_QUEUE_WEB_V2_RELEASE_OWNERSHIP_ACQUIRED '+JSON.stringify(owner));
const input=readline.createInterface({input:process.stdin});
try{await new Promise(resolve=>{input.on('line',line=>{if(line.trim()==='stop'){input.close();resolve();}});input.on('close',resolve);});}
finally{await release();await save(path.join(evidence,'RELEASE_OWNER_CLEANUP.json'),{...owner,releasedAt:new Date().toISOString(),status:'PASS'});console.log('WORK_QUEUE_WEB_V2_RELEASE_OWNERSHIP_RELEASED');}
