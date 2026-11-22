import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {CodexAdapter,OllamaAdapter,PaidAdapter,capabilities} from './adapters.mjs';
export async function processOne({base,token,adapter,jobId}){
 const url=new URL(base);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('WORKER_REQUIRES_HTTPS_OR_LOOPBACK');
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error('SCOPED_WORKER_TOKEN_REQUIRED');
 if(jobId&&!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(jobId))throw Error('INVALID_TARGET_JOB');
 const api=async(route,data={})=>{const r=await fetch(new URL('/api/study-worker'+route,url),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer study_w2_'+token},body:JSON.stringify(data),signal:AbortSignal.timeout(30000),redirect:'error'});if(!r.ok)throw Error('WORKER_HTTP_'+r.status);const text=await r.text();if(text.length>1500000)throw Error('JOB_SIZE_LIMIT');return JSON.parse(text);};
 const job=await api(jobId?`/claim?jobId=${jobId}`:'/claim');if(job.state==='IDLE')return {state:'IDLE'};
 if(jobId&&job.id!==jobId)throw Error('UNEXPECTED_TARGET_JOB');
 const timer=setInterval(()=>void api(`/jobs/${job.id}/heartbeat`,{leaseToken:job.leaseToken}).catch(()=>{}),30000);
 try{const output=await adapter.generate(job);const receipt=await api(`/jobs/${job.id}/complete`,{leaseToken:job.leaseToken,output});return {id:job.id,kind:job.kind,state:receipt.state};}
 finally{clearInterval(timer);}
}
async function main(){
 if(process.argv.includes('--capabilities')){console.log(JSON.stringify(await capabilities()));return;}
 const provider=process.env.STUDY_PROVIDER??'codex';const adapter=provider==='codex'?new CodexAdapter():provider==='ollama'?new OllamaAdapter(process.env.STUDY_OLLAMA_MODEL):new PaidAdapter();
 const token=process.env.STUDY_WORKER_TOKEN??(process.env.STUDY_WORKER_TOKEN_FILE?(await fs.readFile(process.env.STUDY_WORKER_TOKEN_FILE,'utf8')).trim():'');
 const max=Math.min(14,Math.max(1,Number(process.env.STUDY_MAX_JOBS??1)));if(!Number.isInteger(max))throw Error('INVALID_JOB_BUDGET');
 for(let i=0;i<max;i++){const result=await processOne({base:process.env.STUDY_SERVER_URL??'',token,adapter,jobId:process.env.STUDY_WORKER_JOB_ID?.toLowerCase()});console.log(JSON.stringify(result));if(result.state==='IDLE')break;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('STUDY_WORKER_FAILED: check private local credentials, server, provider and job status. No automatic paid fallback.');process.exitCode=1;});
