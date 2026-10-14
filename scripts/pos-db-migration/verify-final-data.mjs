import fs from 'node:fs/promises';import path from 'node:path';import {dir,query,run,save} from './db.mjs';
const [scope,database,label='final']=process.argv.slice(2);process.env.POS_DESTINATION_DATABASE=database;const prefix=scope.toLowerCase()+'-final',reportPrefix=scope.toLowerCase()+'-'+label;const source=JSON.parse(await fs.readFile(path.join(dir,prefix+'-source-fingerprints.json'),'utf8'));
const sql=`SET timezone='UTC'; SET extra_float_digits=3; BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format('SELECT json_build_object(''schema'',%L,''table'',%L,''rows'',count(*),''sha256'',encode(extensions.digest(coalesce(string_agg(rowhash,'''' ORDER BY rowhash),''''),''sha256''),''hex'')) FROM (SELECT encode(extensions.digest(row_to_json(t)::text,''sha256''),''hex'') AS rowhash FROM %I.%I t) h;',n.nspname,c.relname,n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE c.relkind IN ('r','p') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY n.nspname,c.relname
\\gexec
ROLLBACK;`;
const tables=await query(scope,'destination',sql);await save(reportPrefix+'-destination-fingerprints.json',{at:new Date().toISOString(),database,tables});const src=new Map(source.tables.map(x=>[x.schema+'.'+x.table,x])),dst=new Map(tables.map(x=>[x.schema+'.'+x.table,x]));const differences=[];for(const key of new Set([...src.keys(),...dst.keys()]))if(JSON.stringify(src.get(key))!==JSON.stringify(dst.get(key)))differences.push({table:key,source:src.get(key),destination:dst.get(key)});
let archivedSequences;
if(scope==='PROD'){
 const delta=JSON.parse(await fs.readFile(path.join(dir,'prod-row-delta-protected.json'),'utf8'));
 if(delta.snapshot.snapshot!==source.snapshot.snapshot)throw Error('Sequence snapshot mismatch');
 archivedSequences=delta.sequences.map(s=>`SELECT pg_catalog.setval('${s.name}', ${s.lastValue}, ${s.isCalled});`);
}else{
 const archive=await run(scope,'source','pg_restore',['--data-only','--no-owner','--no-acl','--schema=auth','--schema=realtime','--file=-',path.join(dir,prefix+'.dump')]);archivedSequences=archive.stdout.split(/\r?\n/).filter(x=>/^SELECT pg_catalog\.setval\(/.test(x));
}
const sequenceSql=archivedSequences.map(x=>{const m=x.match(/^SELECT pg_catalog\.setval\('([^']+)', (\d+), (true|false)\);$/);if(!m||!/^\w+\.\w+$/.test(m[1]))throw Error('Sequence expression unsupported');return `SELECT json_build_object('name','${m[1]}','pass',last_value=${m[2]} AND is_called=${m[3]}) FROM ${m[1]};`;}).join('\n');const sequences=await query(scope,'destination',sequenceSql);
const catalog=await query(scope,'destination',"SELECT json_build_object('kind','flyway','records',count(*),'failed',count(*) FILTER(WHERE NOT success),'latest',max(version::integer)) FROM public.flyway_schema_history; SELECT json_build_object('kind','invalidIndexes','count',count(*)) FROM pg_index WHERE NOT indisvalid OR NOT indisready;");
const pass=!differences.length&&sequences.every(x=>x.pass)&&catalog.every(x=>(x.failed??x.count??0)===0);const report={at:new Date().toISOString(),scope,database,pass,frozenSnapshot:source.snapshot,tables:tables.length,rows:tables.reduce((sum,x)=>sum+Number(x.rows),0),differences,sequences,catalog,algorithm:source.algorithm};await save(reportPrefix+'-data-validation.json',report);console.log(JSON.stringify(report));if(!pass)process.exitCode=1;
