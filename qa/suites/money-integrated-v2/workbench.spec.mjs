import {randomUUID} from 'node:crypto';
import {test,expect} from '../../helpers/browser.mjs';

test.describe.configure({mode:'serial',timeout:180000});
test.use({actionTimeout:60000});
const R='/ai/classification/recommendations';
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const prefix='MONEY V2 작업대 합성 '+Date.now().toString(36);
const filters={from:today.slice(0,7)+'-01',to:today,kind:'EXPENSE',search:prefix,includeExcluded:false,classificationState:'ALL'};
const base=()=>process.env.QA_API_URL+'/api/money';
let account,root,child,other;const facts=[];
async function call(request,path,method='GET',data){
 const response=await request.fetch(base()+path,{method,data});
 expect(response.ok(),method+' '+path+' '+response.status()+' '+(response.ok()?'':await response.text())).toBe(true);
 return response.status()===204?null:response.json();
}
async function create(request,title){
 const fact=await call(request,'/transactions','POST',{type:'EXPENSE',fromAccountId:account.id,toAccountId:null,amount:1200,occurredAt:new Date().toISOString(),counterpartyText:prefix+' 카페',title:prefix+' '+title,categoryId:null,memo:'합성 구매 맥락',excluded:false});
 facts.push(fact);return fact;
}
async function draft(request,id){return (await call(request,R+'/drafts')).items.find(d=>d.transactionId===id);}
async function generate(request,ids){
 const preview=await call(request,R+'/preview','POST',{scope:'SELECTED',ids,filters});
 expect(preview.total).toBe(ids.length);expect(preview.targets).toHaveLength(ids.length);
 await call(request,R+'/start','POST',{requestId:randomUUID(),snapshotId:preview.id,fingerprint:preview.fingerprint,policyVersion:preview.policyVersion,confirmed:true});
 await expect.poll(async()=>{const run=await call(request,R+'/runs/'+preview.id);return (run.counts.QUEUED??0)+(run.counts.RUNNING??0);},{timeout:120000}).toBe(0);
 for(const id of ids){const d=await draft(request,id);expect(d?.status).toBe('ACTIVE');expect(d.saveEligible).toBe(true);}
 return preview;
}
function command(d,categoryId=d.active.categoryId){return {id:d.transactionId,draftId:d.id,revision:d.revision,categoryId,expectedStamp:d.active.stamp,thisTransactionOnly:false,compared:false};}
async function choose(request,item){const result=await call(request,R+'/choices','POST',{requestId:randomUUID(),item});expect(result.status).toBe('APPLIED');expect(result.result.classificationWrites).toBe(0);}
async function open(page){
 await page.goto('/money/workbench');await expect(page.locator('.bk-v2-workflow')).toBeVisible();
 await page.getByRole('textbox',{name:'가계부 검색',exact:true}).fill(prefix);
 await expect(page.locator('.money-book-ledger tbody')).toContainText(prefix);
}
function row(page,fact){return page.locator('.money-book-ledger tbody tr').filter({hasText:fact.title});}
async function stage(page,n){await page.locator('.bk-v2-workflow nav button').nth(n-1).click();await expect(page.locator('.bk-v2-workflow nav button').nth(n-1)).toHaveAttribute('aria-current','step');}
async function shot(page,info,name){const preview=page.locator('.bk-v2-preview-dialog[open]');if(await preview.count()){const bounds=await preview.boundingBox(),viewport=page.viewportSize();expect(Math.abs(bounds.x+bounds.width/2-viewport.width/2)).toBeLessThanOrEqual(2);expect(Math.abs(bounds.y+bounds.height/2-viewport.height/2)).toBeLessThanOrEqual(2);expect(bounds.width).toBeLessThanOrEqual(1100);expect(bounds.height).toBeLessThanOrEqual(viewport.height*.92+1);}await page.screenshot({path:info.outputPath(name+'-actual-synthetic.png'),fullPage:(await preview.count())===0});}

