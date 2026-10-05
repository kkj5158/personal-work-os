import path from 'node:path';
import {createHash} from 'node:crypto';
const schemaFor=id=>'qa_attention_'+createHash('sha256').update(id).digest('hex').slice(0,20);
async function schemaTask(ctx,action){await ctx.run('attention-schema-'+action,'java',['-cp',ctx.classpath,path.join(ctx.toolRoot,'qa/suites/work-queue/AttentionFixture.java'),action,schemaFor(ctx.runId)],path.join(ctx.target,'backend'),ctx.javaEnv,60000);}
export default {
 system:'work-queue',readyPath:'/api/workflow/attention/snapshot',route:'/workflow/attention',sensitive:true,testMatch:'**/attention.spec.mjs',browserTimeout:600000,
 scenarios:['attention.routes','attention.create-persist','attention.ack-only','attention.dedupe','attention.operation-replay','attention.revision-conflicts','attention.orders','attention.lanes','attention.history','attention.pairing','attention.producer','attention.nearby-workflow'],
 apiChecks:['/api/workflow/attention/snapshot','/api/workflow/attention/items?status=COMPLETED','/api/workflow','/api/workflow/preferences'],
 backendArgs:['--spring.jpa.properties.hibernate.default_schema=public'],
 setup:{runtimeRequirements:['authorized-dev'],fixtures:['isolated-attention-schema'],cleanupRequirements:['drop-run-owned-attention-schema']},
 backgroundValidation:'Attention has no scheduler; Waiting delivery is off. Desktop Chrome/Codex/SQLite/tray/resource/installer acceptance remains separate. Pairing browser suite uses DEV identity; real PROD auth chain tests accompany it, actual deployed owner login/pairing remains release smoke.',
 async prepare(ctx){await schemaTask(ctx,'create');const url=new URL(ctx.javaEnv.DEV_DB_URL.replace(/^jdbc:/,''));url.searchParams.set('currentSchema',schemaFor(ctx.runId)+',public');await ctx.run('attention-security-domain-regressions','cmd.exe',['/d','/c','gradlew.bat','--no-daemon','--console=plain','test','--tests','*Attention*Test','--tests','*MoneyBridgeSecurityTest','--tests','*ProdSecurityConfigJwtDecoderTest','--tests','*SecurityProfileIsolationTest','--tests','*WorkflowServiceTest','--tests','*WorkflowV1DomainTest'],path.join(ctx.target,'backend'),ctx.javaEnv,300000);return {DEV_DB_URL:'jdbc:'+url.href};},
 async cleanup(ctx){await schemaTask(ctx,'drop');}
};
