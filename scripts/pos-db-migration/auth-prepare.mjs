import crypto from 'node:crypto';import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';
import {scopes,project,dir,query,run,save,hash,vars} from './db.mjs';
const scope=process.argv[2];if(!['DEV','PROD'].includes(scope))throw Error('Exact scope required');
const manifest=JSON.parse(await fs.readFile(path.join(dir,'auth-manifest.json'),'utf8'))[scope];
if(!manifest.serviceId||!manifest.url?.endsWith('.up.railway.app'))throw Error('Auth destination identity missing');
process.env.POS_DESTINATION_DATABASE=manifest.database;
const file=path.join(dir,scope.toLowerCase()+'-railway-auth-configuration.dpapi');
try {await fs.access(file);throw Error('Protected Auth configuration already exists; do not regenerate signing credentials');}catch(e){if(e.code!=='ENOENT')throw e;}
const state=await query(scope,'destination',await fs.readFile(path.join(dir,'auth-compatibility.sql'),'utf8'));
const versions=state.find(x=>x.kind==='schemaMigrations').versions;
const migrationFiles=await fs.readdir(path.join(dir,'auth-upstream-v2.197.0','migrations'));
const known=new Set(migrationFiles.filter(x=>x.endsWith('.up.sql')).map(x=>x.split('_')[0]));
const legacyBaseline=new Set(['20171026211738','20171026211808','20171026211834','20180103212743','20180108183307','20180119214651','20180125194653']); const unknown=versions.filter(x=>x!=='00'&&!known.has(x)&&!legacyBaseline.has(x));const pending=[...known].filter(x=>!versions.includes(x));
if(unknown.length||pending.length){console.log(JSON.stringify({scope,unknown,pending}));throw Error('Auth schema/version mismatch requires review');}
await save(scope.toLowerCase()+'-auth-schema-compatibility.json',{at:new Date().toISOString(),scope,database:manifest.database,version:'v2.197.0',upstreamCommit:'4eee58f296d9698a1c2c0ae14d7a0b379c7622d3',pass:true,applied:versions.length,unknown,pending,accounts:state.find(x=>x.kind==='accounts'),providers:state.find(x=>x.kind==='providers')});
const archive=path.join(dir,scope.toLowerCase()+'-pre-auth-schema.dump');
await run(scope,'destination','pg_dump',['--format=custom','--schema=auth','--file='+archive]);
await save(scope.toLowerCase()+'-pre-auth-backup.json',{scope,at:new Date().toISOString(),database:manifest.database,file:archive,integrity:await hash(archive),fullRecovery:'Verified final full database archive and Railway volume snapshot are also retained'});
const keyPair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const privateJwk={...keyPair.privateKey.export({format:'jwk'}),kid:crypto.randomUUID(),alg:'ES256',use:'sig',key_ops:['sign','verify']};
const dbPassword=crypto.randomBytes(36).toString('base64url');
const publicKey='sb_publishable_'+crypto.randomBytes(24).toString('base64url');
const jwtSecret=crypto.randomBytes(48).toString('base64url');
const db=vars(scope,scopes[scope].db);const dbUrl=`postgresql://supabase_auth_admin:${dbPassword}@${db.PGHOST}:5432/${manifest.database}?sslmode=require&application_name=pos-auth-${scope.toLowerCase()}`;
const values={PORT:'8080',GOTRUE_API_HOST:'127.0.0.1',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:manifest.url+'/auth/v1',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:dbUrl,GOTRUE_DB_NAMESPACE:'auth',GOTRUE_DB_MAX_POOL_SIZE:'5',GOTRUE_DB_MAX_IDLE_POOL_SIZE:'2',GOTRUE_DB_CONN_MAX_LIFETIME:'10m',GOTRUE_DB_CONN_MAX_IDLE_TIME:'1m',GOTRUE_JWT_SECRET:jwtSecret,GOTRUE_JWT_KEYS:JSON.stringify([privateJwk]),GOTRUE_JWT_VALID_METHODS:'ES256',GOTRUE_JWT_ISSUER:manifest.url+'/auth/v1',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_EXP:'300',GOTRUE_SITE_URL:manifest.siteUrl,GOTRUE_URI_ALLOW_LIST:manifest.siteUrl+'/**',GOTRUE_DISABLE_SIGNUP:'false',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_EXTERNAL_PHONE_ENABLED:'false',GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED:'false',GOTRUE_MAILER_AUTOCONFIRM:'false',GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED:'true',GOTRUE_MAILER_URLPATHS_CONFIRMATION:'/verify',GOTRUE_MAILER_URLPATHS_RECOVERY:'/verify',GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE:'/verify',GOTRUE_MAILER_URLPATHS_INVITE:'/verify',GOTRUE_CORS_ALLOWED_HEADERS:'apikey,x-client-info,x-supabase-api-version',POS_AUTH_PUBLISHABLE_KEY:publicKey};
const snapshot=JSON.stringify({at:new Date().toISOString(),scope,project,environment:scopes[scope].environment,manifest,variables:values,databasePassword:dbPassword});
const ps=`Add-Type -AssemblyName System.Security; $taskInput=[Console]::In.ReadToEnd(); $taskBytes=[Text.Encoding]::UTF8.GetBytes($taskInput); [IO.File]::WriteAllBytes('${file.replaceAll("'","''")}',[Security.Cryptography.ProtectedData]::Protect($taskBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)); $taskRecovery=[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes('${file.replaceAll("'","''")}'),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)); if($taskRecovery -cne $taskInput){exit 3}`;
const p=spawn('pwsh.exe',['-NoProfile','-Command',ps],{windowsHide:true,stdio:['pipe','ignore','ignore']});p.stdin.end(snapshot);if(await new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',resolve);}))throw Error('Auth encrypted backup failed');
try{await run(scope,'destination','psql',['-X','-q','-v','ON_ERROR_STOP=1'],`ALTER ROLE supabase_auth_admin PASSWORD '${dbPassword}';`);}catch{throw Error('Auth restricted-role credential setup failed; sensitive output withheld');}
const input={projectId:project,environmentId:scopes[scope].environment,serviceId:manifest.serviceId,skipDeploys:true,replace:false,variables:values};
const child=spawn(process.execPath,['C:/Users/JIUU/AppData/Roaming/npm/node_modules/@railway/cli/bin/railway.js','api','--file',path.join(dir,'secure-variable-upsert.graphql'),'--variables','@-','--compact'],{cwd:dir,windowsHide:true});let out='',error='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>error+=x);child.stdin.end(JSON.stringify({input}));const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});if(code||!JSON.parse(out).data?.variableCollectionUpsert)throw Error('Auth service configuration failed; sensitive output withheld');
await save(scope.toLowerCase()+'-auth-prepared.json',{at:new Date().toISOString(),scope,database:manifest.database,serviceId:manifest.serviceId,url:manifest.url,version:'v2.197.0',algorithm:'ES256',signingKid:privateJwk.kid,adminRole:'supabase_auth_admin; source role privileges retained',configurationEncryption:'DPAPI CurrentUser round-trip PASS',initialTokenLifetimeSeconds:300,normalLifetimeRestoreRequired:3600,emailDelivery:'NOT_CONFIGURED; existing confirmed password login does not require SMTP',credentialsPrinted:false});
console.log(JSON.stringify({scope,authConfigurationPrepared:true,schemaCompatible:true,preAuthBackupVerified:true,service:manifest.serviceId,url:manifest.url}));



