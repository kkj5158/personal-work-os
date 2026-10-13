import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const environment=process.argv[2]??'dev';if(!['dev','prod'].includes(environment))throw Error('Use dev|prod');
const web=environment==='dev'?'https://workflow-web-development-development.up.railway.app':'https://personal-work-os-frontend-prod-production.up.railway.app';
const api=environment==='dev'?'https://workflow-api-development-development.up.railway.app':'https://personal-work-os-prod-production.up.railway.app';
const checks=[];
const health=await fetch(api+'/actuator/health');assert.equal(health.status,200);assert.equal((await health.json()).status,'UP');checks.push({path:'/actuator/health',status:health.status});
const login=await fetch(web+'/login');assert.equal(login.status,200);checks.push({path:'/login',status:login.status});
for(const path of ['/life/sleep','/life/sleep/statistics','/life/sleep/settings','/life/calendar']){const response=await fetch(web+path,{redirect:'manual'});assert.ok([302,303,307,308].includes(response.status));const destination=new URL(response.headers.get('location'),web);assert.equal(destination.origin,web);assert.equal(destination.pathname,'/login');assert.equal(destination.searchParams.get('next'),path);checks.push({path,status:response.status,loginGate:true});}
for(const path of ['/api/sleep/v1/today','/api/sleep/v1/intervals?start=2026-10-11T15:00:00Z&end=2026-10-13T15:00:00Z&from=2026-10-12&to=2026-10-13','/api/exercise/v1/state','/api/calendar?from=2026-10-12&to=2026-10-13']){const response=await fetch(api+path);assert.equal(response.status,401);checks.push({path:path.split('?')[0],status:response.status,anonymousRejected:true});}
const invalid=await fetch(api+'/api/sleep/v1/intervals',{headers:{Authorization:'Bearer deliberately-invalid-QA-rejection-probe'}});assert.equal(invalid.status,401);checks.push({path:'/api/sleep/v1/intervals',status:invalid.status,invalidBearerRejected:true});
const result={at:new Date().toISOString(),environment,web,api,readOnly:true,scope:'Availability and anonymous/invalid-bearer security only; NOT authenticated acceptance and NOT browser QA',checks,passed:checks.length};await fs.writeFile(`docs/sleep-web-v2-life-calendar/evidence/hosted-${environment}-probe.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({environment,passed:checks.length,authenticatedAcceptance:false,browserQA:false}));
