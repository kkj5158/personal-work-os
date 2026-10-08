// Only schemas registered by sleep-web-dev.mjs. Never public or an unrelated QA run.
import fs from 'node:fs/promises';
import net from 'node:net';
import assert from 'node:assert/strict';
import {loadEnvironment} from '../qa/runtime/environment.mjs';
import {targets,sql} from 'file:///D:/DEV_SPACE/personal-work-os/.qa/prod-dev-refresh-20261002/common.mjs';
for(const port of [8462,13027,13620]){
 const occupied=await new Promise(resolve=>{const socket=net.connect(port,'127.0.0.1');socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));});
 assert.equal(occupied,false,`Stop the owned runtime first; port ${port} is occupied`);
}
Object.assign(process.env,(await loadEnvironment(process.cwd())).values);
const {DEV}=await targets(),root='.qa/sleep-web-v1',schemas=new Set();
for(const file of await fs.readdir(root))if(file!=="runtime-cleanup.json"&&/^runtime(?:-[a-z]+)?\.json$/.test(file)){
 const record=JSON.parse(await fs.readFile(root+'/'+file,'utf8'));
 assert.equal(record.backend,'http://127.0.0.1:8462');assert.ok(['http://localhost:13027','http://localhost:13620'].includes(record.frontend));
 assert.match(record.schema,/^sleep_web_qa_[0-9a-f]{32}$/);schemas.add(record.schema);
}
const report={at:new Date().toISOString(),target:'DEV only',removed:[],publicSchemaMutated:false};
for(const schema of schemas){
 if(await sql(DEV,`select exists(select 1 from pg_namespace where nspname='${schema}')`)!=='t')continue;
 for(const table of ['sleep_sessions','sleep_naps'])assert.equal(await sql(DEV,`select count(*) from ${schema}.${table}`),'0',`Uncleaned owned fixture in ${schema}.${table}`);
 await sql(DEV,`drop schema ${schema} cascade`,false);
 assert.equal(await sql(DEV,`select exists(select 1 from pg_namespace where nspname='${schema}')`),'f');report.removed.push(schema);
}
await fs.writeFile(root+'/runtime-cleanup.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
