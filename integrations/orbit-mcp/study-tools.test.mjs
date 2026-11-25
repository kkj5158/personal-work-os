import test from 'node:test';
import assert from 'node:assert/strict';
import {studyTools,callStudy,validateStudy} from './study-tools.mjs';
const id='f0a10000-0000-4000-8000-000000000001';
const cmd={sessionId:id,expectedRevision:1,operationKey:id};
const summary={title:'fixture',summary:'',topics:[],keyTakeaways:[],openQuestions:[],userInsights:[],summaryCoverage:'PARTIAL_CONTEXT'};
const span={effectiveStart:'2026-11-01T00:00:00Z',effectiveEnd:'2026-11-01T00:00:00Z',allocations:[{date:'2026-11-01',effectiveSeconds:0}]};
const fixtures={
    start_learning_session:{operationKey:id},get_current_learning_session:{},pause_learning_session:cmd,resume_learning_session:cmd,
    complete_learning_session:{...cmd,summary},cancel_learning_session:{...cmd,reason:'fixture'},
    save_learning_checkpoint:{...cmd,summary,lastQuestion:'fixture'},get_learning_context:{recentLimit:1},
    list_learning_sessions:{from:'2026-11-01',to:'2026-11-02'},get_learning_session:{sessionId:id},
    get_learning_statistics:{month:'2026-11'},update_learning_session:{...cmd,reason:'fixture',summary},
    create_manual_session:{operationKey:id,...span,reason:'fixture',summary},delete_learning_session:{...cmd,reason:'fixture'},
    restore_learning_session:{...cmd,reason:'fixture'}
};
for(const [key,args] of Object.entries(fixtures))test('STUDY contract '+key,async()=>{
    const name='study_'+key, d=validateStudy(name,args);
    assert.equal(studyTools.length,15);
    assert.equal(d.scope,d.method==='GET'?'orbit:read:study':'orbit:write:study');
    assert.throws(()=>validateStudy(name,{...args,ownerId:id}));
    let signed;
    const result=await callStudy(name,args,{origin:'https://workflow-api-development-development.up.railway.app',
        token:'fixture',proof:async request=>{signed=request;return 'fixture';},
        fetcher:async(url,init)=>{
            assert.equal(init.method,d.method);assert.equal(signed.path,url.pathname+url.search);
            assert.equal(init.headers['X-Orbit-Study-Proof'],'fixture');
            if(init.body)assert.equal(JSON.parse(init.body).sessionId,undefined);
            assert.ok(!url.pathname.includes('/activity/'));return new Response('{"verified":true}');
        }});
    assert.equal(result.verified,true);
});
