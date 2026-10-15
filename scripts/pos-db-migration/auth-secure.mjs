import {execFileSync,spawn} from 'node:child_process';import fs from 'node:fs/promises';import path from 'node:path';import {dir,scopes,project} from './db.mjs';
export function recoverAuth(scope){
 const file=path.join(dir,scope.toLowerCase()+'-railway-auth-configuration.dpapi');
 const ps=`Add-Type -AssemblyName System.Security; [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes('${file.replaceAll("'","''")}'),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))`;
 let snapshot;try{snapshot=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-Command',ps],{encoding:'utf8',windowsHide:true}));}catch{throw Error('Auth protected configuration recovery failed; output withheld');}
 if(snapshot.scope!==scope||snapshot.project!==project||snapshot.environment!==scopes[scope].environment)throw Error('Auth configuration identity mismatch');
 return snapshot;
}
export async function secureVariables(scope,serviceId,variables,skipDeploys=true){
 const input={projectId:project,environmentId:scopes[scope].environment,serviceId,skipDeploys,replace:false,variables};
 const p=spawn(process.execPath,['C:/Users/JIUU/AppData/Roaming/npm/node_modules/@railway/cli/bin/railway.js','api','--file',path.join(dir,'secure-variable-upsert.graphql'),'--variables','@-','--compact'],{windowsHide:true});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.stdin.end(JSON.stringify({input}));
 const code=await new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',resolve);});let result;try{result=JSON.parse(out);}catch{}
 if(code||!result?.data?.variableCollectionUpsert){let safe=out+err;for(const value of Object.values(variables).filter(v=>typeof v==='string'&&v.length>3))safe=safe.replaceAll(value,'[REDACTED]');throw Error('Secure configuration update failed: '+safe.slice(0,800));}
 return {scope,serviceId,variableNames:Object.keys(variables),skipDeploys,updated:true};
}
