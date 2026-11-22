import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';

// Recover only this scoped worker's unacknowledged completions. Never store the bearer credential.
export function completionJournal(base,token,root=path.join(process.env.LOCALAPPDATA??os.homedir(),'TEAM_KAFKA','study-worker-private')){
 const scope=createHash('sha256').update(base+'\0'+token).digest('hex');
 const dir=path.join(root,scope);
 async function replay(api,jobId){
  const files=await fs.readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  for(const file of files.filter(x=>/^[a-f0-9]{64}\.json$/.test(x))){
   const {route,body,id}=JSON.parse(await fs.readFile(path.join(dir,file),'utf8'));
   if(jobId&&id!==jobId)continue;
   await api(route,body);await fs.unlink(path.join(dir,file)).catch(e=>{if(e.code!=='ENOENT')throw e;});
  }
 }
 async function submit(api,id,body){
  if(!/^[a-f0-9]{64}$/.test(body.callId))throw Error('INVALID_CALL_ID');
  const route='/jobs/'+id+'/result',file=path.join(dir,body.callId+'.json');
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  const tmp=file+'.'+randomUUID()+'.tmp';
  await fs.writeFile(tmp,JSON.stringify({id,route,body}),{flag:'wx',mode:0o600});
  await fs.rename(tmp,file);
  const receipt=await api(route,body);
  await fs.unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});
  return receipt;
 }
 return {replay,submit};
}

