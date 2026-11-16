// Exact run-scoped DEV auth recovery; no business DB or owner browser/session access.
import {createPrivateKey,sign} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {removeSyntheticAuthUser} from "./log-synthetic-auth-cleanup.mjs";
const [runId,...owners]=process.argv.slice(2),uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const auth="https://pos-auth-dev-development.up.railway.app/auth/v1";
const report={scope:"EXACT_DEV_SYNTHETIC_AUTH_RECOVERY",runId,status:"FAIL",observations:[],startedAt:new Date().toISOString()};
try{
  if(!uuid.test(runId)||owners.length<1||owners.length>2||owners.some(x=>!uuid.test(x))||process.env.RAILWAY_ENVIRONMENT_ID!=="9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c"||process.env.RAILWAY_SERVICE_ID!=="d3351c87-4d62-44eb-b171-055462d0ca19"||new URL(process.env.API_EXTERNAL_URL??"https://invalid.invalid").origin!==new URL(auth).origin)throw Error("EXACT_DEV_AUTH_FENCE");
  const keys=[];function find(v){if(v&&typeof v==="object"){if(v.kty==="EC"&&v.d)keys.push(v);else Object.values(v).forEach(find);}}find(JSON.parse(process.env.GOTRUE_JWT_KEYS??"null"));if(keys.length!==1)throw Error("DEV_AUTH_KEY_FENCE");
  const jwk=keys[0];
  function admin(){const now=Math.floor(Date.now()/1000),enc=v=>Buffer.from(JSON.stringify(v)).toString("base64url");const body=enc({alg:"ES256",kid:jwk.kid,typ:"JWT"})+"."+enc({iss:process.env.GOTRUE_JWT_ISSUER,aud:process.env.GOTRUE_JWT_AUD,role:"service_role",iat:now,exp:now+120});return body+"."+sign("sha256",Buffer.from(body),{key:createPrivateKey({key:jwk,format:"jwk"}),dsaEncoding:"ieee-p1363"}).toString("base64url");}
  const request=(route,method)=>fetch(auth+route,{method,headers:{apikey:process.env.POS_AUTH_PUBLISHABLE_KEY,Authorization:"Bearer "+admin(),"Content-Type":"application/json"},redirect:"error",signal:AbortSignal.timeout(20000)});
  for(let index=0;index<owners.length;index++){
    const label=index===0?"a":"b",actor={id:owners[index],label,email:`log-qa-${runId}-${label}@example.invalid`};
    report.observations.push(await removeSyntheticAuthUser(request,actor,runId));
  }
  report.status="PASS";
}catch(error){report.reason=/^[A-Z_]+$/.test(error.message)?error.message:"AUTH_RECOVERY_FAILED_DETAILS_WITHHELD";process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();const dir=process.env.LOG_MULTI_IMAGE_EVIDENCE_DIR??"D:/DEV_SPACE/pos-log-multi-image-evidence-20261116";await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,`auth-recovery-${runId}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
