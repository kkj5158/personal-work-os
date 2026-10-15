import {spawn} from 'node:child_process';import readline from 'node:readline';import path from 'node:path';import crypto from 'node:crypto';import {dir,conn,query,save} from './db.mjs';
const [scope,label,database]=process.argv.slice(2);process.env.POS_DESTINATION_DATABASE=database;
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
async function fingerprint(binary,args,config={env:process.env,redact:x=>x}){
 const child=spawn('C:/Program Files/PostgreSQL/18/bin/'+binary+'.exe',args,{env:config.env,windowsHide:true});child.stdin.end();let stderr='',active;const tables={},sequences=[];child.stderr.on('data',x=>stderr+=x);const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 for await(const line of readline.createInterface({input:child.stdout,crlfDelay:Infinity})){
  if(active){if(line==='\\.'){active=null;continue;}tables[active].hashes.push(digest(line));continue;}
  const m=line.match(/^COPY (.+) \((.*)\) FROM stdin;$/);if(m){active=m[1];if(tables[active])throw Error('Duplicate COPY');tables[active]={columns:m[2],hashes:[]};continue;}
  if(/^SELECT pg_catalog\.setval\(/.test(line))sequences.push(line);
 }
 const code=await done;if(code)throw Error(binary+' failed '+code+' '+config.redact(stderr).slice(0,1000));
 for(const v of Object.values(tables)){v.rows=v.hashes.length;v.sha256=digest(v.hashes.sort().join('\n'));delete v.hashes;}return {tables,sequences:sequences.sort(),warnings:config.redact(stderr)};
}
const prefix=scope.toLowerCase()+'-'+label;const source=await fingerprint('pg_restore',['--data-only','--no-owner','--no-acl','--file=-',path.join(dir,prefix+'.dump')]);await save(prefix+'-archive-fingerprints.json',source);console.log('Archive fingerprints saved: '+Object.keys(source.tables).length+' COPY tables');
if(database==='archive-only')process.exit(0);
const destination=await fingerprint('pg_dump',['--data-only','--no-owner','--no-acl'],conn(scope,'destination'));await save(prefix+'-restored-fingerprints.json',destination);
const differences=[];for(const t of new Set([...Object.keys(source.tables),...Object.keys(destination.tables)])){if(JSON.stringify(source.tables[t])!==JSON.stringify(destination.tables[t]))differences.push(t);}if(JSON.stringify(source.sequences)!==JSON.stringify(destination.sequences))differences.push('SEQUENCES');
const catalog=await query(scope,'destination',`BEGIN READ ONLY;
SELECT json_build_object('kind','flyway','records',count(*),'successful',count(*) FILTER(WHERE success),'failed',count(*) FILTER(WHERE NOT success),'latest',max(version::integer)) FROM public.flyway_schema_history;
SELECT json_build_object('kind','constraint','type',contype,'count',count(*),'unvalidated',count(*) FILTER(WHERE NOT convalidated)) FROM pg_constraint WHERE connamespace IN (SELECT oid FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema') GROUP BY contype;
SELECT json_build_object('kind','invalidIndex','count',count(*)) FROM pg_index WHERE NOT indisvalid OR NOT indisready;
SELECT json_build_object('kind','extension','name',extname,'version',extversion) FROM pg_extension ORDER BY extname;
ROLLBACK;`);
const pass=differences.length===0&&catalog.find(x=>x.kind==='flyway').failed===0&&catalog.find(x=>x.kind==='invalidIndex').count===0;
const report={at:new Date().toISOString(),scope,label,database,pass,snapshot:'Exact pg_dump archive data (all columns, rows, duplicates and sequence states)',copiedTables:Object.keys(source.tables).length,rows:Object.values(source.tables).reduce((s,x)=>s+x.rows,0),differences,catalog};await save(prefix+'-validation.json',report);console.log(JSON.stringify(report));if(!pass)process.exitCode=1;