test.beforeAll(async({request})=>{
 test.setTimeout(300000); // Real owner-scoped setup must finish before exercising the UI.
 expect(process.env.QA_SYSTEM).toBe('money-integrated-v2');
 account=await call(request,'/accounts','POST',{provider:'IBK',displayName:prefix+' 계좌',role:'SPENDING'});
 root=await call(request,'/categories','POST',{name:prefix+' 식비',kind:'EXPENSE',archived:false,sortOrder:0,color:'#336699',iconType:'EMOJI',iconValue:'🍚'});
 child=await call(request,'/categories','POST',{name:prefix+' 커피',kind:'EXPENSE',parentId:root.id,archived:false,sortOrder:0,color:'#336699',iconType:'EMOJI',iconValue:'☕'});
 other=await call(request,'/categories','POST',{name:prefix+' 생활용품',kind:'EXPENSE',archived:false,sortOrder:0,color:'#663399',iconType:'EMOJI',iconValue:'🧴'});
 const tracking=await call(request,'/tracking');await call(request,'/tracking','PUT',{expense:[account.id],income:[],expectedVersion:tracking.version});
 // Deterministic recommendations come from an actual owner-approved rule, with external providers disabled by the owned runtime.
 await call(request,'/classification-rules','POST',{name:prefix+' 합성 승인 규칙',conditions:[{field:'type',operator:'EXACT',value:'EXPENSE'},{field:'accountId',operator:'EXACT',value:account.id},{field:'merchant',operator:'EXACT',value:prefix+' 카페'}],categoryId:child.id,status:'ACTIVE',sortOrder:0});
 for(let i=0;i<6;i++)await create(request,'초기 거래 '+i);
});

test('money.v2.workbench-stages',async({request,page},info)=>{
 await open(page);const stages=page.locator('.bk-v2-workflow nav button');await expect(stages).toHaveCount(4);
 for(const n of [4,2,1,3,1])await stage(page,n);
 await expect(page.getByRole('complementary',{name:'AI 분류 근거 패널'})).toHaveCount(0);
 const table=page.locator('.money-book-ledger:visible');await expect(table.locator('thead th')).toHaveCount(8);
 await page.getByRole('button',{name:/현재 페이지 [0-9]+건 선택/,exact:true}).click();await expect(stages.nth(1)).toHaveAttribute('aria-current','step');
 await expect(page.locator('.bk-v2-stage')).toContainText('선택 6건');
 // A filter change retains actual selected transaction IDs and explicitly reports the hidden ones.
 await page.getByRole('textbox',{name:'가계부 검색',exact:true}).fill(facts[0].title);
 await expect(page.locator('.bk-v2-stage')).toContainText('화면 밖 선택 5건');
 await page.getByRole('textbox',{name:'가계부 검색',exact:true}).fill(prefix);
 const summary=await call(request,R+'/summary','POST',filters);expect(summary.ALL).toBeGreaterThanOrEqual(6);
 await shot(page,info,'desktop-four-stages');await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await shot(page,info,'mobile-four-stages');
});

