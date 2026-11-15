// Exact owned synthetic identity recovery through the standard DEV GoTrue admin API.
import {createPrivateKey,sign} from 'node:crypto';
const [owner,run]=process.argv.slice(2),base='https://pos-auth-dev-development.up.railway.app/auth/v1';
try{
 if(!/^[a-f0-9-]{36}$/i.test(owner)||!/^[a-f0-9-]{36}$/i.test(run)||new URL(process.env.API_EXTERNAL_URL).origin!==new URL(base).origin)throw Error('FENCE');
 const keys=[];function find(v){if(v&&typeof v==='object'){if(v.kty==='EC'&&v.d)keys.push(v);else Object.values(v).forEach(find);}}find(JSON.parse(process.env.GOTRUE_JWT_KEYS));if(keys.length!==1)throw Error('FENCE');const key=keys[0],enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),now=Math.floor(Date.now()/1000),data=enc({alg:'ES256',typ:'JWT',kid:key.kid})+'.'+enc({iss:process.env.GOTRUE_JWT_ISSUER,aud:process.env.GOTRUE_JWT_AUD,role:'service_role',iat:now,exp:now+60});const token=data+'.'+sign('sha256',Buffer.from(data),{key:createPrivateKey({key,format:'jwk'}),dsaEncoding:'ieee-p1363'}).toString('base64url');
 const request=method=>fetch(base+'/admin/users/'+owner,{method,headers:{apikey:process.env.POS_AUTH_PUBLISHABLE_KEY,Authorization:'Bearer '+token},redirect:'error'});
 const before=await request('GET');let deleted;
 if(before.status!==404){const user=await before.json();if(!before.ok||user.email!==`orbit-money-qa-${run}@example.invalid`||user.user_metadata?.qaRunId!==run)throw Error('IDENTITY_FENCE');deleted=(await request('DELETE')).status;}
 const after=await request('GET');console.log(JSON.stringify({status:after.status===404?'AUTH_FIXTURE_ABSENT':'AUTH_CLEANUP_FAILED',before:before.status,deleted,after:after.status}));if(after.status!==404)process.exitCode=1;
}catch{console.log('AUTH_FIXTURE_CLEANUP_FAILED');process.exitCode=1;}
