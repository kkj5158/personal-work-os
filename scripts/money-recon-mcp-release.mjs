// Fixed existing MCP service source pin update. Preserve OAuth vault, volumes and settings.
import {execFileSync} from 'node:child_process';
import {readFile,mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const [target,sha,runId]=process.argv.slice(2);
if(!['dev','prod'].includes(target)||! /^[a-f0-9]{40}$/.test(sha??'')||!runId?.startsWith('money-recon-release-'))throw Error('FIXED_RELEASE_TARGET_REQUIRED');
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
const common=git('rev-parse','--path-format=absolute','--git-common-dir');
const lock=JSON.parse(await readFile(path.join(common,'pos-central-qa.lock'),'utf8'));
if(lock.runId!==runId||path.resolve(lock.worktree)!==process.cwd())throw Error('RELEASE_LOCK_REQUIRED');process.kill(lock.pid,0);
if(git('rev-parse','origin/'+target)!==sha)throw Error('REMOTE_BRANCH_SHA_MISMATCH');
const environment=target==='dev'?'9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c':'c2c20488-311f-4b9e-9ec9-d79508123176';
const service=target==='dev'?'43a27932-e8c1-497f-acb6-5072652b6984':'5c3b6558-f1fa-4836-bab0-123af47823b8';
const cli=a=>execFileSync('cmd.exe',['/d','/c','npx','--yes','@railway/cli@5.71.0',...a],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
let temp;
try{
 cli(['link','--project','2b52b232-38b2-44b6-b97e-4caba54f90bc','--environment',environment,'--json']);
 const config=JSON.parse(cli(['environment','config','--environment',environment,'--json']));const source=config.services?.[service]?.source;
 if(source?.repo!=='kkj5158/personal-work-os'||source.branch!==target||source.rootDirectory!=='/integrations/orbit-mcp')throw Error('MCP_SOURCE_IDENTITY_MISMATCH');
 if(source.commitSha===sha){console.log(JSON.stringify({target,status:'ALREADY_PINNED',sha}));process.exit(0);}
 temp=await mkdtemp(path.join(os.tmpdir(),'money-recon-mcp-'));
 const query=path.join(temp,'operation.graphql'),variables=path.join(temp,'variables.json');
 await writeFile(query,'mutation ReconciliationMcp($environmentId:String!,$patch:EnvironmentConfig!,$message:String!){environmentPatchCommit(environmentId:$environmentId,patch:$patch,commitMessage:$message)}');
 await writeFile(variables,JSON.stringify({environmentId:environment,patch:{services:{[service]:{source:{commitSha:sha}}}},message:'Owner-authorized statement reconciliation '+target+' MCP '+sha}));
 const result=JSON.parse(cli(['api','--file',query,'--variables','@'+variables,'--compact']));if(result.errors||!result.data?.environmentPatchCommit)throw Error('MCP_SOURCE_UPDATE_FAILED');
 console.log(JSON.stringify({target,status:'MCP_SOURCE_PIN_COMMITTED',sha,workflow:result.data.environmentPatchCommit}));
}catch{console.error('MCP_SOURCE_RELEASE_FAILED_NO_SECRET_OUTPUT');process.exitCode=1;}
finally{if(temp){await unlink(path.join(temp,'operation.graphql'));await unlink(path.join(temp,'variables.json'));await rmdir(temp);}}