test('money.v2.recommendation-snapshot',async({request,page},info)=>{
 const protectedFact=facts[0],target=facts[1],current=await call(request,R+'/current/'+protectedFact.id);
 const original=await call(request,'/bookkeeping/'+protectedFact.id);
 await choose(request,{id:protectedFact.id,categoryId:other.id,expectedStamp:current.stamp,thisTransactionOnly:false,compared:false});
 expect(await call(request,'/bookkeeping/'+protectedFact.id)).toEqual(original);
 await open(page);await row(page,protectedFact).getByRole('checkbox',{name:protectedFact.title+' 선택',exact:true}).check();await row(page,target).getByRole('checkbox',{name:target.title+' 선택',exact:true}).check();await stage(page,2);
 const responsePromise=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(R+'/preview'));
 await page.getByRole('button',{name:'선택 2건 추천 미리보기',exact:true}).click();const preview=await (await responsePromise).json();
 expect(preview.total).toBe(1);expect(preview.targets.map(t=>t.id)).toEqual([target.id]);expect(preview.excluded.map(t=>t.id)).toEqual([protectedFact.id]);
 const dialog=page.getByRole('dialog',{name:'AI 추천 실행 전 검토',exact:true});await expect(dialog).toBeVisible();await expect(dialog).toContainText('꼭 확인하세요');
 await expect(dialog.getByRole('tabpanel')).toContainText(target.id);await expect(dialog.getByRole('button',{name:'1건 추천 실행',exact:true})).toBeEnabled();
 await shot(page,info,'recommend-eligible-table');await dialog.getByRole('tab',{name:'제외 항목 1',exact:true}).click();await expect(dialog.getByRole('tabpanel')).toContainText(protectedFact.id);await expect(dialog.getByRole('tabpanel')).toContainText('명시 선택 초안 보존');await shot(page,info,'recommend-excluded-table');
 await create(request,'미리보기 이후 새 거래');const fixed=await call(request,R+'/runs/'+preview.id+'/items');expect(fixed.items.map(i=>i.transactionId)).toEqual([target.id]);
 await dialog.getByRole('button',{name:'1건 추천 실행',exact:true}).click();await expect(dialog).toHaveCount(0);await expect.poll(async()=>(await draft(request,target.id))?.status,{timeout:120000}).toBe('ACTIVE');
 expect(await call(request,'/bookkeeping/'+protectedFact.id)).toEqual(original);expect((await call(request,R+'/choices')).items.find(c=>c.command.id===protectedFact.id).command.categoryId).toBe(other.id);
});

test('money.v2.adopt-without-save',async({request,page},info)=>{
 await generate(request,[facts[2].id,facts[3].id]);const ids=[facts[1].id,facts[2].id,facts[3].id];
 const before=new Map();const originalAi=new Map();for(const id of ids){before.set(id,await call(request,'/bookkeeping/'+id));originalAi.set(id,(await draft(request,id)).active);}
 await open(page);await stage(page,3);const review=page.getByRole('region',{name:'추천 초안 검토',exact:true});
 await review.locator('tbody tr.bk-v2-draft-row').filter({hasText:facts[1].title}).getByRole('button',{name:'추천 채택',exact:true}).click();
 await expect(page.locator('.bk-v2-workflow nav button').nth(3)).toHaveAttribute('aria-current','step');
 await expect.poll(async()=>(await call(request,R+'/choices')).items.some(c=>c.command.id===facts[1].id)).toBe(true);
 expect(await call(request,'/bookkeeping/'+facts[1].id)).toEqual(before.get(facts[1].id));expect((await draft(request,facts[1].id)).active).toEqual(originalAi.get(facts[1].id));
 await stage(page,3);await page.getByRole('button',{name:'검토 선택 추천 일괄 채택',exact:true}).click();
 await expect.poll(async()=>(await call(request,R+'/choices')).items.filter(c=>ids.includes(c.command.id)).length,{timeout:120000}).toBe(3);
  await expect(page.getByRole('button',{name:/저장 대기 [0-9]+건 선택/,exact:true})).toBeEnabled({timeout:120000});
 for(const id of ids){expect(await call(request,'/bookkeeping/'+id)).toEqual(before.get(id));expect((await draft(request,id)).active).toEqual(originalAi.get(id));expect((await call(request,'/transactions/'+id)).categoryId).toBeNull();}
 await page.reload();await expect(page.locator('.bk-v2-workflow')).toBeVisible();await stage(page,4);await expect(page.locator('.bk-v2-pending-choices')).toContainText(facts[1].title);await shot(page,info,'durable-adoption-without-save');
});

