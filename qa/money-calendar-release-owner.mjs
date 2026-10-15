// Hold the existing cross-worktree critical-section lock with a live, owned PID.
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {acquireLock, git} from './runtime/core.mjs';
const root=process.cwd(),common=path.resolve(root,git(root,'rev-parse','--git-common-dir'));
const owner={runId:'calendar-release-'+randomUUID(),pid:process.pid,worktree:root,revision:git(root,'rev-parse','HEAD'),system:'money-calendar-web-v1-release',startedAt:new Date().toISOString()};
const release=await acquireLock(path.join(common,'pos-central-qa.lock'),owner);
console.log(JSON.stringify({status:'RELEASE_LOCK_HELD',...owner}));
try {
 await new Promise(resolve=>{
  process.stdin.setEncoding('utf8');process.stdin.resume();
  process.stdin.on('data',value=>{if(value.trim()==='release')resolve();});
  process.once('SIGINT',resolve);process.once('SIGTERM',resolve);
 });
}finally{await release();console.log('CALENDAR_RELEASE_LOCK_RETURNED');process.stdin.pause();}
