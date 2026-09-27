import '../money/bridge.spec.mjs';
import {test,expect} from '../../helpers/browser.mjs';
import path from 'node:path';
// Imported Bridge suite establishes the shared serial lifecycle.
const api=()=>process.env.QA_API_URL+'/api/money';
const now=new Date(),at=new Date(now.getTime()-180000).toISOString();
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const from=today.slice(0,7)+'-01',to=new Date(Date.UTC(+today.slice(0,4),+today.slice(5,7),0)).toISOString().slice(0,10);
let hub,spend,gate,saving,cash,category,expense,loan;
async function call(request,url,method='GET',data){const r=await request.fetch(api()+url,{method,data});expect(r.ok(),method+' '+url+' HTTP '+r.status()).toBe(true);return r.status()===204?null:r.json();}
const entry=(type,fromAccountId,toAccountId,amount,title,extra={})=>({type,fromAccountId,toAccountId,amount,title,occurredAt:at,counterpartyText:'Synthetic party',categoryId:null,memo:null,excluded:false,...extra});
const dock=page=>page.locator('.money-dock');
async function open(page,route,title){await page.goto('/money'+route);await expect(page.getByRole('heading',{name:title,level:1,exact:true})).toBeVisible();}
async function save(page){await dock(page).getByRole('button',{name:/^(계좌 )?저장$/,exact:true}).click();await expect(dock(page)).toHaveCount(0);}
async function capture(page,file){await page.screenshot({path:path.join(process.env.QA_RUN_DIR,file+'-synthetic.png'),fullPage:true});}
async function search(page,title){await page.getByLabel('거래 검색').fill(title);await expect(page.getByRole('button',{name:title,exact:true})).toBeVisible();await page.getByRole('button',{name:title,exact:true}).click();}
test('money.phase2.seed',async({request})=>{
 category=await call(request,'/categories','POST',{name:'QA food',color:'#D86F72',archived:false});
 const account=(displayName,role)=>call(request,'/accounts','POST',{provider:role==='CASH'?'CASH':'IBK',displayName,role});
 hub=await account('QA income','INCOME_HUB');spend=await account('QA spending','SPENDING');gate=await account('QA gateway','SAVINGS_GATEWAY');saving=await account('QA savings','SAVINGS');cash=await account('QA reconciliation','CASH');
 await call(request,`/accounts/${hub.id}/balance-checkpoints`,'POST',{amount:10000,verifiedAt:new Date(now.getTime()-300000).toISOString(),note:'Synthetic baseline',expectedVersion:hub.version});
 await call(request,'/transactions','POST',entry('INCOME',null,hub.id,1000,'QA salary'));
 await call(request,'/transactions','POST',entry('TRANSFER',hub.id,spend.id,200,'QA spending allocation'));
 await call(request,'/transactions','POST',entry('TRANSFER',hub.id,gate.id,500,'QA saving boundary'));
 await call(request,'/transactions','POST',entry('TRANSFER',gate.id,saving.id,500,'QA saving hop'));
 await call(request,'/transactions','POST',entry('TRANSFER',saving.id,spend.id,100,'QA saving recovery'));
 expense=await call(request,'/transactions','POST',entry('EXPENSE',spend.id,null,100,'QA meal',{categoryId:category.id}));
 await call(request,'/transactions','POST',entry('REFUND',null,spend.id,40,'QA refund',{refundOf:expense.id}));
 loan=await call(request,'/loans','POST',{name:'QA loan',lender:'Synthetic lender',type:'PERSONAL',remainingPrincipal:1000,originalPrincipal:1200,status:'ACTIVE',paymentAccountId:spend.id,interestRate:4.5,monthlyPayment:120,nextDueDate:today});
});
test('money.phase2.overview',async({page,request})=>{
 test.setTimeout(120000);await open(page,'','Overview');
 const data=await call(request,`/overview?from=${from}&to=${to}`);expect(data.kpis).toMatchObject({income:1000,consumption:60,savings:400,assets:10940,loans:1000});
 await expect(page.getByLabel('계좌 그룹별 순자금 흐름')).toBeVisible();await expect(page.locator('.money-kpis .money-metric')).toHaveCount(5);
 await expect(page.getByRole('heading',{name:'수입 구성',exact:true})).toBeVisible();await expect(page.locator('.money-donut')).toHaveCount(2);await expect(page.getByRole('heading',{name:'자산 현황',exact:true})).toBeVisible();await capture(page,'01-overview-main');
 for(const label of ['1주','1개월','분기','6개월','1년']){await page.getByRole('button',{name:label,exact:true}).click();await expect(page.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');const period=await page.getByTestId('effective-period').textContent();await page.getByLabel('이전 기간').click();await expect(page.getByTestId('effective-period')).not.toHaveText(period);await page.getByLabel('다음 기간').click();await expect(page.getByTestId('effective-period')).toHaveText(period);}
 await page.getByRole('button',{name:'1개월',exact:true}).click();await page.getByText('기간 직접 선택',{exact:true}).click();await page.getByLabel('시작일',{exact:true}).fill(today);await page.getByLabel('종료일',{exact:true}).fill(today);await expect(page.getByTestId('effective-period')).toHaveText(today+' — '+today);
});
test('money.phase2.flow',async({page,request})=>{
 await open(page,'','Overview');await page.getByRole('button',{name:/저축 · 적금 순증감/}).click();await expect(page).toHaveURL(/\/money\/flow$/);
 await expect(page.locator('.money-kpis')).toHaveCount(0);await expect(page.locator('.money-donut')).toHaveCount(0);
 const detail=await call(request,`/flow?from=${from}&to=${to}&relation=SAVINGS`);expect(detail.summary.net).toBe(400);expect(detail.items.reduce((s,t)=>s+t.contribution,0)).toBe(400);expect(detail.total).toBe(2);
 await expect(page.locator('.money-flow-total')).toContainText('400');await expect(page.locator('.money-main tbody tr')).toHaveCount(2);
 await page.locator('.money-flow-contribution').first().click();await expect(page.locator('.money-main tbody tr')).toHaveCount(1);await page.getByRole('button',{name:'관계 전체',exact:true}).click();await expect(page.locator('.money-main tbody tr')).toHaveCount(2);await capture(page,'02-flow-drilldown');
 await page.getByRole('button',{name:'Transactions에서 보기 →',exact:true}).click();await expect(page).toHaveURL(/\/money\/transactions$/);await expect(page.locator('.money-flow-context')).toContainText('저축');await expect(page.locator('.money-main tbody tr')).toHaveCount(2);
});
test('money.phase2.ledger',async({page,request})=>{
 test.setTimeout(120000);await open(page,'/transactions','Transactions');
 const accounts=page.getByRole('group',{name:'계좌',exact:true});await accounts.getByRole('button',{name:'QA income',exact:true}).click();await accounts.getByRole('button',{name:'QA gateway',exact:true}).click();await expect(accounts.getByRole('button',{name:'QA gateway',exact:true})).toHaveAttribute('aria-pressed','false');await expect(accounts.getByRole('button',{name:'QA income',exact:true})).toHaveAttribute('aria-pressed','false');await accounts.getByRole('button',{name:'QA spending',exact:true}).dblclick();await expect(accounts.locator('button[aria-pressed=true]')).toHaveCount(1);await accounts.getByRole('button',{name:'전체 해제',exact:true}).click();await expect(page.locator('.money-main tbody tr')).toHaveCount(0);await accounts.getByRole('button',{name:'전체 선택',exact:true}).click();
 const types=page.getByRole('group',{name:'거래 유형',exact:true});await types.getByRole('button',{name:'소비',exact:true}).dblclick();await expect(page.locator('.money-main tbody tr')).toHaveCount(1);await types.getByRole('button',{name:'전체 선택',exact:true}).click();
 const categories=page.getByRole('group',{name:'카테고리',exact:true});await categories.getByRole('button',{name:'QA food',exact:true}).dblclick();await expect(page.locator('.money-main tbody tr')).toHaveCount(2);await categories.getByRole('button',{name:'전체 선택',exact:true}).click();
 await search(page,'QA meal');await expect(dock(page).getByLabel('제목',{exact:true})).toBeEditable();await expect(dock(page).locator('details[open]')).toHaveCount(0);await dock(page).getByLabel('제목',{exact:true}).fill('QA meal corrected');page.once('dialog',d=>d.dismiss());await page.getByLabel('패널 닫기').click();await expect(dock(page)).toBeVisible();await save(page);await expect(page.getByRole('button',{name:'QA meal corrected',exact:true})).toBeVisible();expect((await call(request,'/transactions/'+expense.id)).title).toBe('QA meal corrected');
 await page.getByLabel('거래 검색').fill('');await page.getByRole('button',{name:'QA meal corrected',exact:true}).click();await dock(page).getByLabel('제목',{exact:true}).fill('UNSAVED');page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'QA salary',exact:true}).click();await expect(dock(page).getByLabel('제목',{exact:true})).toHaveValue('UNSAVED');page.once('dialog',d=>d.accept());await dock(page).getByRole('button',{name:'취소',exact:true}).click();
 for(const title of ['QA salary','QA spending allocation','QA refund','QA meal corrected']){await search(page,title);await expect(dock(page).getByLabel('금액 (KRW)',{exact:true})).toBeEditable();await page.getByLabel('패널 닫기').click();}
 await page.getByLabel('거래 검색').fill('');await page.getByRole('button',{name:'QA meal corrected',exact:true}).click();await capture(page,'03-transactions-main-panel');await dock(page).getByText('시스템 정보',{exact:true}).click();await expect(dock(page).getByText(/정규 거래 ID:/)).toBeVisible();await page.getByLabel('패널 닫기').click();await page.reload();await expect(page.getByRole('button',{name:'QA meal corrected',exact:true})).toBeVisible();
});
test('money.phase2.balances',async({page,request})=>{
 test.setTimeout(120000);await open(page,'/accounts','Accounts');const card=()=>page.locator('.money-account-card').filter({hasText:'QA reconciliation'});await card().click();await dock(page).getByRole('button',{name:'초기 잔액 등록',exact:true}).click();await dock(page).getByLabel('초기 잔액',{exact:true}).fill('100');await save(page);await expect(card()).toContainText('100');
 await card().click();await dock(page).getByRole('button',{name:'잔액 맞추기',exact:true}).click();await expect(dock(page).getByText('100원',{exact:true})).toBeVisible();await dock(page).getByLabel('확인한 실제 잔액',{exact:true}).fill('150');await dock(page).getByLabel('보정 사유',{exact:true}).fill('Synthetic verified reconciliation');await save(page);await expect(card()).toContainText('150');
 const data=await call(request,`/overview?from=${from}&to=${to}`);expect(data.kpis).toMatchObject({income:1000,consumption:60,savings:400,assets:11090});
 await card().click();await dock(page).getByText('잔액 근거 · 이번 달 집계',{exact:true}).click();await expect(dock(page).getByText('Synthetic verified reconciliation',{exact:false})).toBeVisible();await capture(page,'09-accounts-panel');await page.getByLabel('패널 닫기').click();
 await open(page,'/transactions','Transactions');await page.getByRole('group',{name:'거래 유형',exact:true}).getByRole('button',{name:'잔액 보정',exact:true}).dblclick();await page.getByRole('button',{name:'잔액 맞추기',exact:true}).click();await expect(dock(page).getByText(/수입·소비·순저축에서 제외/)).toBeVisible();await capture(page,'04-balance-adjustment');await page.getByLabel('패널 닫기').click();
 await open(page,'/accounts','Accounts');await card().click();page.once('dialog',d=>d.accept());await dock(page).getByRole('button',{name:'계좌 보관',exact:true}).click();await expect(card()).toContainText('보관됨');expect((await call(request,`/transactions?accountId=${cash.id}`)).total).toBe(2);
});
test('money.phase2.loans',async({page,request})=>{
 test.setTimeout(150000);await open(page,'/loans','Loans');const card=()=>page.locator('.money-loan-card').filter({hasText:'QA loan'});await card().click();await dock(page).getByLabel('대출 메모',{exact:true}).fill('Synthetic loan note');await save(page);await card().click();await dock(page).getByRole('button',{name:'상환 기록',exact:true}).click();await dock(page).getByLabel('총 납부액',{exact:true}).fill('120');await dock(page).getByLabel('원금 · 이자 · 수수료 구성을 확인했습니다').check();await dock(page).getByLabel('원금',{exact:true}).fill('100');await dock(page).getByLabel('이자',{exact:true}).fill('15');await dock(page).getByLabel('수수료',{exact:true}).fill('5');await save(page);await expect(card()).toContainText('900');
 await card().click();await dock(page).getByRole('button',{name:'상환 기록',exact:true}).click();await dock(page).getByLabel('총 납부액',{exact:true}).fill('80');await expect(dock(page).getByText(/구성 미확인 · 총 납부액만 기록/)).toBeVisible();await save(page);await expect(card()).toContainText('900');await card().click();await expect(page.getByRole('table',{name:'상환 이력',exact:true}).locator('tbody tr')).toHaveCount(2);await capture(page,'10-loans-repayment-history');
 await dock(page).getByLabel('대출 상태',{exact:true}).selectOption('PAUSED');await save(page);let overview=await call(request,`/overview?from=${from}&to=${to}`);expect(overview.kpis.loans).toBe(0);await card().click();await dock(page).getByLabel('대출 상태',{exact:true}).selectOption('ACTIVE');await save(page);overview=await call(request,`/overview?from=${from}&to=${to}`);expect(overview.kpis).toMatchObject({loans:900,consumption:80,savings:400,loanPrincipal:100,unresolvedLoanPayments:80});
 await open(page,'/transactions','Transactions');await page.getByRole('group',{name:'거래 유형',exact:true}).getByRole('button',{name:'대출 상환',exact:true}).dblclick();await expect(page.locator('.money-main tbody tr')).toHaveCount(2);await page.locator('.money-main tbody button').first().click();await expect(dock(page).getByLabel('총 납부액',{exact:true})).toBeEditable();await capture(page,'05-loan-payment');
});
test('money.phase2.pagination',async({page,request})=>{
 test.setTimeout(120000);for(let i=0;i<55;i++)await call(request,'/transactions','POST',entry('EXPENSE',spend.id,null,1,'QA page '+String(i).padStart(2,'0')));
 await open(page,'/transactions','Transactions');await page.getByLabel('거래 검색').fill('QA page');await expect(page.locator('.money-main tbody tr')).toHaveCount(50);await page.getByRole('button',{name:'다음',exact:true}).click();await expect(page.locator('.money-main tbody tr')).toHaveCount(5);await page.getByRole('button',{name:'이전',exact:true}).click();await expect(page.locator('.money-main tbody tr')).toHaveCount(50);
});
test('money.phase2.compatibility',async({page,request})=>{
 for(const [route,title] of [['/bookkeeping','가계부'],['/review','Review Required'],['/settings','Settings']])await open(page,route,title);
 const book=await call(request,`/bookkeeping?from=${from}&to=${to}&kind=EXPENSE&limit=200`);expect(book.items.filter(t=>t.title==='QA loan 상환')).toHaveLength(1);expect(book.items.find(t=>t.title==='QA loan 상환').amount).toBe(20);
});
