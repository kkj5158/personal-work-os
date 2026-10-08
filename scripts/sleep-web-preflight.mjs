import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {loadEnvironment} from 'file:///D:/DEV_SPACE/personal-work-os/qa/runtime/environment.mjs';
import {targets,sql} from 'file:///D:/DEV_SPACE/personal-work-os/.qa/prod-dev-refresh-20261002/common.mjs';
Object.assign(process.env,(await loadEnvironment('D:/DEV_SPACE/personal-work-os')).values);
const ts=await targets(), report={at:new Date().toISOString(),environments:{},reservations:[]};
for(const label of ['DEV','PROD']){
 const t=ts[label]; const history=JSON.parse(await sql(t,"select json_agg(h order by installed_rank) from (select installed_rank,version,script,checksum,success from public.flyway_schema_history) h"));
 const data={}; for(const name of ['sleep_settings','sleep_cycles','sleep_sessions','sleep_events','sleep_receipts','sleep_pending','sleep_context_revisions','sleep_tombstones']) data[name]=JSON.parse(await sql(t,`select json_build_object('count',count(*),'digest',md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' order by row_to_json(t)::text),''))) from public.${name} t`));
 report.environments[label]={identity:t.identity,history,data};
}
const trees=execFileSync('git',['worktree','list','--porcelain'],{encoding:'utf8'}).split(/\r?\n/).filter(x=>x.startsWith('worktree ')).map(x=>x.slice(9));
for(const tree of trees){try{const files=await fs.readdir(tree+'/backend/src/main/resources/db/migration');report.reservations.push({tree,versions:files.filter(x=>/^V(7[8-9]|[89]\d|\d{3})__/.test(x))});}catch{}}
await fs.mkdir('.qa/sleep-web-v1',{recursive:true});await fs.writeFile('.qa/sleep-web-v1/before.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({environments:Object.fromEntries(Object.entries(report.environments).map(([k,v])=>[k,{head:v.history.at(-1),v76:v.history.find(x=>x.version==='76'),data:v.data}])),reservations:report.reservations.filter(x=>x.versions.length)},null,2));