test('money.v2.direct-choice-save',async({request,page},info)=>{
 const fact=facts[4],before=await call(request,'/bookkeeping/'+fact.id),ledger=await call(request,'/transactions/'+fact.id);
 await open(page);await row(page,fact).getByRole('button',{name:fact.title+' 직접 분류',exact:true}).click();
 const picker=page.getByRole('dialog',{name:fact.title+' 카테고리 선택',exact:true});await expect(picker).toBeVisible();
 await picker.getByRole('button',{name:other.name,exact:false}).click();await picker.locator('.bk-v2-simple-create summary').click();const categoryName=prefix+' 화면에서 간단 생성';await picker.getByLabel('새 분류 이름',{exact:true}).fill(categoryName);
 const categoryResponse=page.waitForResponse(r=>r.url().endsWith('/api/money/categories')&&r.request().method()==='POST');await picker.getByRole('button',{name:'생성 후 선택',exact:true}).click();const createdResponse=await categoryResponse;expect(createdResponse.ok()).toBe(true);const createdCategory=await createdResponse.json();expect(createdCategory.parentId).toBe(other.id);await expect(picker).toContainText(categoryName);await shot(page,info,'simple-category-created-selection-no-ledger-write');
 expect(await call(request,'/bookkeeping/'+fact.id)).toEqual(before);expect(await call(request,'/transactions/'+fact.id)).toEqual(ledger);await picker.getByRole('button',{name:'선택 초안 적용 · 미저장',exact:true}).click();await expect(picker).toHaveCount(0);
 await expect.poll(async()=>(await call(request,R+'/choices')).items.find(c=>c.command.id===fact.id)?.command.categoryId).toBe(createdCategory.id);
 expect(await call(request,'/bookkeeping/'+fact.id)).toEqual(before);expect(await call(request,'/transactions/'+fact.id)).toEqual(ledger);
 await row(page,fact).getByRole('button',{name:'초안 저장',exact:true}).click();const preview=page.getByRole('dialog',{name:'분류 저장 전 검토',exact:true});await expect(preview).toBeVisible();await expect(preview.getByRole('tabpanel')).toContainText(fact.id);await expect(preview.getByRole('tabpanel')).toContainText(categoryName);await shot(page,info,'save-eligible-table');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(preview.getByRole('button',{name:'1건 저장',exact:true})).toBeVisible();await shot(page,info,'mobile-save-eligible-table-policy-footer');await page.setViewportSize({width:1440,height:1000});
 await preview.getByRole('button',{name:'1건 저장',exact:true}).click();await expect(preview).toHaveCount(0);await expect.poll(async()=>(await call(request,'/bookkeeping/'+fact.id)).categoryId).toBe(createdCategory.id);
 expect(await call(request,'/transactions/'+fact.id)).toEqual(ledger);expect((await call(request,R+'/choices')).items.some(c=>c.command.id===fact.id)).toBe(false);await shot(page,info,'exact-explicit-saved-choice');
 await page.getByRole('button',{name:/전체 거래/}).click();await row(page,fact).getByRole('checkbox',{name:fact.title+' 선택',exact:true}).check();await stage(page,2);await page.getByRole('button',{name:'선택 1건 추천 미리보기',exact:true}).click();const protectedPreview=page.getByRole('dialog',{name:'AI 추천 실행 전 검토',exact:true});await expect(protectedPreview).toBeVisible();await expect(protectedPreview.getByRole('button',{name:'0건 추천 실행',exact:true})).toBeDisabled();await protectedPreview.getByRole('tab',{name:'제외 항목 1',exact:true}).click();await expect(protectedPreview.getByRole('tabpanel')).toContainText(fact.id);await expect(protectedPreview.getByRole('tabpanel')).toContainText('이미 사용자 확정된 분류');await page.setViewportSize({width:390,height:844});await shot(page,info,'mobile-zero-eligible-protected-current-category');await protectedPreview.getByRole('button',{name:'계속 검토',exact:true}).click();
});

