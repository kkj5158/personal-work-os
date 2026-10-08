import {loadEnvironment} from '../qa/runtime/environment.mjs';
import {acquireLock} from '../qa/runtime/core.mjs';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),environment=process.argv[2],mode=process.argv[3];
assert.ok(['DEV','PROD'].includes(environment));assert.ok(['preflight','migrate','verify'].includes(mode));
const {values}=await loadEnvironment(root);let selected=values;
if(environment==='PROD'){
 const variables=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-Command','railway variable list --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment c2c20488-311f-4b9e-9ec9-d79508123176 --service e46b58f4-e829-430f-a4c4-b27e24d46f19 --json'],{encoding:'utf8',windowsHide:true}));
 assert.equal(variables.SPRING_PROFILES_ACTIVE,'prod');selected={DEV_DB_URL:variables.PROD_DB_URL,DEV_DB_USERNAME:variables.PROD_DB_USERNAME,DEV_DB_PASSWORD:variables.PROD_DB_PASSWORD};
 const ref=selected.DEV_DB_USERNAME?.replace(/^postgres\./,'');assert.ok(variables.SUPABASE_JWT_ISSUER?.includes(ref+'.supabase.co'));assert.notEqual(selected.DEV_DB_URL,values.DEV_DB_URL);
}
for(const key of ['DEV_DB_URL','DEV_DB_USERNAME','DEV_DB_PASSWORD'])assert.ok(selected[key]);
const ref=selected.DEV_DB_USERNAME.replace(/^postgres\./,'');assert.match(ref,/^[a-z0-9]{20}$/);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const release=mode==='migrate'?await acquireLock(path.join(common,'pos-central-qa.lock'),{runId:'bk-v2-migration-'+environment,pid:process.pid,worktree:root,system:'money-bookkeeping-v2',startedAt:new Date().toISOString()}):async()=>{};
try{
 const classpathFile=process.env.BK_AUDIT_CLASSPATH_FILE??'D:/DEV_SPACE/personal-work-os/.qa/money-integrated-preflight/audit-classpath.txt';
 const cp=(await fs.readFile(classpathFile,'utf8')).trim();
 const env={...process.env,BK_ENVIRONMENT:environment,BK_VERIFIED_PROJECT_REF:ref,BK_DB_URL:selected.DEV_DB_URL,BK_DB_USERNAME:selected.DEV_DB_USERNAME,BK_DB_PASSWORD:selected.DEV_DB_PASSWORD};
 const child=spawn('java',['-cp',cp,path.join(root,'qa/suites/money-bookkeeping-v2/MoneyBookkeepingMigration.java'),mode],{cwd:path.join(root,'backend'),env,windowsHide:true});
 let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{let text=chunk.toString();for(const value of Object.values(selected))text=text.replaceAll(value,'[REDACTED]');output+=text;process.stdout.write(text);});
 const code=await new Promise(resolve=>child.on('exit',resolve));const dir=path.join(root,'.qa/money-bookkeeping-v2');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,environment.toLowerCase()+'-migration-'+mode+'.log'),output);process.exitCode=code??1;
}finally{await release();}
