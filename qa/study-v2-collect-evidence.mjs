// Local allowlisted evidence only. Never collects environment values, profiles or database folders.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),out=path.join(root,'docs/study-v2/evidence');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const save=async(name,value)=>fs.writeFile(path.join(out,name),JSON.stringify(value,null,2)+'\n');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
const audit=await read('.qa/study-v2/dev-db-audit.json');
await save('DEV_MIGRATION_AND_FLAGS.json',{observedAt:audit.observedAt,scope:audit.scope,history:audit.history,studyTables:audit.studyTables,flags:audit.flags});
const latest='.qa/study-v2/orbit-baseline/backend/build/test-results/test';
const classes=[];
for(const file of await fs.readdir(latest))if(file.endsWith('.xml')){
 const xml=await fs.readFile(path.join(latest,file),'utf8'),attrs=xml.match(/<testsuite\b([^>]*)>/)?.[1]??'';
 const count=k=>Number(attrs.match(new RegExp(`\\b${k}="([0-9]+)"`))?.[1]??0);
 classes.push({class:file.slice(5,-4),tests:count('tests'),failures:count('failures'),errors:count('errors'),skipped:count('skipped')});
}
await save('tests/BROAD_REGRESSION_SUMMARY.json',{
 latestUnrelatedUpstream:'33e406e1d4f4409503ea8e75918d9d34821fa46d',
 earlierBackendCandidate:{total:1553,passed:966,failed:4,skipped:583,finalSourceCertification:false},
 latestUpstreamBackendReproduction:classes,
 fullFrontendCandidate:{files:191,timedOutSeconds:300,completeSummary:false},
 latestUpstreamFrontendReproduction:{total:21,passed:18,failed:3,failedFiles:['app/calendar/calendarEditor.test.ts','app/workflow/TaskDetailPanel.test.tsx','app/workflow/TodayWiki.test.tsx']}
});
const raw=await read('.qa/study-v2/actual-generated.json');
await save('samples/ISOLATED_REAL_CODEX_QUESTION_ANSWER_SAMPLE.json',{scope:'Synthetic owned isolated run; captured from an earlier render-failure reproduction, not the later hosted workbook',...raw});
await save('REVISION_MANIFEST.json',{observedAt:new Date().toISOString(),coreCodeCommit:'070795bc82a85565b442d96949e54f5f93e7e319',finalUiCommit:'eee0cc749eca24279c014fa53189f12769f4b7d9',integratedCandidate:'71dd47c80b37aaa264d482425cebf19b4b453659',devCodeMerge:'f6e0d09bdfabeac460f220460989330b8514857d',backendTree:git('rev-parse','f6e0d09:backend'),frontendTree:git('rev-parse','f6e0d09:frontend'),v104Blob:git('rev-parse','f6e0d09:backend/src/main/resources/db/migration/V104__study_foundation.sql'),collectionHead:git('rev-parse','HEAD'),standaloneFontIncluded:false,credentialsIncluded:false});
const files=[];
async function visit(base){for(const item of await fs.readdir(base,{withFileTypes:true})){const p=path.join(base,item.name);if(item.isSymbolicLink())throw Error('EVIDENCE_SYMLINK_REJECTED');if(item.isDirectory())await visit(p);else if(item.name!=='SHA256_MANIFEST.json'){const relative=path.relative(out,p).replaceAll('\\','/');if(!/^[\x20-\x7e]+$/.test(relative)||/\.(ttf|woff|env|key|pem)$/i.test(relative)||/token|credential|pgdata|owned-pg|node_modules/i.test(relative))throw Error('EVIDENCE_ALLOWLIST_GUARD');const bytes=await fs.readFile(p);files.push({file:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
await visit(out);await save('SHA256_MANIFEST.json',files.sort((a,b)=>a.file.localeCompare(b.file)));console.log(JSON.stringify({files:files.length,status:'ALLOWLIST_EVIDENCE_SAVED'}));
