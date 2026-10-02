import {test,expect} from '../../helpers/browser.mjs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
const base=()=>process.env.QA_API_URL+'/api/money';
async function call(request,url,method='GET',data){const r=await request.fetch(base()+url,{method,data});expect(r.ok(),`${method} ${url}: ${r.status()} ${(await r.text()).slice(0,400)}`).toBe(true);return r.status()===204?null:r.json();}
const category=(name,kind='EXPENSE')=>({name,color:'#4F6BED',archived:false,kind,emoji:null,sortOrder:0,parentId:null});
let a,b,cat,survivor,one,two,transferOut,transferIn,mergeTx,raw,identity;
const tx=(type,account,amount,title,merchant,categoryId=null)=>({type,fromAccountId:type==='EXPENSE'?account:null,toAccountId:type==='INCOME'?account:null,amount,title,counterpartyText:merchant,categoryId,memo:'Synthetic AI fixture',occurredAt:'2026-10-02T01:00:00Z',excluded:false});
async function open(page,route,screen){await page.goto('/money'+route);await expect(page.locator(`[data-money-ai-screen="${screen}"]`)).toBeVisible();await expect(page.getByText('불러오는 중…',{exact:true})).toHaveCount(0);}
async function capture(page,screen){if(process.env.QA_SYSTEM==='money-ai-full')await page.screenshot({path:path.join(process.env.QA_RUN_DIR,screen+'-implementation-synthetic.png'),fullPage:true});}
const row=page=>page.locator('.money-ai-list tbody tr');
const decision=item=>({id:item.id,kind:item.kind,transactionVersion:item.transactionVersion??item.version,overrideVersion:item.overrideVersion,projectionVersion:item.projectionVersion,version:item.version});
test('money.ai.seed',async({request})=>{
 a=await call(request,'/accounts','POST',{provider:'CASH',displayName:'AI 검토 생활비',role:'CASH',maskedReference:null,suffix:null});b=await call(request,'/accounts','POST',{provider:'CASH',displayName:'AI 검토 저축',role:'CASH',maskedReference:null,suffix:null});
 cat=await call(request,'/categories','POST',category('AI 커피'));survivor=await call(request,'/categories','POST',category('AI 커피 카페'));
 one=await call(request,'/transactions','POST',tx('EXPENSE',a.id,1337,'AI 첫 거래','AI Fixture Coffee'));two=await call(request,'/transactions','POST',tx('EXPENSE',a.id,2337,'AI 다음 거래','AI Fixture Coffee'));
 transferOut=await call(request,'/transactions','POST',tx('EXPENSE',a.id,9111,'AI 이체 출금','AI owned transfer'));transferIn=await call(request,'/transactions','POST',tx('INCOME',b.id,9111,'AI 이체 입금','AI owned transfer'));
 raw=(await call(request,'/notifications','POST',{sourcePackage:'com.ibk.android.ionebank',title:'(광고) AI 안내',text:'최대 5,000원 혜택을 확인하세요',postedAt:new Date().toISOString(),idempotencyKey:randomUUID()})).notification;
});
test('money.ai.review-evidence-undo',async({page,request})=>{
 await open(page,'/review?ai=workbench','S01');await page.getByLabel('거래처·메모 검색').fill('AI 첫 거래');await row(page).getByRole('button').first().click();await expect(page.locator('.money-ai-decision')).toContainText('제안 없음');await capture(page,'S01');
 await page.getByRole('button',{name:'근거 상세 보기 ↗',exact:true}).click();await expect(page.locator('[data-money-ai-screen="S02"]')).toBeVisible();await expect(page.getByText('동일 결제명의 확정 이력이 없습니다.',{exact:true})).toBeVisible();await capture(page,'S02');
 await page.getByRole('button',{name:'검토 워크벤치',exact:true}).click();await page.getByRole('button',{name:'검토 카테고리',exact:true}).click();await page.locator('.category-picker-menu').getByRole('button',{name:/AI 커피$/}).click();await page.getByRole('button',{name:'확정 후 다음',exact:true}).click();await expect(page.getByText('이번 거래의 분류를 확정했습니다.',{exact:true})).toBeVisible();
 const fact=await call(request,'/transactions/'+one.id);expect(fact.categoryId).toBeNull();expect(fact.amount).toBe(one.amount);const proposed=await call(request,`/ai/items/${two.id}`);expect(proposed.proposal.categoryId).toBe(cat.id);
 await page.locator('.money-ai-toast').getByRole('button',{name:'실행 취소',exact:true}).click();await expect.poll(async()=>(await call(request,`/ai/items/${two.id}`)).proposal.basis).toBe('NONE');
});
test('money.ai.stale-and-noise',async({request})=>{
 const before=await call(request,`/ai/items/${one.id}`);const done=await call(request,'/ai/decisions','POST',{...decision(before),action:'CONFIRM',overrides:{title:'AI 확정된 제목'},reason:null});
 const latest=await call(request,`/bookkeeping/${one.id}`);await call(request,`/bookkeeping/${one.id}`,'PUT',{expectedVersion:latest.version,expectedTransactionVersion:latest.transactionVersion,expectedProjectionVersion:latest.projectionVersion,overrides:{title:'AI 나중 수정'}});
 expect((await request.post(base()+`/ai/events/${done.eventId}/undo`,{data:{}})).status()).toBe(409);expect((await call(request,`/transactions/${one.id}`)).title).toBe(one.title);
 await expect.poll(async()=>(await call(request,`/notifications/${raw.id}`)).processingReason,{timeout:30000}).toBe('IGNORED_NON_FINANCIAL');let r=await call(request,`/notifications/${raw.id}`);await call(request,`/notifications/${r.id}/restore`,'POST',{expectedVersion:r.processingVersion});r=await call(request,`/notifications/${r.id}`);
 const event=await call(request,'/ai/decisions','POST',{id:r.id,kind:'RAW',action:'NON_TRANSACTION',version:r.processingVersion});expect((await call(request,`/notifications/${r.id}`)).processingReason).toBe('USER_IGNORED_NON_FINANCIAL');await call(request,`/ai/events/${event.eventId}/undo`,'POST',{});expect((await call(request,`/notifications/${r.id}`)).state).toBe('REVIEW_REQUIRED');
});
test('money.ai.transfer',async({page,request})=>{
 await open(page,'/review?ai=transfers','S03');await expect(page.getByText('AI 검토 생활비 → AI 검토 저축',{exact:true})).toBeVisible();await capture(page,'S03');
 const before=(await call(request,'/transactions?limit=200')).total;const input={expenseId:transferOut.id,incomeId:transferIn.id,expenseVersion:transferOut.version,incomeVersion:transferIn.version,idempotencyKey:randomUUID()};const result=await call(request,'/ai/transfers/confirm','POST',input);const replay=await call(request,'/ai/transfers/confirm','POST',input);expect(replay.transaction.id).toBe(result.transaction.id);expect(result.transaction.type).toBe('TRANSFER');expect(result.transaction.amount).toBe(9111);expect((await call(request,'/transactions?limit=200')).total).toBe(before-1);expect((await call(request,`/transactions/${transferIn.id}`)).mergedInto).toBe(transferOut.id);
});
test('money.ai.merchant',async({page,request})=>{
 await open(page,'/classification?ai=merchants','S04');await page.getByRole('button',{name:'AI Fixture Coffee',exact:true}).click();await page.getByLabel('직접 입력 거래처 이름').fill('AI 실제 카페');await page.getByRole('button',{name:'직접 입력',exact:true}).click();await expect(page.locator('[data-money-ai-screen="S04"] [role="status"]')).toContainText('연결');await capture(page,'S04');identity=(await call(request,'/ai/merchants')).items.find(r=>r.descriptor==='AI Fixture Coffee');expect(identity.name).toBe('AI 실제 카페');expect((await call(request,`/transactions/${two.id}`)).categoryId).toBeNull();
 const lookup=await call(request,'/ai/lookup','POST',{descriptor:'공개 거래처'});expect(lookup.available).toBe(false);expect(['LOOKUP_DISABLED','PROVIDER_NOT_CONFIGURED']).toContain(lookup.errorCode);
});
test('money.ai.category-merge',async({page,request})=>{
 const fixtureIds=[cat.id,survivor.id];
 const actualProposal=(await call(request,'/ai/categories/proposals')).proposals.find(p=>p.action==='MERGE'&&fixtureIds.includes(p.sourceId)&&fixtureIds.includes(p.targetId)&&p.sourceId!==p.targetId);
 expect(actualProposal,'MERGE proposal between the two fixture categories').toBeTruthy();
 const actualSourceId=actualProposal.sourceId,actualTargetId=actualProposal.targetId;
 const names=new Map([[cat.id,cat.name],[survivor.id,survivor.name]]);
 mergeTx=await call(request,'/transactions','POST',tx('EXPENSE',a.id,987,'AI 병합 거래','AI merge merchant',actualSourceId));const item=await call(request,`/ai/items/${mergeTx.id}`);await call(request,'/ai/decisions','POST',{...decision(item),action:'CONFIRM',overrides:{categoryId:actualSourceId}});
 await open(page,'/classification?ai=categories','S05');await expect(page.getByRole('heading',{name:'AI 카테고리 관리',exact:true})).toBeVisible();
 const proposals=page.locator('.money-ai-category-layout > section').nth(1);
 await proposals.getByRole('button').filter({hasText:`${names.get(actualSourceId)} → ${names.get(actualTargetId)}`}).click();
 await page.getByLabel('병합 유지 카테고리').selectOption(actualTargetId);
 await page.getByRole('button',{name:'대상 기록·전체 참조 미리보기',exact:true}).click();
 await expect(page.locator('.money-ai-decision')).toContainText('정확한 영향 범위');
 await expect(page.getByRole('button',{name:'전체 참조 병합 승인',exact:true})).toBeVisible();
 await page.getByText(/대상 거래 \d+건 보기/).click();
 await expect(page.locator('.money-ai-decision')).toContainText('AI 병합 거래');
 await capture(page,'S05');
 const preview=await call(request,`/ai/categories/${actualSourceId}/preview?targetId=${actualTargetId}`);expect(preview.count).toBeGreaterThanOrEqual(1);
 await page.getByRole('button',{name:'전체 참조 병합 승인',exact:true}).click();
 await expect.poll(async()=>(await call(request,`/transactions/${mergeTx.id}`)).categoryId).toBe(actualTargetId);
 const changed=await call(request,`/transactions/${mergeTx.id}`);expect(changed.amount).toBe(987);expect(changed.categoryId).toBe(actualTargetId);expect((await call(request,`/bookkeeping/${mergeTx.id}`)).categoryId).toBe(actualTargetId);
});
test('money.ai.operations',async({page,request})=>{
 await open(page,'/classification?ai=operations','S06');await expect(page.getByText('승인한 거래처·계좌 규칙 자동 적용',{exact:true})).toBeVisible();await expect(page.getByLabel('승인한 거래처·계좌 규칙 자동 적용')).not.toBeChecked();await capture(page,'S06');const state=await call(request,'/ai/settings');expect(state.automaticRules).toBe(false);expect(state.externalLookup).toBe(false);const metrics=(await call(request,'/ai/operations')).metrics;expect(metrics.confirmed).toBeGreaterThanOrEqual(1);expect(metrics.reversed).toBeGreaterThanOrEqual(1);
});
