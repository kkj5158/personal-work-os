// Provision only the additive private statement retention key. Never rotate an existing key.
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const target=process.argv[2],apply=process.argv.includes('--apply');
const env=target==='dev'?'9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c':target==='prod'?'c2c20488-311f-4b9e-9ec9-d79508123176':null;
const service=target==='dev'?'eba7d263-7dc3-448a-a6b8-c2994721b597':'e46b58f4-e829-430f-a4c4-b27e24d46f19';
if(!env||process.argv.slice(3).some(x=>x!=='--apply'))throw Error('EXACT_TARGET_REQUIRED');
const args=['--project','2b52b232-38b2-44b6-b97e-4caba54f90bc','--environment',env,'--service',service];
const cli=(a,input)=>execFileSync('cmd.exe',['/d','/c','npx','--yes','@railway/cli@5.71.0',...a],{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']});
try{
 const existing=JSON.parse(cli(['variable','list',...args,'--json']));
 if(existing.MONEY_RECON_SOURCE_KEY){if(Buffer.from(existing.MONEY_RECON_SOURCE_KEY,'base64').length!==32)throw Error('EXISTING_KEY_INVALID_DO_NOT_ROTATE');console.log(JSON.stringify({target,status:'EXISTING_KEY_PRESERVED'}));}
 else if(!apply)console.log(JSON.stringify({target,status:'NEW_PRIVATE_RETENTION_KEY_REQUIRED',redeploy:false}));
 else{cli(['variable','set','MONEY_RECON_SOURCE_KEY','--stdin','--skip-deploys',...args],randomBytes(32).toString('base64'));const read=JSON.parse(cli(['variable','list',...args,'--json']));if(Buffer.from(read.MONEY_RECON_SOURCE_KEY??'','base64').length!==32)throw Error('KEY_READBACK_FAILED');console.log(JSON.stringify({target,status:'PRIVATE_RETENTION_KEY_PROVISIONED',metadataReadback:'PASS',redeploy:false}));}
}catch{console.error('PRIVATE_RETENTION_PROVISION_FAILED_NO_SECRET_OUTPUT');process.exitCode=1;}
