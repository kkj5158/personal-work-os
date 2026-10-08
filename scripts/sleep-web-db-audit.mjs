// Read-only release checkpoints using the existing POS environment/DB procedure.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {loadEnvironment} from '../qa/runtime/environment.mjs';
import {targets,sql} from 'file:///D:/DEV_SPACE/personal-work-os/.qa/prod-dev-refresh-20261002/common.mjs';
Object.assign(process.env,(await loadEnvironment(process.cwd())).values);
const phase=process.argv[2];assert.match(phase??'',/^(release-before|after-dev|after-prod|after-smoke)$/);
const root='.qa/sleep-web-v1',report={at:new Date().toISOString(),phase,environments:{}};
const ts=await targets();
for(const label of ['DEV','PROD']){
 const target=ts[label], history=JSON.parse(await sql(target,"select json_agg(h order by installed_rank) from (select installed_rank,version,script,checksum,success from public.flyway_schema_history) h"));
 const tables={};
 for(const name of ['sleep_settings','sleep_cycles','sleep_sessions','sleep_events','sleep_receipts','sleep_pending','sleep_context_revisions','sleep_tombstones','sleep_naps','sleep_nap_events','sleep_nap_tombstones']){
  if(await sql(target,`select to_regclass('public.${name}') is not null`)!=='t')continue;
  const columns=JSON.parse(await sql(target,`select json_agg(a.attname order by k.n) from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,n) join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum where i.indrelid='public.${name}'::regclass and i.indisprimary`));
  const key=columns.map(c=>`'${c}',t.${c}`).join(',');
  tables[name]=JSON.parse(await sql(target,`select coalesce(json_agg(json_build_object('key',jsonb_build_object(${key}),'digest',md5(row_to_json(t)::text)) order by row_to_json(t)::text),'[]'::json) from public.${name} t`));
 }
 const preservation={};
 if(phase!=='release-before'){
  const before=JSON.parse(await fs.readFile(root+'/release-before.json','utf8')).environments[label];
  assert.deepEqual(history.slice(0,before.history.length),before.history,'Applied Flyway history changed');
  for(const [table,rows] of Object.entries(before.tables)){
   if(table==='sleep_context_revisions')continue; // Approved nap context invalidations advance this counter.
   const now=new Map(tables[table].map(r=>[JSON.stringify(r.key),r.digest]));
   for(const row of rows)assert.equal(now.get(JSON.stringify(row.key)),row.digest,`${label} genuine row changed: ${table}`);
   preservation[table]={originalRows:rows.length,preserved:true};
  }
 }
 report.environments[label]={identity:target.identity,history,tables,preservation};
}
await fs.writeFile(`${root}/${phase}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({phase,environments:Object.fromEntries(Object.entries(report.environments).map(([k,v])=>[k,{head:v.history.at(-1),v76:v.history.find(r=>r.version==='76'),counts:Object.fromEntries(Object.entries(v.tables).map(([t,r])=>[t,r.length])),preservation:v.preservation}]))},null,2));
