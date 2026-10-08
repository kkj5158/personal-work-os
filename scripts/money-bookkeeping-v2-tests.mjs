import {loadEnvironment} from '../qa/runtime/environment.mjs';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const {values}=await loadEnvironment(root);
const dir=path.join(root,'.qa','money-bookkeeping-v2');await fs.mkdir(dir,{recursive:true});
await fs.writeFile(path.join(dir,'test-logging.init.gradle'),"allprojects { tasks.withType(Test).configureEach { testLogging { events 'passed', 'failed', 'skipped' } } }\n");
const requested=process.argv.slice(2);for(const name of requested)assertName(name);function assertName(name){if(!/^com\.kafka\.backend\.money\.[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)?$/.test(name))throw Error('EXPLICIT_MONEY_TEST_REQUIRED');}
const args=['/d','/c','gradlew.bat','test','--no-daemon','--console=plain','--init-script',path.join(dir,'test-logging.init.gradle'),'--tests','com.kafka.backend.money.MoneyRecommendationPostgresTest',...['automatedMeaningPersistsAndProviderReceivesOnlyMinimizedInput','lateProviderCannotOverwriteDirectChoiceOrLatestTitle','directReferenceIsContextScopedAndStickyExclusionSurvivesResave','newestValidSameContextDirectCorrectionWinsAndLiveLeasePreventsDuplicateProviderCall','retainedAuditExpiryDoesNotDeleteCurrentMeaningAndUndoPreservesLaterDeferredReview','classificationUndoPreservesLaterDeferOrReopenAndProtectsLaterDirectClassification'].flatMap(name=>['--tests','com.kafka.backend.money.MoneyClassificationPostgresTest.'+name]),'--tests','com.kafka.backend.money.MoneyClassificationContextTest'];
if(requested.length){args.splice(args.indexOf('--tests'));args.push(...requested.flatMap(name=>['--tests',name]));}
const child=spawn('cmd.exe',args,{cwd:path.join(root,'backend'),env:{...process.env,...values},windowsHide:true});
let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{let text=chunk.toString();for(const key of ['DEV_DB_URL','DEV_DB_USERNAME','DEV_DB_PASSWORD'])text=text.replaceAll(values[key],'[REDACTED]');output+=text;process.stdout.write(text);});
const code=await new Promise(resolve=>child.on('exit',resolve));const stamp=new Date().toISOString().replaceAll(':','-');await fs.writeFile(path.join(dir,'targeted-backend-'+stamp+'.log'),output);await fs.writeFile(path.join(dir,'targeted-backend.log'),output);const results=path.join(dir,'results-'+stamp);await fs.mkdir(results);for(const file of await fs.readdir(path.join(root,'backend/build/test-results/test')))if(file.endsWith('.xml'))await fs.copyFile(path.join(root,'backend/build/test-results/test',file),path.join(results,file));process.exitCode=code??1;
