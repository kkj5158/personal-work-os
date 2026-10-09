// Authorized remediation only: reuse the existing provider credential without changing its permissions.
// Secrets travel through stdin and are never written to disk, command arguments or evidence.
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {acquireLock} from '../qa/runtime/core.mjs';
const root=path.resolve(import.meta.dirname,'..'),environment=process.argv[2];assert.ok(['DEV','PROD'].includes(environment));
const railway=(args,options)=>execFileSync(process.execPath,[path.join(process.env.APPDATA,'npm/node_modules/@railway/cli/bin/railway.js'),...args],options);
const project='2b52b232-38b2-44b6-b97e-4caba54f90bc';
const env=environment==='DEV'?'9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c':'c2c20488-311f-4b9e-9ec9-d79508123176';
const service=environment==='DEV'?'eba7d263-7dc3-448a-a6b8-c2994721b597':'e46b58f4-e829-430f-a4c4-b27e24d46f19';
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const unlock=await acquireLock(path.join(common,'pos-central-qa.lock'),{runId:'money-remediation-config-'+environment,pid:process.pid,worktree:root,startedAt:new Date().toISOString()});
try{
 const source=JSON.parse(railway(['variable','list','-p',project,'-e','c2c20488-311f-4b9e-9ec9-d79508123176','-s','e46b58f4-e829-430f-a4c4-b27e24d46f19','--json'],{encoding:'utf8',windowsHide:true}));
 assert.equal(source.SPRING_PROFILES_ACTIVE,'prod');assert.ok(source.OPENAI_API_KEY,'Existing credential unavailable');
 const current=JSON.parse(railway(['variable','list','-p',project,'-e',env,'-s',service,'--json'],{encoding:'utf8',windowsHide:true}));
 assert.equal(current.SPRING_PROFILES_ACTIVE,environment==='DEV'?'hosted-dev':'prod');
 const changes=[];
 if(environment==='DEV'&&!current.MONEY_AI_API_KEY&&!current.OPENAI_API_KEY){
  railway(['variable','set','-p',project,'-e',env,'-s',service,'--stdin','--skip-deploys','MONEY_AI_API_KEY'],{input:source.OPENAI_API_KEY,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']});changes.push('MONEY_AI_API_KEY=SET_EXISTING_CREDENTIAL');
 }
 if(current.MONEY_AI_CLASSIFICATION_PROVIDER_ENABLED!=='true'){
  railway(['variable','set','-p',project,'-e',env,'-s',service,'--skip-deploys','MONEY_AI_CLASSIFICATION_PROVIDER_ENABLED=true'],{encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']});changes.push('MONEY_AI_CLASSIFICATION_PROVIDER_ENABLED=true');
 }
 const receipt={environment,environmentId:env,serviceId:service,changes,deploy:'SKIPPED_UNTIL_VALIDATED_SOURCE_PUSH',credentialCreated:false,credentialPermissionsChanged:false,at:new Date().toISOString()};await fs.mkdir(path.join(root,'.qa/money-remediation'),{recursive:true});await fs.writeFile(path.join(root,'.qa/money-remediation',environment.toLowerCase()+'-provider-config.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}catch(error){console.error('Provider configuration did not complete. Reconcile variable presence with the read-only diagnostic before retrying.');process.exitCode=1;}finally{await unlock();}
