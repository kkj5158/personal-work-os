// Run only after the owned DEV browser fixture is idle. Never changes auth.users or browser sessions.
// railway.cmd run --project <fixed> --environment <DEV> --service <DEV API> --no-local -- node qa/log-multi-image-browser-cleanup.mjs OWNER_UUID PROFILE_UUID [--restore-empty-workspace]
import {execFileSync} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID, createHash} from "node:crypto";
const [owner,profile,restore] = process.argv.slice(2), uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const report={scope:"EXACT_SYNTHETIC_DEV_BROWSER_PROFILE",authUsersChanged:false,browserSessionChanged:false,startedAt:new Date().toISOString(),status:"FAIL"};
try {
  if(!uuid.test(owner)||!uuid.test(profile)||(restore!==undefined&&restore!=="--restore-empty-workspace")||process.env.RAILWAY_ENVIRONMENT_ID!=="9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c"||process.env.RAILWAY_SERVICE_ID!=="eba7d263-7dc3-448a-a6b8-c2994721b597"||process.env.SPRING_PROFILES_ACTIVE!=="hosted-dev"||process.env.SHARED_DESK_STORAGE_ENVIRONMENT!=="DEV")throw Error("DEV_FIXTURE_FENCE");
  const url=new URL(process.env.DEV_DB_URL.replace(/^jdbc:/,""));
  if(!url.hostname.endsWith(".railway.internal"))throw Error("DEV_DATABASE_FENCE");
  const database=JSON.parse(execFileSync("pwsh.exe",["-NoProfile","-Command","railway.cmd variable list --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment 9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c --service 0b4bf0aa-551e-4a41-bfa6-47d1bc1599d9 --json"],{encoding:"utf8",windowsHide:true,stdio:["ignore","pipe","pipe"],timeout:60000}));
  if(database.DATABASE_PUBLIC_URL){const proxy=new URL(database.DATABASE_PUBLIC_URL);url.hostname=proxy.hostname;url.port=proxy.port;}
  else {if(!database.RAILWAY_TCP_PROXY_DOMAIN||!database.RAILWAY_TCP_PROXY_PORT)throw Error("DEV_PROXY_MISSING");url.hostname=database.RAILWAY_TCP_PROXY_DOMAIN;url.port=database.RAILWAY_TCP_PROXY_PORT;}
  const env={...process.env,PGHOST:url.hostname,PGPORT:url.port,PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:process.env.DEV_DB_USERNAME,PGPASSWORD:process.env.DEV_DB_PASSWORD,PGCONNECT_TIMEOUT:"15",PGOPTIONS:"-c statement_timeout=20000 -c lock_timeout=10000",PGAPPNAME:"log-multi-image-browser-fixture-cleanup"};
  const query=sql=>execFileSync("C:/Program Files/PostgreSQL/18/bin/psql.exe",["-X","-w","-q","-t","-A","-v","ON_ERROR_STOP=1","-c",sql],{env,encoding:"utf8",windowsHide:true,stdio:["ignore","pipe","pipe"],timeout:30000}).trim();
  const scope=`owner_id='${owner}'::uuid AND profile_id='${profile}'::uuid`;
  // The exact handle is an owner-approved marker. Other profiles/data block empty-workspace restoration.
  const guard=`IF NOT EXISTS(SELECT 1 FROM log_profiles WHERE owner_id='${owner}'::uuid AND id='${profile}'::uuid AND handle='logmulti_browser_20261117') THEN RAISE EXCEPTION 'BROWSER_PROFILE_MARKER_MISMATCH'; END IF; IF EXISTS(SELECT 1 FROM log_post_images r JOIN log_images i ON i.id=r.image_id WHERE i.${scope.replaceAll(" AND "," AND i.")} AND (r.owner_id<>i.owner_id OR r.profile_id<>i.profile_id)) THEN RAISE EXCEPTION 'IMAGE_REFERENCE_SCOPE_MISMATCH'; END IF;`;
  query(`BEGIN READ ONLY;DO $$ BEGIN ${guard} END $$;COMMIT;`);
  const keys=JSON.parse(query(`SELECT coalesce(json_agg(json_build_object('staging',staging_key,'final',final_key)),'[]') FROM log_images WHERE ${scope}`));
  for(const pair of keys)for(const key of Object.values(pair))if(!new RegExp(`^log/dev/${owner}/(staging|final)/[a-f0-9-]{36}$`).test(key))throw Error("EXACT_KEY_FENCE");
  if(keys.length){
    const nonce=randomUUID(),ackFile=path.join(root,".qa",`log-cleanup-${nonce}.json`);
    await fs.mkdir(path.dirname(ackFile),{recursive:true});
    const childEnv={...Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|JAVA_HOME|GRADLE_USER_HOME)$/i.test(key)||key.startsWith("SHARED_DESK_STORAGE_"))),LOG_CLEANUP_OWNER:owner,LOG_CLEANUP_KEYS:JSON.stringify(keys),LOG_CLEANUP_NONCE:nonce,LOG_CLEANUP_ACK_FILE:ackFile};
    execFileSync("cmd.exe",["/d","/c","gradlew.bat","test","--rerun","--tests","com.kafka.backend.log.LogProviderCleanupTest","--no-daemon","--max-workers=2","--console=plain"],{cwd:path.join(root,"backend"),env:childEnv,windowsHide:true,stdio:["ignore","pipe","pipe"],timeout:300000});
    const ack=JSON.parse(await fs.readFile(ackFile,"utf8"));
    if(ack.status!=="PASS"||ack.owner!==owner||ack.nonce!==nonce||ack.absentCount!==keys.length*2||ack.inputSha256!==createHash("sha256").update(childEnv.LOG_CLEANUP_KEYS).digest("hex"))throw Error("PROVIDER_CLEANUP_ACK_MISMATCH");
    report.providerAbsenceCount=ack.absentCount;
  }
  const removeWorkspace=restore?`IF EXISTS(SELECT 1 FROM log_profiles WHERE owner_id='${owner}'::uuid) OR EXISTS(SELECT 1 FROM log_images WHERE owner_id='${owner}'::uuid) OR EXISTS(SELECT 1 FROM log_posts WHERE owner_id='${owner}'::uuid) OR EXISTS(SELECT 1 FROM log_drafts WHERE owner_id='${owner}'::uuid) THEN RAISE EXCEPTION 'WORKSPACE_NOT_EMPTY'; END IF; DELETE FROM log_workspaces WHERE owner_id='${owner}'::uuid;`:"";
  query(`BEGIN;SELECT owner_id FROM log_workspaces WHERE owner_id='${owner}'::uuid FOR UPDATE;DO $$ BEGIN ${guard} END $$;UPDATE log_workspaces SET active_profile_id=null WHERE owner_id='${owner}'::uuid AND active_profile_id='${profile}'::uuid;UPDATE log_profiles SET avatar_id=null WHERE owner_id='${owner}'::uuid AND id='${profile}'::uuid;DELETE FROM log_posts WHERE ${scope};DELETE FROM log_drafts WHERE ${scope};DELETE FROM log_images WHERE ${scope};DELETE FROM log_profiles WHERE owner_id='${owner}'::uuid AND id='${profile}'::uuid;DO $$ BEGIN ${removeWorkspace} END $$;COMMIT;`);
  if(query(`SELECT count(*) FROM log_profiles WHERE owner_id='${owner}'::uuid AND id='${profile}'::uuid;`)!=="0")throw Error("PROFILE_REMAINS");
  report.status="PASS";report.exactImagePairsDeleted=keys.length;report.emptyWorkspaceRestored=!!restore;
}catch(error){report.reason=/^[A-Z_]+$/.test(error.message)?error.message:"FIXTURE_CLEANUP_FAILED_DETAILS_WITHHELD";process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();const dir=process.env.LOG_MULTI_IMAGE_EVIDENCE_DIR??"D:/DEV_SPACE/pos-log-multi-image-evidence-20261116";await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,"browser-fixture-cleanup.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
