import {execFileSync,spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export const dir=process.env.POS_MIGRATION_ARTIFACT_DIR||import.meta.dirname;
if (!/^F:[\\/]artifacts[\\/]pos-db-migration-20261014(?:[\\/]|$)/i.test(dir)) throw Error('Use the dedicated protected F: migration artifact directory');
export const project='2b52b232-38b2-44b6-b97e-4caba54f90bc';
export const scopes={DEV:{environment:'9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c',api:'eba7d263-7dc3-448a-a6b8-c2994721b597',db:'0b4bf0aa-551e-4a41-bfa6-47d1bc1599d9'},PROD:{environment:'c2c20488-311f-4b9e-9ec9-d79508123176',api:'e46b58f4-e829-430f-a4c4-b27e24d46f19'}};
const cache=new Map();
export function vars(scope,service=scopes[scope].api){
 const key=scope+service;if(cache.has(key))return cache.get(key);
 let v;try{v=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-Command',`railway variable list --project ${project} --environment ${scopes[scope].environment} --service ${service} --json`],{encoding:'utf8',windowsHide:true,timeout:60000}));}catch{throw Error('Railway secure CLI variable access failed; output withheld');}
 cache.set(key,v);return v;
}
export function conn(scope,target){
 const v=vars(scope,target==='destination'?scopes[scope].db:scopes[scope].api);
 const u=new URL((target==='destination'?v.DATABASE_URL:v[scope+'_DB_URL']).replace(/^jdbc:/,''));
 const user=target==='destination'?v.PGUSER:v[scope+'_DB_USERNAME'];
 const password=target==='destination'?v.PGPASSWORD:v[scope+'_DB_PASSWORD'];
 const sourceRef=(v.DEV_SUPABASE_URL||v.SUPABASE_JWT_ISSUER||'').match(/https:\/\/([^.]+)/)?.[1]||user.split('.')[1];
 if(target==='source'&&!/\.supabase\.(co|com)$/.test(u.hostname))throw Error('Source endpoint identity mismatch');
 if(target==='destination'){
  if(!u.hostname.endsWith('.railway.internal'))throw Error('Destination endpoint identity mismatch');
  u.hostname=v.RAILWAY_TCP_PROXY_DOMAIN||'sakura.proxy.rlwy.net';u.port=v.RAILWAY_TCP_PROXY_PORT||'20671';
 }
 if(!user||!password)throw Error('Database credential unavailable');
 const secrets=Object.values(v).filter(x=>typeof x==='string'&&x.length>3).sort((a,b)=>b.length-a.length);
 const redact=s=>secrets.reduce((t,x)=>t.replaceAll(x,'[REDACTED]'),String(s)).replace(/(?:jdbc:)?postgres(?:ql)?:\/\/[^\s]+/g,'[DB_URL]');
 const database=target==='destination'?(process.env.POS_DESTINATION_DATABASE||u.pathname.slice(1)):u.pathname.slice(1);
 return {env:{...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:database,PGUSER:user,PGPASSWORD:password,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'20',PGAPPNAME:'pos-migration-20261014',PGOPTIONS:'-c statement_timeout=300000 -c lock_timeout=10000'},redact,identity:{scope,target,projectRef:target==='source'?sourceRef:null,host:u.hostname,port:u.port||'5432',database,serviceId:target==='destination'?scopes[scope].db:scopes[scope].api}};
}
export async function run(scope,target,binary,args,input){
 const c=conn(scope,target);const child=spawn(`C:/Program Files/PostgreSQL/18/bin/${binary}.exe`,args,{env:c.env,windowsHide:true});let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.stdin.end(input);
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});if(code)throw Error(`${binary} exit ${code}: ${c.redact(stderr).slice(0,1800)}`);return {stdout,stderr:c.redact(stderr)};
}
export async function query(scope,target,sql){const r=await run(scope,target,'psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],sql);return r.stdout.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);}
export async function save(file,value){await fs.writeFile(path.join(dir,file),JSON.stringify(value,null,2)+'\n');}
export async function hash(file){const data=await fs.readFile(file);return {bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')};}
