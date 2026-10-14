import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';import path from 'node:path';
import {dir,conn,query,save} from './db.mjs';
const scope='PROD';process.env.POS_DESTINATION_DATABASE='pos_prod_final';
const qi=x=>'"'+x.replaceAll('"','""')+'"',ql=x=>"'"+x.replaceAll("'","''")+"'";
const freeze=JSON.parse(await fs.readFile(path.join(dir,'prod-write-freeze-verification.json'),'utf8'));
if(!freeze.writeStatementRejected||freeze.fresh[0].jdbcWriters!==0)throw Error('Freeze gate failed');
const c=conn(scope,'source'),keeper=spawn('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env:c.env,windowsHide:true});
let buffer='',err='';keeper.stderr.on('data',x=>err+=x);keeper.stdin.on('error',()=>{});
const done=new Promise((r,j)=>{keeper.on('close',r);keeper.on('error',j);});
const wait=new Promise((r,j)=>{keeper.stdout.on('data',x=>{buffer+=x;let l=buffer.split(/\r?\n/).find(v=>v.startsWith('{'));if(l)r(JSON.parse(l));});keeper.on('close',()=>j(Error('Snapshot closed: '+c.redact(err))));});
keeper.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT json_build_object('snapshot',pg_export_snapshot(),'at',clock_timestamp());\n");
const snapshot=await wait;
const sourceQuery=sql=>query(scope,'source',`SET timezone='UTC'; SET extra_float_digits=3; BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '${snapshot.snapshot}'; ${sql} ROLLBACK;`);
try{
const fpSql=`SELECT format('SELECT json_build_object(''schema'',%L,''table'',%L,''rows'',count(*),''sha256'',encode(extensions.digest(coalesce(string_agg(rowhash,'''' ORDER BY rowhash),''''),''sha256''),''hex'')) FROM (SELECT encode(extensions.digest(row_to_json(t)::text,''sha256''),''hex'') AS rowhash FROM %I.%I t) h;',n.nspname,c.relname,n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE c.relkind IN ('r','p') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY n.nspname,c.relname
\\gexec
`;
const fps=await Promise.allSettled([sourceQuery(fpSql),query(scope,'destination',`SET timezone='UTC'; SET extra_float_digits=3; ${fpSql}`)]);for(const r of fps)if(r.status==='rejected')throw r.reason;
const [sf,df]=fps.map(x=>x.value);const dm=new Map(df.map(x=>[x.schema+'.'+x.table,x]));
const changed=sf.filter(x=>JSON.stringify(x)!==JSON.stringify(dm.get(x.schema+'.'+x.table)));
const metadataSql=changed.map(t=>`SELECT json_build_object('schema',${ql(t.schema)},'table',${ql(t.table)},'columns',(SELECT json_agg(attname ORDER BY attnum) FROM pg_attribute WHERE attrelid=${ql(t.schema+'.'+t.table)}::regclass AND attnum>0 AND NOT attisdropped AND attgenerated=''),'pk',(SELECT json_agg(a.attname ORDER BY k.ord) FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=${ql(t.schema+'.'+t.table)}::regclass AND i.indisprimary));`).join('\n');
const metadata=await sourceQuery(metadataSql);for(const m of metadata)if(!m.pk?.length)throw Error('Changed table without primary key: '+m.schema+'.'+m.table);
const mapsSql=metadata.map(m=>`SELECT json_build_object('table',${ql(m.schema+'.'+m.table)},'key',json_build_array(${m.pk.map(qi).join(',')})::text,'hash',encode(extensions.digest(row_to_json(t)::text,'sha256'),'hex')) FROM ${qi(m.schema)}.${qi(m.table)} t;`).join('\n');
const mapResults=await Promise.allSettled([sourceQuery(mapsSql),query(scope,'destination',`SET timezone='UTC'; SET extra_float_digits=3; ${mapsSql}`)]);for(const r of mapResults)if(r.status==='rejected')throw r.reason;
const [smaps,dmaps]=mapResults.map(x=>new Map(x.value.map(r=>[r.table+'\n'+r.key,r])));
const payloadQueries=[],deletes=[];let updates=0;
for(const m of metadata){const table=m.schema+'.'+m.table;const keys=[...smaps.values()].filter(r=>r.table===table&&dmaps.get(table+'\n'+r.key)?.hash!==r.hash).map(r=>r.key);updates+=keys.length;if(keys.length)payloadQueries.push(`SELECT json_build_object('table',${ql(table)},'row',row_to_json(t)::text) FROM ${qi(m.schema)}.${qi(m.table)} t WHERE json_build_array(${m.pk.map(qi).join(',')})::text IN (${keys.map(ql).join(',')});`);for(const r of dmaps.values())if(r.table===table&&!smaps.has(table+'\n'+r.key))deletes.push({table,key:r.key});}
const rows=payloadQueries.length?await sourceQuery(payloadQueries.join('\n')):[];if(rows.length!==updates)throw Error('Delta row coverage mismatch');
const sequences=await sourceQuery(`SELECT format('SELECT json_build_object(''name'',%L,''lastValue'',last_value::text,''isCalled'',is_called) FROM %I.%I;',n.nspname||'.'||c.relname,n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname !~ '^pg_' ORDER BY n.nspname,c.relname
\\gexec
`);
await save('prod-final-source-fingerprints.json',{scope,snapshot,at:new Date().toISOString(),algorithm:'All-column row_to_json SHA256 multiset; UTC extra_float_digits=3',tables:sf});
await save('prod-row-delta-protected.json',{scope,snapshot,metadata,rows,deletes,sequences});
await save('prod-row-delta-capture.json',{at:new Date().toISOString(),scope,snapshot,changedTables:metadata.map(x=>x.schema+'.'+x.table),upsertRows:rows.length,deleteRows:deletes.length,sourceFullReexport:false,pass:true});
console.log(JSON.stringify({scope,changedTables:metadata.length,upsertRows:rows.length,deleteRows:deletes.length,sourceTables:sf.length,sourceRows:sf.reduce((n,t)=>n+Number(t.rows),0),pass:true}));
}finally{keeper.stdin.end('ROLLBACK;\n');await done;}
