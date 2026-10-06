import path from 'node:path';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {loadEnvironment,systemEnvironment} from './runtime/environment.mjs';
import {acquireLock,ownedProcess} from './runtime/core.mjs';
const action=process.argv[2];if(!['preflight','migrate','verify'].includes(action))throw Error('Explicit migration mode required');
const root=process.cwd(),git=(...args)=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(result.status)throw Error('Git check failed');return result.stdout.trim();};
const common=path.resolve(root,git('rev-parse','--git-common-dir')),runId='money-schema-'+randomUUID(),dir=path.join(root,'.qa',runId);await fs.mkdir(dir,{recursive:true});
const release=await acquireLock(path.join(common,'pos-central-qa.lock'),{runId,pid:process.pid,worktree:root,revision:git('rev-parse','HEAD'),system:'money-integrated-migration',startedAt:new Date().toISOString()});
try{
 if(action!=='verify')git('fetch','origin','dev');
 const file='V73__money_integrated_revision.sql',ownPath=path.join(root,'backend/src/main/resources/db/migration',file),ownHash=createHash('sha256').update(await fs.readFile(ownPath)).digest('hex'),inventory=[];
 for(const match of git('worktree','list','--porcelain').matchAll(/^worktree (.+)$/gm)){
  const directory=path.join(match[1],'backend/src/main/resources/db/migration'),files=await fs.readdir(directory).catch(()=>[]);for(const name of files.filter(n=>/^V(?:7[3-9]|[89]\d|\d{3,})__/.test(n))){const hash=createHash('sha256').update(await fs.readFile(path.join(directory,name))).digest('hex');inventory.push({worktree:match[1],name,hash});if(path.resolve(match[1])!==root&&name.startsWith('V73__')&&hash!==ownHash)throw Error('Unapplied V73 is occupied in another worktree; renumber only the owned migration before proceeding');}
 }
 await fs.writeFile(path.join(dir,'inventory.json'),JSON.stringify({revision:git('rev-parse','HEAD'),dev:git('rev-parse','origin/dev'),ownHash,inventory},null,2));
 const {values,facts}=await loadEnvironment(root);const classpath=(await fs.readFile(path.join(root,'.qa/money-integrated-preflight/audit-classpath.txt'),'utf8')).trim();const env={...systemEnvironment(),...values,QA_MIGRATIONS:path.join(root,'backend/src/main/resources/db/migration')};
 const child=ownedProcess('java',['-cp',classpath,path.join(root,'qa/suites/money-integrated/MoneyIntegratedMigration.java'),action],{cwd:path.join(root,'backend'),env,name:'money-'+action,logFile:path.join(dir,'migration.log'),secrets:Object.values(values)});try{await child.wait(120000);console.log('MONEY_MIGRATION_'+action.toUpperCase()+'=PASS');}finally{await child.stop();}
 await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({action,status:'PASS',revision:git('rev-parse','HEAD'),dev:git('rev-parse','origin/dev'),variables:facts,ownHash,finished:new Date().toISOString()},null,2));console.log('Evidence: '+dir);
}finally{await release();}
