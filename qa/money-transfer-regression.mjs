import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
const runId=process.env.QA_RUN_ID;if(runId&&!/^[a-zA-Z0-9-]+$/.test(runId))throw Error('Invalid owned run ID');
const root='F:/artifacts/money-web-v2/MONEY_IMPLEMENTATION_20261006/transfer-regression'+(runId?'/'+runId:''),repo=process.cwd().replaceAll('\\','/');
const source='D:/Planning_SPACE/MONEY_WEB_POST_RELEASE_NON_AI_REVISION_20261006/03_TRANSFER_QA/harness/TransferPlanningHarness.java';
fs.mkdirSync(root+'/evidence',{recursive:true});fs.mkdirSync(root+'/classes',{recursive:true});
const original=fs.readFileSync(source,'utf8');let code=original.replace('Path.of("D:/DEV_SPACE/personal-work-os")',`Path.of("${repo}")`).replace('Path.of("D:/Planning_SPACE/MONEY_WEB_POST_RELEASE_NON_AI_REVISION_20261006/03_TRANSFER_QA")',`Path.of("${root}")`).replace('127.0.0.1:55439/postgres?user=transfer_qa','127.0.0.1:55441/postgres?user=money_integrated_synthetic').replace('"V71__money_web_revision.sql"','"V71__money_web_revision.sql","V73__money_integrated_revision.sql","V80__money_account_fund_group_history.sql"').replace('check(c.facts().size()<=1,"same body/time with changed notificationKey creates two transfers in same matcher pass");','check(c.facts().isEmpty(),"ambiguous duplicate creates zero financial facts");eq(c.p.balance(c.g.id()).amount(),"100000","no duplicate source movement");eq(c.p.balance(c.s.id()).amount(),"100000","no duplicate destination movement");');
// The transfer harness exercises historical overview, so its owned schema needs V80.
if(!code.includes('"V73__money_integrated_revision.sql","V80__money_account_fund_group_history.sql"'))throw Error('Transfer harness migration marker changed; historical schema was not injected');
// V2 intentionally admits eligible ordinary movements. Preserve every financial assertion
// and replace only the five historical wording/wait expectations superseded by owner policy.
const v2Cases={
 T02:'test("T02","unrelated equal amount","two ordinary facts; zero false transfer; explicit external context",c->{c.out("카드결제 합성상점",AT);c.in("급여 합성회사",AT);c.run();c.mature();check(c.facts().size()==2&&c.facts().stream().noneMatch(t->t.type()==TransactionType.TRANSFER),"ordinary external movements remain distinct");var k=(Map<?,?>)c.w.overview("2026-01-01","2026-12-31").get("kpis");eq(k.get("income"),"10000","external income");eq(k.get("consumption"),"10000","external expense");});',
 T03:'test("T03","excessive time","no automatic transfer outside occurrence/conflict windows",c->{c.out("QAOWNER",AT);c.in("QAOWNER",AT.plusSeconds(180));c.run();c.mature();check(c.facts().size()==2&&c.facts().stream().noneMatch(t->t.type()==TransactionType.TRANSFER),"different occurrence windows never merge");});',
 T05:'test("T05","single owned ordinary leg","pending then one ordinary expense after observation",c->{c.out("QAOWNER",AT);c.run();noFacts(c);c.mature();check(c.facts().size()==1&&c.facts().getFirst().type()==TransactionType.EXPENSE,"eligible single movement admits ordinary");check(c.m.notifications(null,200,0).getFirst().state()==ProcessingState.PROCESSED,"posted after receipt observation");});',
 T22:'test("T22","late leg after ordinary posting","preserve original expense and review late source; no second fact",c->{c.out("QAOWNER",AT);c.run();c.mature();var before=c.facts().getFirst();c.in("QAOWNER",AT);c.run();c.mature();check(c.facts().size()==1&&c.facts().getFirst().id().equals(before.id())&&c.facts().getFirst().type()==TransactionType.EXPENSE,"existing canonical decision preserved");check(c.m.notifications(null,200,0).stream().anyMatch(r->r.state()==ProcessingState.REVIEW_REQUIRED&&"LATE_POSTED_TRANSFER_LINK_REQUIRED".equals(r.processingReason())),"late source precise linking review");});',
 T25:'test("T25","different bank counterpart formats","unique verified owned pair matches despite wording difference",c->{c.out("QAOWNER 지점",AT);c.in("QAOWNER",AT);c.run();c.transfer(1,c.a.id(),c.b.id(),2,false);});'
};
for(const [id,replacement] of Object.entries(v2Cases)){
 const expression=new RegExp('test\\("'+id+'"[^\\n]*');
 if(!expression.test(code))throw Error('V2_POLICY_SCENARIO_MARKER_CHANGED:'+id);
 code=code.replace(expression,replacement);
}
code=code.replace('Files.writeString(ROOT.resolve("evidence/results.json")','test("INT-T30","distinct repeat across batches with balance flow","legitimate second movement is preserved",c->{c.route("합성적금(9814)",AT);c.run();c.raw("com.kakaobank.channel","출금 10,000원","입출금통장(9813) → 합성적금(9814) 잔액 80,000원",AT.plusSeconds(12));c.run();check(c.facts().size()==2,"two independently evidenced facts");eq(c.p.balance(c.g.id()).amount(),"80000","two principal debits");eq(c.p.balance(c.s.id()).amount(),"120000","two principal credits");});\n  Files.writeString(ROOT.resolve("evidence/results.json")');
fs.writeFileSync(root+'/TransferPlanningHarness.java',code);
const classpath=fs.readFileSync(process.env.QA_RUN_DIR?path.join(process.env.QA_RUN_DIR,'audit-classpath.txt'):'.qa/money-integrated-preflight/audit-classpath.txt','utf8');const javaHome='C:/Program Files/Eclipse Adoptium/jdk-21.0.12.8-hotspot';
const compile=spawnSync(javaHome+'/bin/javac.exe',['-encoding','UTF-8','-cp',classpath,'-d',root+'/classes',root+'/TransferPlanningHarness.java'],{stdio:'inherit'});if(compile.status!==0)process.exit(compile.status??1);
const hashes=folder=>Object.fromEntries(fs.readdirSync(folder,{recursive:true}).filter(file=>fs.statSync(path.join(folder,file)).isFile()).sort().map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,file))).digest('hex')]));
const sourceHashes=hashes('backend/src/main/java/com/kafka/backend/money'),compiledBefore=hashes('backend/build/classes/java/main/com/kafka/backend/money');
const run=spawnSync(javaHome+'/bin/java.exe',['-cp',root+'/classes;'+classpath,'com.kafka.backend.money.TransferPlanningHarness'],{stdio:'inherit'});
const compiledAfter=hashes('backend/build/classes/java/main/com/kafka/backend/money');
const revision=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();const dirty=spawnSync('git',['status','--porcelain'],{encoding:'utf8'}).stdout.length>0;
fs.writeFileSync(root+'/run-provenance.json',JSON.stringify({at:new Date().toISOString(),revision,dirty,originalSource:source,originalSha256:crypto.createHash('sha256').update(original).digest('hex'),executedSha256:crypto.createHash('sha256').update(code).digest('hex'),database:'OWNED_LOOPBACK_SYNTHETIC_55441',currentRepository:repo,sourceHashes,compiledBefore,compiledAfter,compiledStable:JSON.stringify(compiledBefore)===JSON.stringify(compiledAfter)},null,2));
if(run.status!==0)process.exit(run.status??1);const results=JSON.parse(fs.readFileSync(root+'/evidence/results.json','utf8'));if(results.length!==39||results.some(row=>row.status!=='PASS'))process.exit(1);
