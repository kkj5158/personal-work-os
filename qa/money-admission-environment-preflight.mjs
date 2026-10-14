// Read-only current Railway DB/Flyway observation. Credentials remain in memory.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {vars,query,scopes} from '../scripts/pos-db-migration/db.mjs';

const root=process.cwd();
const observedAt=new Date().toISOString();
const environments=[];
for(const scope of ['DEV','PROD']){
  const config=vars(scope);
  const url=new URL(config[scope+'_DB_URL'].replace(/^jdbc:/,''));
  if(!url.hostname.endsWith('.railway.internal'))throw Error(scope+' active DB is not Railway');
  process.env.POS_DESTINATION_DATABASE=url.pathname.slice(1);
  const rows=await query(scope,'destination',`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30000';
SELECT json_build_object('kind','server','database',current_database(),'version',current_setting('server_version'),'readOnly',current_setting('transaction_read_only'));
SELECT json_build_object('kind','flyway','version',version,'description',description,'script',script,'checksum',checksum,'success',success) FROM public.flyway_schema_history ORDER BY installed_rank;
SELECT json_build_object('kind','integrity','invalidIndexes',(SELECT count(*) FROM pg_index WHERE NOT indisvalid),'unvalidatedConstraints',(SELECT count(*) FROM pg_constraint WHERE NOT convalidated),'writeFenceTriggers',(SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%pos_migration%' AND NOT tgisinternal));
SELECT json_build_object('kind','unvalidatedConstraint','schema',n.nspname,'table',c.relname,'name',con.conname,'type',con.contype) FROM pg_constraint con JOIN pg_namespace n ON con.connamespace=n.oid JOIN pg_class c ON con.conrelid=c.oid WHERE NOT con.convalidated;
ROLLBACK;`);
  environments.push({scope,environmentId:scopes[scope].environment,databaseProvider:'Railway',database:url.pathname.slice(1),activeAuthProvider:(config.SUPABASE_JWT_ISSUER||config.DEV_SUPABASE_URL)?.includes('railway.app')?'Railway GoTrue':'UNVERIFIED',authMirrorEnabled:config.APP_AUTH_MIRROR_ENABLED,profile:config.SPRING_PROFILES_ACTIVE,rows});
}
// Flyway's SQL checksum updates CRC32 with each UTF-8 line, excluding line endings.
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let b=0;b<8;b++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const checksum=text=>{let c=0xffffffff;for(const line of text.replace(/^\uFEFF/,'').split(/\r\n|\r|\n/)){for(const byte of Buffer.from(line,'utf8'))c=crcTable[(c^byte)&255]^(c>>>8);}return (c^0xffffffff)|0;};
for(const environment of environments){
  const mismatches=[];for(const row of environment.rows.filter(r=>r.kind==='flyway'&&r.script?.endsWith('.sql'))){const text=await fs.readFile(path.join(root,'backend/src/main/resources/db/migration',row.script),'utf8').catch(()=>null);if(text===null||checksum(text)!==row.checksum)mismatches.push({version:row.version,script:row.script,actual:row.checksum,local:text===null?'MISSING':checksum(text)});}
  environment.localMigrationChecksumComparison={method:'CRC32 UTF-8 lines, excluding line endings; not a substitute for Flyway validate()',mismatches,pass:mismatches.length===0};
}
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{encoding:'utf8'}).trim());
const locks=(await fs.readdir(common)).filter(name=>/lock/i.test(name));
const primary=path.dirname(common),configFiles=[];
for(const file of [path.join(primary,'.idea/workspace.xml'),path.join(primary,'.env')]){
  const text=await fs.readFile(file,'utf8').catch(()=>null);
  if(text)configFiles.push({file,hasSupabaseJdbc:/jdbc:postgresql[^\s"<]*supabase/i.test(text),hasRailwayJdbc:/jdbc:postgresql[^\s"<]*railway/i.test(text)});
}
const report={observedAt,readOnly:true,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),environments,coordinationLockNames:locks,localConfigProviderFacts:configFiles};
const dir=path.join(root,'.qa/money-admission-preflight');await fs.mkdir(dir,{recursive:true});
await fs.writeFile(path.join(dir,'environment.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,environments:environments.map(e=>({...e,rows:undefined,server:e.rows.find(r=>r.kind==='server'),flyway:{entries:e.rows.filter(r=>r.kind==='flyway').length,last:e.rows.filter(r=>r.kind==='flyway').at(-1),failed:e.rows.filter(r=>r.kind==='flyway'&&!r.success).length},integrity:e.rows.find(r=>r.kind==='integrity')}))},null,2));
