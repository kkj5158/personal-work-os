import {dir,query,run,save} from './db.mjs';
import fs from 'node:fs/promises';import path from 'node:path';
const scope=process.argv[2];if(!['DEV','PROD'].includes(scope))throw Error('Exact environment required');
const existing=await query(scope,'destination',"SELECT json_build_object('roles',json_agg(rolname)) FROM pg_roles;");
const roles=await fs.readFile(path.join(dir,scope.toLowerCase()+'-preparation-roles.sql'),'utf8');
const filtered=roles.split(/\r?\n/).filter(line=>{
 if(/^ALTER ROLE postgres\b/.test(line))return false;
 const match=line.match(/^CREATE ROLE ([^;]+);$/);return !match||!existing[0].roles.includes(match[1]);
}).join('\n').replaceAll('GRANTED BY supabase_admin','GRANTED BY postgres');
await run(scope,'destination','psql',['-X','-q','-v','ON_ERROR_STOP=1','--single-transaction'],filtered);
await save(scope.toLowerCase()+'-roles-prepared.json',{scope,at:new Date().toISOString(),pass:true,sourceRolePasswordHashesIncluded:false,postgresAdministratorAndRuntimeConfiguration:'Railway original retained',grantorAdaptation:'Source supabase_admin membership grantor represented by destination postgres administrator'});
console.log(JSON.stringify({scope,rolesPrepared:true}));
