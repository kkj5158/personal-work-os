// Read-only diagnostics: expose configuration presence and aggregate state, never secrets or purchase details.
import {loadEnvironment} from '../qa/runtime/environment.mjs';
import {execFileSync,spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),name=process.argv[2];
assert.ok(['DEV','PROD'].includes(name));
const envId=name==='DEV'?'9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c':'c2c20488-311f-4b9e-9ec9-d79508123176';
const service=name==='DEV'?'eba7d263-7dc3-448a-a6b8-c2994721b597':'e46b58f4-e829-430f-a4c4-b27e24d46f19';
const v=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-Command',`railway variable list --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment ${envId} --service ${service} --json`],{encoding:'utf8',windowsHide:true}));
const {values}=await loadEnvironment(root),db=name==='DEV'?values:{DEV_DB_URL:v.PROD_DB_URL,DEV_DB_USERNAME:v.PROD_DB_USERNAME,DEV_DB_PASSWORD:v.PROD_DB_PASSWORD};
assert.equal(v.SPRING_PROFILES_ACTIVE,name==='DEV'?'hosted-dev':'prod');
if(name==='PROD')assert.notEqual(db.DEV_DB_URL,values.DEV_DB_URL);
const url=new URL(db.DEV_DB_URL.replace(/^jdbc:/,''));
const child=spawn('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:url.pathname.slice(1),PGUSER:db.DEV_DB_USERNAME,PGPASSWORD:db.DEV_DB_PASSWORD,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'15',PGOPTIONS:'-c statement_timeout=30000'},windowsHide:true});
let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
child.stdin.end(`BEGIN READ ONLY;
select json_build_object('kind','migration','version',version,'checksum',checksum,'success',success) from flyway_schema_history where version='79';
select json_build_object('kind','items','status',status,'code',result->>'code','count',count(*)) from money_recommendation_items where created_at>now()-interval '2 days' group by status,result->>'code';
select json_build_object('kind','reportedRun','runId',run_id,'status',status,'code',result->>'code','createdAt',created_at,'updatedAt',updated_at) from money_recommendation_items where run_id='71c5300b-8655-4468-9632-a6ec46205f64';
select json_build_object('kind','externalUsage','status',status,'count',count(*),'cost',sum(actual_cost),'inputTokens',sum(input_tokens),'outputTokens',sum(output_tokens)) from money_recommendation_usage group by status;
ROLLBACK;`);
const code=await new Promise(r=>child.on('exit',r));if(code){for(const secret of Object.values(db))err=err.replaceAll(secret,'[REDACTED]');throw Error(err.slice(0,1500));}
const report={environment:name,at:new Date().toISOString(),config:{profile:v.SPRING_PROFILES_ACTIVE,key:(v.MONEY_AI_API_KEY||v.OPENAI_API_KEY)?'SET':'NOT_SET',aiVariableNames:Object.keys(v).filter(k=>/OPENAI|MONEY_AI/.test(k)),providerEnabled:v.MONEY_AI_CLASSIFICATION_PROVIDER_ENABLED??'ABSENT_DEFAULT_FALSE',model:v.MONEY_AI_MODEL??'DEFAULT_gpt-4.1-mini',worker:v.MONEY_AI_BOOKKEEPING_WORKER_ENABLED??'DEFAULT_TRUE'},observations:out.trim().split('\n').filter(Boolean).map(JSON.parse)};
await fs.mkdir(path.join(root,'.qa/money-remediation'),{recursive:true});await fs.writeFile(path.join(root,'.qa/money-remediation',name.toLowerCase()+'-baseline.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
