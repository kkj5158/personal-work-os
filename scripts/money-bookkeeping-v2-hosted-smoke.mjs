import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const environment=process.argv[2]??'DEV';assert.ok(['DEV','PROD'].includes(environment));
const api=environment==='DEV'?'https://workflow-api-development-development.up.railway.app':'https://personal-work-os-prod-production.up.railway.app';
const web=environment==='DEV'?'https://workflow-web-development-development.up.railway.app':'https://personal-work-os-frontend-prod-production.up.railway.app';
const report={environment,at:new Date().toISOString(),mode:'READ_ONLY_AUTH_PREFLIGHT',session:'UNAVAILABLE',checks:[]};let browser,authorization;
try{
 const profile=path.join(process.env.LOCALAPPDATA,'Chrome-TEAM-KAFKA');
 browser=await chromium.launchPersistentContext(profile,{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,ignoreDefaultArgs:true,args:[`--user-data-dir=${profile}`,'--remote-debugging-pipe','--headless=new','about:blank'],viewport:{width:1586,height:992},timeout:30000});
 const page=await browser.newPage();page.on('request',async request=>{if(request.url().startsWith(api+'/api/')){const headers=await request.allHeaders();if(headers.authorization?.startsWith('Bearer '))authorization=headers.authorization;}});
 await page.goto(web+'/money/bookkeeping',{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(5000);
 if(page.url().includes('/login')||!authorization)throw Error('NORMAL_OWNER_SESSION_UNAVAILABLE');
 const result=await fetch(api+'/api/money/accounts',{headers:{authorization},signal:AbortSignal.timeout(30000)});assert.equal(result.status,200);await result.json();
 report.session='VERIFIED — normal owner Supabase JWT; token kept in memory only';report.checks.push({name:'authenticated MONEY accounts',status:'PASS'});
}catch(error){report.blocker=error.code??error.message;process.exitCode=2;}finally{await browser?.close();const dir=path.resolve(import.meta.dirname,'../.qa/money-bookkeeping-v2');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,environment.toLowerCase()+'-auth-preflight.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