test('money.v2.partial-conflict-recovery',async({request,page,runtimeErrors},info)=>{
 const first=await create(request,'일부 성공 A'),conflict=await create(request,'최신값 충돌 B');await generate(request,[first.id,conflict.id]);
 for(const fact of [first,conflict])await choose(request,command(await draft(request,fact.id)));
 const oldConflict=await call(request,'/bookkeeping/'+conflict.id);await open(page);for(const fact of [first,conflict])await row(page,fact).getByRole('checkbox',{name:fact.title+' 선택',exact:true}).check();await stage(page,4);
 await page.getByRole('button',{name:'선택 2건 저장 미리보기',exact:true}).click();const preview=page.getByRole('dialog',{name:'분류 저장 전 검토',exact:true});await expect(preview.getByRole('button',{name:'2건 저장',exact:true})).toBeEnabled();
 // A real concurrent edit happens after the preview. The server must independently recheck every commit.
 await call(request,'/bookkeeping/'+conflict.id,'PUT',{expectedVersion:oldConflict.version,expectedTransactionVersion:oldConflict.transactionVersion,expectedProjectionVersion:oldConflict.projectionVersion,overrides:{...oldConflict.overrides,memo:'다른 세션의 실제 합성 변경'}});
 const saveResponse=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(R+'/save'));await preview.getByRole('button',{name:'2건 저장',exact:true}).click();const result=await (await saveResponse).json();
 expect(result.items.find(i=>i.transactionId===first.id).status).toBe('SAVED');expect(result.items.find(i=>i.transactionId===conflict.id).status).toBe('STALE_CONFLICT');
 await expect(page.getByRole('region',{name:'항목별 저장 결과',exact:true})).toContainText('최신 값 비교');expect((await call(request,R+'/choices')).items.some(c=>c.command.id===conflict.id)).toBe(true);expect((await call(request,R+'/choices')).items.some(c=>c.command.id===first.id)).toBe(false);expect((await call(request,'/bookkeeping/'+conflict.id)).memo).toBe('다른 세션의 실제 합성 변경');
 const excluded=await call(request,R+'/save-preview','POST',{ids:[conflict.id]});expect(excluded.ready).toHaveLength(0);expect(excluded.excluded).toHaveLength(1);await shot(page,info,'real-partial-conflict');await stage(page,4);await page.getByRole('button',{name:'선택 1건 저장 미리보기',exact:true}).click();const zeroSave=page.getByRole('dialog',{name:'분류 저장 전 검토',exact:true});await expect(zeroSave.getByRole('button',{name:'0건 저장',exact:true})).toBeDisabled();await zeroSave.getByRole('tab',{name:'제외 항목 1',exact:true}).click();await expect(zeroSave.getByRole('tabpanel')).toContainText(conflict.id);await shot(page,info,'save-zero-eligible-conflict-excluded');await zeroSave.getByRole('button',{name:'계속 검토',exact:true}).click();
 const lost=await create(request,'실제 커밋 뒤 응답 유실');await generate(request,[lost.id]);await choose(request,command(await draft(request,lost.id)));await open(page);
 let originalCommand,posts=0;await page.route('**/ai/classification/recommendations/save',async route=>{posts++;originalCommand=route.request().postDataJSON();const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');});
 await row(page,lost).getByRole('button',{name:'초안 저장',exact:true}).click();await page.getByRole('dialog',{name:'분류 저장 전 검토',exact:true}).getByRole('button',{name:'1건 저장',exact:true}).click();
 const lookup=page.getByRole('button',{name:'원래 저장 요청 결과 조회',exact:true});await expect(lookup).toBeVisible();await expect(lookup).toBeEnabled({timeout:120000});expect(originalCommand.requestId).toBeTruthy();expect(posts).toBe(1);
 await page.unroute('**/ai/classification/recommendations/save');const committed=await call(request,'/ai/classification/items/'+lost.id);const outcome=await call(request,R+'/save-outcomes/'+originalCommand.requestId);expect(outcome.items[0].status).toBe('SAVED');
 const lookupResponse=page.waitForResponse(r=>r.request().method()==='GET'&&r.url().endsWith(R+'/save-outcomes/'+originalCommand.requestId));await lookup.click();expect((await lookupResponse).ok()).toBe(true);await expect(lookup).toHaveCount(0);expect(await call(request,'/ai/classification/items/'+lost.id)).toEqual(committed);expect(posts).toBe(1);
 const controlled=runtimeErrors.filter(error=>error.type==='console'&&error.message==='Failed to load resource: net::ERR_FAILED');expect(controlled).toHaveLength(1);runtimeErrors.splice(runtimeErrors.indexOf(controlled[0]),1);
 await info.attach('controlled-response-loss',{body:Buffer.from(JSON.stringify({actualSaveCommittedBeforeAbort:true,originalRequestId:originalCommand.requestId,savePosts:posts,sameRequestOutcomeVerified:true,duplicateCommit:false})),contentType:'application/json'});await shot(page,info,'original-request-recovery');
});
