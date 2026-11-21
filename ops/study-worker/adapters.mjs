import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {generationSchemaFor,coachSchema,prompt,stripNulls,normalizeGenerationOutput,versionFor,isQualityJob,reviewSchema,reviewPrompt,REVIEW_VERSION} from './schema.mjs';
const exec=promisify(execFile), MAX=1500000;
export async function capabilities(){let codex=false,chatgpt=false;try{await exec('codex',['--version'],{windowsHide:true,timeout:15000});const r=await exec('codex',['login','status'],{windowsHide:true,timeout:15000});chatgpt=/ChatGPT/i.test(r.stdout+r.stderr);codex=true;}catch{}return {codexInstalled:codex,chatgptAuthenticated:chatgpt,paid:'disabled',inboundPort:false};}
export class PaidAdapter {async generate(){throw Error('PAID_PROVIDER_DISABLED_REQUIRES_SEPARATE_OWNER_AUTHORIZATION_KEY_AND_BUDGET');}}
export class CodexAdapter {
 async generate(job){
  if(!(await capabilities()).chatgptAuthenticated)throw Error('CODEX_CHATGPT_AUTH_REQUIRED_NO_API_KEY_FALLBACK');
  const raw=await this.run(job.kind==='COACH'?coachSchema:generationSchemaFor(job),prompt(job));
  const result=job.kind==='COACH'?stripNulls(raw):normalizeGenerationOutput(raw);
  const model='codex-cli-authenticated-default';
  result.provenance={provider:'codex_cli',model,promptVersion:versionFor(job)};
  if(isQualityJob(job)){
   const review=await this.run(reviewSchema,reviewPrompt(job,result));
   result.independentReview={version:REVIEW_VERSION,model,verdicts:review.verdicts};
  }
  return result;
 }
 async run(outputSchema,instructions){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'study-worker-')), schema=path.join(dir,'schema.json'),output=path.join(dir,'result.json');
  await fs.writeFile(schema,JSON.stringify(outputSchema));
  try{
   await new Promise((resolve,reject)=>{
    const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|CODEX_HOME)$/i.test(k)));
    const child=spawn('codex',['exec','--ephemeral','--ignore-user-config','--sandbox','read-only','--skip-git-repo-check','--cd',dir,'--output-schema',schema,'--output-last-message',output,'--json','-'],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let bytes=0,usedTool=false,pending='';const timeout=setTimeout(()=>child.kill(),480000);
    child.stdout.on('data',chunk=>{bytes+=chunk.length;pending+=chunk.toString();let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);try{const event=JSON.parse(line);if(/command_execution|mcp_tool_call|web_search|file_change/.test(JSON.stringify(event.item?.type??'')))usedTool=true;}catch{}}if(bytes>MAX*2)child.kill();});
    // Raw Codex diagnostics can contain source text; never print/store them as operational logs.
    child.stderr.on('data',()=>{});child.on('error',e=>{clearTimeout(timeout);reject(Error('CODEX_START_FAILED'));});
    child.on('exit',code=>{clearTimeout(timeout);code===0&&!usedTool&&bytes<=MAX*2?resolve():reject(Error(usedTool?'UNEXPECTED_MODEL_TOOL_USE_REJECTED':'CODEX_GENERATION_FAILED_OR_TIMED_OUT'));});child.stdin.end(instructions);
   });
   const stat=await fs.stat(output);if(stat.size>MAX)throw Error('MODEL_OUTPUT_LIMIT');return JSON.parse(await fs.readFile(output,'utf8'));
  }finally{
   // Exact files created here only; do not recursively delete arbitrary paths or prior database folders.
   for(const file of [output,schema])await fs.unlink(file).catch(()=>{});await fs.rmdir(dir).catch(()=>{});
  }
 }
}
export class OllamaAdapter {
 constructor(model){if(!/^[a-zA-Z0-9_.:-]{1,100}$/.test(model??''))throw Error('OLLAMA_MODEL_REQUIRED');this.model=model;}
 async generate(job){const r=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',signal:AbortSignal.timeout(480000),headers:{'Content-Type':'application/json'},body:JSON.stringify({model:this.model,stream:false,format:job.kind==='COACH'?coachSchema:generationSchemaFor(job),messages:[{role:'user',content:prompt(job)}],options:{num_ctx:16384,num_predict:12000,temperature:0.2}})});if(!r.ok)throw Error('OLLAMA_UNAVAILABLE');const text=await r.text();if(text.length>MAX)throw Error('MODEL_OUTPUT_LIMIT');const raw=JSON.parse(JSON.parse(text).message.content);const result=job.kind==='COACH'?stripNulls(raw):normalizeGenerationOutput(raw);result.provenance={provider:'ollama',model:this.model,promptVersion:versionFor(job)};return result;}
}
