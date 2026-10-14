import {dir,query,save} from './db.mjs';import fs from 'node:fs/promises';import path from 'node:path';
const [scope,label,database]=process.argv.slice(2);if(!['DEV','PROD'].includes(scope)||!['preparation','final'].includes(label)||!/^pos_(dev|prod)_(final|recovery_probe)$/.test(database))throw Error('Invalid restore scope');
const remote=JSON.parse(await fs.readFile(path.join(dir,scope.toLowerCase()+'-'+label+'-remote-archive.json'),'utf8'));if(remote.status!=='ARCHIVE_ON_DURABLE_VOLUME_VERIFIED')throw Error('Remote archive is not verified');
const receipt={scope,label,database,startedAt:new Date().toISOString(),archive:remote.remote,sha256:remote.integrity.sha256,status:'RESTORING',options:['--single-transaction','--exit-on-error'],ownershipAndAclPreserved:true};await save(scope.toLowerCase()+'-'+label+'-server-restore.json',receipt);
try{
const locale=(await query(scope,'source',"SELECT json_build_object('encoding',pg_encoding_to_char(encoding),'collate',datcollate,'ctype',datctype,'provider',datlocprovider,'locale',coalesce(to_jsonb(d)->>'datlocale',to_jsonb(d)->>'daticulocale'),'version',datcollversion) FROM pg_database d WHERE datname=current_database();"))[0];
if(locale.encoding!=='UTF8'||locale.provider!=='i'||!/^en(-|_)US$/i.test(locale.locale))throw Error('Source locale not supported by verified restore configuration');
const literal=s=>"'"+s.replaceAll("'","''")+"'";
await query(scope,'destination',`CREATE DATABASE ${database} TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE ${literal(locale.locale)} LC_COLLATE ${literal(locale.collate)} LC_CTYPE ${literal(locale.ctype)}; SELECT json_build_object('databaseCreated','${database}');`);
receipt.sourceLocale=locale;
const sql=`BEGIN;
CREATE TEMP TABLE migration_restore_output(line text);
COPY migration_restore_output FROM PROGRAM 'PGHOST=/var/run/postgresql PGUSER=postgres pg_restore --dbname=${database} --single-transaction --exit-on-error ${remote.remote} 2>&1';
SELECT json_build_object('status','RESTORED','toolMessages',count(*)) FROM migration_restore_output;
COMMIT;`;
const result=await query(scope,'destination',sql);Object.assign(receipt,{status:'RESTORED_VALIDATION_PENDING',completedAt:new Date().toISOString(),result});await save(scope.toLowerCase()+'-'+label+'-server-restore.json',receipt);console.log(JSON.stringify(receipt));
}catch(e){Object.assign(receipt,{status:'FAILED',failedAt:new Date().toISOString(),error:e.message});await save(scope.toLowerCase()+'-'+label+'-server-restore.json',receipt);throw e;}
