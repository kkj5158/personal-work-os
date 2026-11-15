import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const project='2b52b232-38b2-44b6-b97e-4caba54f90bc';
export function target(name){
 if(name==='dev')return {environment:'9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c',service:'eba7d263-7dc3-448a-a6b8-c2994721b597',branch:'dev'};
 if(name==='prod')return {environment:'c2c20488-311f-4b9e-9ec9-d79508123176',service:'e46b58f4-e829-430f-a4c4-b27e24d46f19',branch:'prod'};
 throw Error('Use the exact dev or prod API target');
}
export function patchFor(name){const t=target(name);return {services:{[t.service]:{source:{repo:'kkj5158/personal-work-os',branch:t.branch,commitSha:null}}}};}
const mutation='mutation ConfigurePosApi($environmentId: String!, $patch: EnvironmentConfig!, $message: String!) { environmentPatchCommit(environmentId:$environmentId,patch:$patch,commitMessage:$message) }';
async function main(){
 const [name,...flags]=process.argv.slice(2);const t=target(name);
 if(flags.some(f=>f!=='--apply'))throw Error('Unsupported option');
 const repo=execFileSync('git',['remote','get-url','origin'],{encoding:'utf8'}).trim();
 if(!/^https:\/\/github.com\/kkj5158\/personal-work-os(?:\.git)?$/.test(repo)&&repo!=='git@github.com:kkj5158/personal-work-os.git')throw Error('Repository fence');
 if(!flags.includes('--apply')){console.log(JSON.stringify({project,...t,patch:patchFor(name),mode:'PLAN_ONLY'},null,2));return;}
 const common=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{encoding:'utf8'}).trim();
 const lock=path.join(common,'pos-central-qa.lock');let owned=false;const runId=randomUUID();
 try{
  try{const handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({runId,pid:process.pid,worktree:process.cwd(),system:'pos-api-auto-config',startedAt:new Date().toISOString()}));await handle.close();owned=true;}
  catch(e){if(e.code!=='EEXIST')throw e;const current=JSON.parse(await fs.readFile(lock,'utf8'));if(current.runId!==process.env.POS_RELEASE_LOCK_RUN_ID||path.resolve(current.worktree)!==process.cwd())throw Error('Another release owns the shared lock');process.kill(current.pid,0);}
  const env={...process.env};delete env.RAILWAY_TOKEN;delete env.RAILWAY_API_TOKEN;
  const cli=args=>execFileSync('cmd.exe',['/d','/c','npx','--yes','@railway/cli@5.71.0',...args],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const who=JSON.parse(cli(['whoami','--json']));
  if(!who.workspaces?.some(w=>w.id==='dd8b604e-b7d6-4547-93d4-b29872a6a51c'))throw Error('Approved Railway workspace unavailable');
  cli(['link','--project',project,'--environment',t.environment,'--json']);
  const config=JSON.parse(cli(['environment','config','--environment',t.environment,'--json']));
  const source=config.services?.[t.service]?.source;
  if(source?.repo!=='kkj5158/personal-work-os'||source.rootDirectory!=='/backend')throw Error('Existing API source identity changed');
  if(source.branch===t.branch&&!source.commitSha){console.log(JSON.stringify({status:'ALREADY_CONFIGURED',project,...t}));return;}
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pos-api-autodeploy-'));
  const query=path.join(temp,'operation.graphql'),variables=path.join(temp,'variables.json');
  try{
   await fs.writeFile(query,mutation);await fs.writeFile(variables,JSON.stringify({environmentId:t.environment,patch:patchFor(name),message:'Owner-authorized POS API branch auto deployment'}));
   const result=JSON.parse(cli(['api','--file',query,'--variables','@'+variables,'--compact']));
   if(!result.data?.environmentPatchCommit||result.errors)throw Error('API configuration not committed');
   console.log(JSON.stringify({status:'AUTO_DEPLOY_CONFIGURED',project,...t,workflow:result.data.environmentPatchCommit}));
  }finally{await fs.unlink(query).catch(()=>{});await fs.unlink(variables).catch(()=>{});await fs.rmdir(temp);}
 }finally{if(owned){const current=JSON.parse(await fs.readFile(lock,'utf8'));if(current.runId!==runId||current.pid!==process.pid)throw Error('Release lock changed');await fs.unlink(lock);}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('POS_API_AUTO_CONFIG_FAILED: inspect target, CLI authentication and release ownership; no secret output.');process.exitCode=1;});
