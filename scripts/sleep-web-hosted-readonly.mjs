import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const environment=process.argv[2];assert.ok(['DEV','PROD'].includes(environment));
const base=environment==='DEV'?'https://workflow-api-development-development.up.railway.app':'https://personal-work-os-prod-production.up.railway.app';
const web=environment==='DEV'?'https://workflow-web-development-development.up.railway.app':'https://personal-work-os-frontend-prod-production.up.railway.app';
const report={at:new Date().toISOString(),environment,checks:[],mutation:'none — unauthenticated writes must be rejected before service'};
const r=await fetch(base+'/actuator/health');assert.equal(r.status,200);assert.equal((await r.json()).status,'UP');report.checks.push('health UP');
for(const [method,path] of [['GET','/naps'],['GET','/today'],['POST','/naps/actions']]){
 const response=await fetch(base+'/api/sleep/v1'+path,{method,headers:{'content-type':'application/json'},body:method==='POST'?'{}':undefined});assert.equal(response.status,401);report.checks.push(`${method} ${path} unauthenticated 401`);
}
const invalid=await fetch(base+'/api/sleep/v1/naps',{headers:{authorization:'Bearer invalid-smoke-sentinel'}});assert.equal(invalid.status,401);report.checks.push('invalid bearer 401');
const cors=await fetch(base+'/api/sleep/v1/naps/actions',{method:'OPTIONS',headers:{origin:web,'access-control-request-method':'POST','access-control-request-headers':'authorization,content-type'}});assert.equal(cors.status,200);assert.equal(cors.headers.get('access-control-allow-origin'),web);report.checks.push('actual hosted Web CORS origin accepted');
for(const path of ['/life/sleep','/life/sleep/records','/life/sleep/statistics','/life/sleep/settings']){
 const response=await fetch(web+path,{redirect:'manual'});assert.ok([302,303,307,308].includes(response.status));const url=new URL(response.headers.get('location'),web);assert.equal(url.pathname,'/login');assert.equal(url.searchParams.get('next'),path);report.checks.push(`${path} login gate preserves destination`);
}
await fs.writeFile(`.qa/sleep-web-v1/hosted-readonly-${environment.toLowerCase()}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
