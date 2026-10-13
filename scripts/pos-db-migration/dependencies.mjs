import {query,save,vars} from './db.mjs';
const scope=process.argv[2];const v=vars(scope);
const observations=await query(scope,'source',`BEGIN READ ONLY;
SELECT json_build_object('kind','userIdentity','id',id,'provider',raw_app_meta_data->'provider','providers',raw_app_meta_data->'providers','passwordHashPresent',length(encrypted_password)>0,'emailConfirmed',email_confirmed_at IS NOT NULL,'anonymous',is_anonymous) FROM auth.users;
SELECT json_build_object('kind','storageBuckets','count',count(*)) FROM storage.buckets;
SELECT json_build_object('kind','storageObjects','count',count(*)) FROM storage.objects;
SELECT json_build_object('kind','vault','count',count(*)) FROM vault.secrets;
SELECT json_build_object('kind','foreignKey','table',conrelid::regclass::text,'target',confrelid::regclass::text,'definition',pg_get_constraintdef(oid)) FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace AND confrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='auth');
SELECT json_build_object('kind','functionDependency','schema',n.nspname,'name',p.proname,'vault',pg_get_functiondef(p.oid) ILIKE '%vault.%','http',pg_get_functiondef(p.oid) ILIKE '%net.http%') FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE p.prokind='f' AND n.nspname='public';
SELECT json_build_object('kind','optionalRelation','cron',to_regclass('cron.job') IS NOT NULL,'edgeSecrets',to_regclass('supabase_functions.hooks') IS NOT NULL);
ROLLBACK;`);
const ref=(v.DEV_SUPABASE_URL||v.SUPABASE_JWT_ISSUER).match(/https:\/\/([^.]+)/)[1];const settingsResponse=await fetch('https://'+ref+'.supabase.co/auth/v1/settings',{headers:{apikey:v.DEV_SUPABASE_PUBLISHABLE_KEY||v.SUPABASE_PUBLISHABLE_KEY||v.SUPABASE_ANON_KEY||''}});
let settings={status:settingsResponse.status};if(settingsResponse.ok){const s=await settingsResponse.json();settings={status:settingsResponse.status,disableSignup:s.disable_signup,external:s.external,mfaEnabled:s.mfa_enabled};}
const r={at:new Date().toISOString(),scope,ref,observations,authSettings:settings};await save(scope.toLowerCase()+'-dependencies.json',r);console.log(JSON.stringify({scope,ref,users:observations.filter(x=>x.kind==='userIdentity'),storage:observations.filter(x=>x.kind.startsWith('storage')),vault:observations.find(x=>x.kind==='vault'),foreignKeys:observations.filter(x=>x.kind==='foreignKey').length,settings,optional:observations.find(x=>x.kind==='optionalRelation')}));
