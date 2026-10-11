import {randomUUID} from 'node:crypto';
import {test,expect} from '../../helpers/browser.mjs';
import {bookRow,pickCategory,saveChoice,filterBook} from './v2-compat.mjs';
test.describe.configure({mode:'serial',timeout:180000});
const base=()=>process.env.QA_API_URL+'/api/money';
async function call(request,url,method='GET',data){const response=await request.fetch(base()+url,{method,data});expect(response.ok(),method+' '+url+' '+response.status()+(response.ok()?'':' '+await response.text())).toBe(true);return response.status()===204?null:response.json();}
async function open(page,route){await page.setViewportSize({width:1920,height:1200});await page.goto('/money'+route);await expect(page.locator('.money-main')).toBeVisible();await expect(page.getByText('불러오는 중…',{exact:true})).toHaveCount(0);}
async function shot(page,info,label){await expect(page.locator('.money-read-status').filter({hasText:/불러오는 중…|갱신 중…/})).toHaveCount(0);await page.screenshot({path:info.outputPath(label+'-synthetic.png'),fullPage:label!=='bookkeeping-classification-rail'});}
function acknowledgeInjectedFailure(errors,path){const expected=errors.filter(e=>e.type==='http'&&e.status===503&&e.path===path||e.type==='console'&&e.message.includes('status of 503'));expect(expected.length).toBeGreaterThan(0);for(const error of expected)errors.splice(errors.indexOf(error),1);}
let account,loan,manual,root;
test.beforeAll(async({request})=>{
 account=await call(request,'/accounts','POST',{provider:'KAKAO',displayName:'수정 검증 생활비',role:'SPENDING',suffix:'8499'});
 await call(request,`/accounts/${account.id}/balance-records`,'POST',{type:'INITIAL_BALANCE',amount:200000,asOf:new Date(Date.now()-3600000).toISOString(),note:'Owned synthetic remediation fixture',expectedVersion:account.version});account=await call(request,'/accounts/'+account.id);
 manual=await call(request,'/transactions','POST',{type:'EXPENSE',fromAccountId:account.id,toAccountId:null,amount:3500,occurredAt:new Date().toISOString(),counterpartyText:'수정 검증 카페',title:'수정 검증 수동 내역',categoryId:null,memo:'되돌려도 유지할 메모',excluded:false});
 const tracking=await call(request,'/tracking');await call(request,'/tracking','PUT',{expense:[...new Set([...tracking.expense,account.id])],income:tracking.income,expectedVersion:tracking.version});
 root=await call(request,'/categories','POST',{name:'수정 검증 식사',color:'#336699',archived:false,sortOrder:0,kind:'EXPENSE'});
 loan=await call(request,'/loans','POST',{name:'수정 검증 대출',lender:'합성 기관',type:'PERSONAL',remainingPrincipal:90000,status:'ACTIVE'});
});
test('money.remediation.read-first',async({request,page},info)=>{
 // V2 uses one auto-save settings panel. Opening and closing without changes must be read-only.
 const before=await call(request,'/accounts/'+account.id);await open(page,'/accounts?account='+account.id);const detail=page.getByRole('complementary',{name:'계좌 설정'});
 await expect(detail.getByLabel('계좌명 · 필수')).toHaveValue(account.displayName);await expect(detail.getByText('196,500원',{exact:true})).toBeVisible();await expect(detail.getByRole('button',{name:'잔액 점검',exact:true}).first()).toBeVisible();await expect(page.locator('.money-drawer-backdrop')).toHaveCount(0);await shot(page,info,'accounts-settings-no-edit');
 await detail.getByRole('button',{name:'패널 닫기',exact:true}).click();expect(await call(request,'/accounts/'+account.id)).toEqual(before);

 await open(page,'/loans');await page.getByRole('button',{name:loan.name,exact:false}).first().click();const loanDetail=page.getByRole('complementary',{name:'대출 상세'});await expect(loanDetail.getByText('최근 상환 요약',{exact:true})).toBeVisible();await expect(loanDetail.getByText('90,000원',{exact:true})).toBeVisible();await shot(page,info,'loans-read-first');await loanDetail.getByRole('button',{name:'대출 정보 수정',exact:true}).click();await expect(page.locator('.money-dock input').first()).toBeVisible();
});
test('money.remediation.provenance',async({request,page})=>{
 const counter=await call(request,'/accounts','POST',{provider:'KAKAO',displayName:'수정 검증 자유적금',role:'SAVINGS',suffix:'8455'});expect(counter.id).toBeTruthy();const raw=(await call(request,'/notifications','POST',{sourcePackage:'com.kakaobank.channel',notificationKey:randomUUID(),idempotencyKey:randomUUID(),postedAt:new Date().toISOString(),title:'출금 10,000원',text:'입출금통장(8499) → 자유적금(8455) 잔액 186,500원'})).notification;await expect.poll(async()=>(await call(request,'/notifications/'+raw.id)).state).toBe('PROCESSED');const rows=await call(request,'/transactions?limit=100');const direct=rows.items.find(t=>t.id===manual.id);expect(direct.manual).toBe(true);expect(direct.sourceCount??direct.sources.length).toBe(0);
 await open(page,'/transactions');const directRow=page.getByRole('row').filter({hasText:'수정 검증 수동 내역'});await expect(directRow).toContainText('수동 금융 기록');
 const derived=rows.items.find(t=>!t.manual&&(t.sourceCount??t.sources.length)>0);expect(derived).toBeTruthy();await expect(page.getByText(/^원문 [0-9]+개/).first()).toBeVisible();
});
test('money.remediation.reconciliation-groups',async({request,page},info)=>{
 const cutoff=new Date().toISOString(),url=`/accounts/${account.id}/reconciliation-snapshot?cutoff=${encodeURIComponent(cutoff)}`;const before=await call(request,url);
 await call(request,'/notifications','POST',{sourcePackage:'com.example.unrelated',notificationKey:randomUUID(),idempotencyKey:randomUUID(),postedAt:new Date(Date.parse(cutoff)-60000).toISOString(),title:'다른 앱의 합성 안내',text:'선택한 금융 계좌와 관련 없는 원문'});
 const after=await call(request,url+'&token='+encodeURIComponent(before.token));expect(after.partial).toBe(before.partial);expect(after.unresolved).toBe(before.unresolved);expect(after.registeredBalance).toBe(before.registeredBalance);
 await open(page,'/reconciliation?account='+account.id);await expect(page.getByRole('heading',{name:'먼저 확인할 내역',exact:true})).toBeVisible();const supporting=page.locator('details').filter({has:page.locator('summary',{hasText:'같은 거래의 추가 알림'})});await expect(supporting).not.toHaveAttribute('open');await page.locator('summary').filter({hasText:'같은 값으로 들어간 거래'}).click();await expect(page.getByRole('heading',{name:'같은 값으로 들어간 거래',exact:true})).toBeVisible();await expect(page.locator('.money-reconciliation-table')).toContainText('수정 검증 수동 내역');await shot(page,info,'reconciliation-grouped');
});
test('money.remediation.dependent-failure',async({page,runtimeErrors},info)=>{
 await page.route('**/api/money/overview/current-stock',route=>route.fulfill({status:503,json:{message:'합성 조회 장애'}}));await open(page,'/accounts');await expect(page.getByRole('button',{name:'자산 합계 다시 불러오기',exact:true})).toBeVisible();await expect(page.locator('.money-account-groups')).toContainText(account.displayName);await shot(page,info,'accounts-stock-partial-failure');acknowledgeInjectedFailure(runtimeErrors,'/api/money/overview/current-stock');await page.unroute('**/api/money/overview/current-stock');
 await open(page,'');const kpi=await page.locator('.money-stock-kpis').first().innerText();await page.route('**/api/money/overview/spending-pace?*',route=>route.fulfill({status:503,json:{message:'합성 갱신 장애'}}));await page.getByRole('button',{name:'새로고침',exact:true}).click();await expect(page.getByRole('button',{name:'소비 속도 다시 불러오기',exact:true})).toBeVisible();await expect(page.locator('.money-spending-pace')).toContainText('이전 자료를 표시합니다');expect(await page.locator('.money-stock-kpis').first().innerText()).toBe(kpi);await shot(page,info,'overview-independent-freshness');acknowledgeInjectedFailure(runtimeErrors,'/api/money/overview/spending-pace');await page.unroute('**/api/money/overview/spending-pace?*');
});
test('money.remediation.book-classification-undo',async({request,page},info)=>{
 const before=await call(request,'/transactions/'+manual.id),trigger=()=>page.getByRole('button',{name:manual.title+' 직접 분류',exact:true});
 await open(page,'/bookkeeping');await page.getByRole('tab',{name:'최근 자동 분류',exact:true}).click();await expect(trigger()).toHaveCount(0);await page.getByRole('tab',{name:'미분류',exact:true}).click();await expect(trigger()).toBeVisible();await page.getByRole('tab',{name:'전체',exact:true}).click();await expect(trigger()).toBeVisible();
 await open(page,'/bookkeeping?transactionId='+manual.id);const row=bookRow(page,manual.title);await expect(row.locator('time')).toContainText(/\d{2}:\d{2}/);const panel=page.getByRole('complementary',{name:'AI 분류 근거 패널'});await expect(panel).toContainText(manual.title);await panel.getByRole('button',{name:'닫기',exact:true}).click();
 await pickCategory(page,manual.title,root);expect((await call(request,'/bookkeeping/'+manual.id)).categoryId).toBeNull();expect(await call(request,'/transactions/'+manual.id)).toEqual(before);
 await saveChoice(page,manual.title);await expect.poll(async()=>(await call(request,'/bookkeeping/'+manual.id)).categoryId).toBe(root.id);await expect(row.locator('.bk-v2-current-value')).toContainText('소분류 없음');await shot(page,info,'bookkeeping-v2-explicit-save-undo');
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();await page.getByRole('button',{name:'1건 함께 되돌리기',exact:true}).click();await expect.poll(async()=>(await call(request,'/bookkeeping/'+manual.id)).categoryId).toBeNull();const restored=await call(request,'/bookkeeping/'+manual.id);expect(restored.title).toBe(before.title);expect(restored.memo).toBe(before.memo);expect(await call(request,'/transactions/'+manual.id)).toEqual(before);
});
test('money.remediation.review-purpose-fallback',async({request,page},info)=>{
 const snapshots=await call(request,'/transactions/'+manual.id);expect(snapshots.currency).toBe('KRW');
 // Category-only work is excluded from the canonical notification/financial queue.
 const queue=await call(request,'/ai/workbench?state=PENDING');expect(queue.items.some(r=>r.id===manual.id)).toBe(false);
 await open(page,'/review');await expect(page.getByRole('region',{name:'검토 필요 알림 작업함'})).toBeVisible();await expect(page.getByRole('button',{name:/AI 추천/})).toHaveCount(0);await expect(page.locator('.money-notice-ledger')).not.toContainText(manual.title);
 // Exercise the actual V2 ledger's KRW fallback and selected-row evidence, without financial writes.
 await page.route('**/api/money/bookkeeping?*',async route=>{const response=await route.fetch(),value=await response.json();value.items=value.items.map(row=>row.id===manual.id?{...row,currency:null}:row);await route.fulfill({response,json:value});});
 await open(page,'/bookkeeping');await filterBook(page,manual.title);await expect(page.locator('.money-book-ledger tbody tr')).toHaveCount(1);let row=bookRow(page,manual.title);await expect(row).toContainText('3,500원');await expect(row.locator('time')).toContainText(/\d{2}:\d{2}/);await row.getByRole('button',{name:'근거',exact:true}).click();const panel=page.getByRole('complementary',{name:'AI 분류 근거 패널'});await expect(panel).toContainText(manual.title);await expect(panel).toContainText('기록된 추천 출처 없음');await shot(page,info,'bookkeeping-v2-krw-fallback-selected');await page.unroute('**/api/money/bookkeeping?*');
 // Existing one-transaction legacy request remains compatible and preserves financial facts.
 const book=await call(request,'/bookkeeping/'+manual.id),input={id:book.id,transactionVersion:book.transactionVersion,overrideVersion:book.version,projectionVersion:book.projectionVersion,classificationVersion:book.classificationVersion??0,categoryId:book.categoryId,directCorrection:false,thisTransactionOnly:false};
 const requested=await call(request,'/ai/classification/request','POST',{requestId:randomUUID(),items:[input],explanation:'합성 카페에서 구매한 간식'});expect(requested.status).toBe('APPLIED');expect(requested.result.queued).toBe(1);expect(await call(request,'/transactions/'+manual.id)).toEqual(snapshots);
 const alternate=await call(request,'/transactions','POST',{type:'EXPENSE',fromAccountId:account.id,toAccountId:null,amount:1200,occurredAt:new Date().toISOString(),counterpartyText:'수정 검증 행 전환',title:'수정 검증 수동 전환',categoryId:null,memo:null,excluded:false});
 await open(page,'/bookkeeping');await filterBook(page,'수정 검증 수동');await expect(page.locator('.money-book-ledger tbody tr')).toHaveCount(2);await bookRow(page,alternate.title).getByRole('button',{name:'근거',exact:true}).click();await expect(panel).toContainText(alternate.title);await bookRow(page,manual.title).getByRole('button',{name:'근거',exact:true}).click();await expect(panel).toContainText(manual.title);expect(await call(request,'/transactions/'+manual.id)).toEqual(snapshots);await shot(page,info,'v2-evidence-row-switching');
});
