// Only the task-owned loopback API; no hosted target argument is accepted.
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const [run,countArg]=process.argv.slice(2),count=Number(countArg);
if(!/^web-v31-[a-f0-9-]{36}$/.test(run)||![20,213,500].includes(count))throw Error('OWNED_FIXTURE_ARGUMENT');
const owner=JSON.parse(await fs.readFile(`.qa/runs/${run}/owner.json`,'utf8'));
process.kill(owner.pid,0);if(owner.ports.api!==13223||owner.ports.pg!==55443)throw Error('OWNERSHIP_MISMATCH');
const base='http://127.0.0.1:13223/api/workflow/attention';
const request=async(path,data)=>{const res=await fetch(base+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});if(!res.ok)throw Error('FIXTURE_HTTP_'+res.status);return res.json();};
const feed=await request('/feed');let existing=Object.values(feed.totals).reduce((a,b)=>a+b,0);
for(let i=existing;i<count;i++){
 const id=randomUUID(),item=(await request('/items',{operationId:randomUUID(),id,action:i%4===0?'GPT 응답 확인':`V31 QA ${String(i+1).padStart(3,'0')}`,projectLabel:'SYNTHETIC',source:{kind:'CHATGPT',reference:'v31-'+id,url:'https://example.com/?v31='+id,producer:'MANUAL',intent:'RESPONSE_COMPLETED',generation:id,completionPolicy:'ACK_ONLY',...(i%4?{summary:`검증용 발췌 ${i}`,summaryOrigin:'LOCAL_EXTRACTIVE'}:{})}})).item;
 if(i%3===0)await request('/items/'+id+'/group',{operationId:randomUUID(),expectedRevision:item.revision,expectedGeneration:item.source.generation,group:'COMPLETED'});
 else if(i%3===1)await request('/items/'+id+'/group',{operationId:randomUUID(),expectedRevision:item.revision,expectedGeneration:item.source.generation,group:'DEFERRED'});
}
console.log(JSON.stringify({fixture:'OWNED_LOOPBACK_ONLY',count,totals:(await request('/feed')).totals}));
