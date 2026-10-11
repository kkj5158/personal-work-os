import {randomUUID} from 'node:crypto';
import {test,expect} from '../../helpers/browser.mjs';

// The adapter owns the isolated MONEY schema and drops only that schema after runtime shutdown.
// No fixture cleanup touches public rows, and every mutation here targets returned synthetic IDs.
test.describe.configure({mode:'serial',timeout:180000});
test.use({actionTimeout:60000});
const prefix='MONEY V2 월간 '+randomUUID().slice(0,8),from='2021-02-01',to='2021-02-28';
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const base=()=>process.env.QA_API_URL+'/api/money';
const fixture={accounts:[],facts:[],expense:[],created:null};
let incomeRoot,incomeChild,expenseRoot,expenseChild,otherCategory;
async function call(request,url,method='GET',data){const response=await request.fetch(base()+url,{method,data});expect(response.ok(),`${method} ${url}: ${response.status()} ${response.ok()?'':await response.text()}`).toBe(true);return response.status()===204?null:response.json();}
const savings=request=>call(request,`/bookkeeping/savings?from=${from}&to=${to}&limit=50&offset=0`);
async function entry(request,input){const {label,...fields}=input;const fact=await call(request,'/transactions','POST',{occurredAt:'2021-02-15T01:00:00Z',excluded:false,title:prefix+' '+label,...fields});fixture.facts.push(fact);return fact;}
async function ready(page){await expect(page.locator('.money-main')).toBeVisible();await expect(page.locator('.money-read-status').filter({hasText:/불러오는 중…|갱신 중…/})).toHaveCount(0);}
async function monthly(page){await page.goto('/money/bookkeeping');await expect(page.locator('.money-month-summary')).toBeVisible();await page.locator('.money-period summary').click();await page.getByLabel('시작일',{exact:true}).fill(from);await page.getByLabel('종료일',{exact:true}).fill(to);await expect(page.getByTestId('effective-period')).toContainText(`${from} — ${to}`);await ready(page);await expect(page.locator('.money-month-kpis>section').nth(2)).toContainText('870,000원');}
const panel=page=>page.locator('.money-dock[aria-label="계좌 설정"]');
const card=(page,id)=>page.locator('.money-account-card').filter({hasText:fixture.accounts.find(a=>a.id===id).displayName});
async function openAccount(page,id){await page.goto('/money/accounts?account='+id);await ready(page);await expect(panel(page)).toBeVisible();await expect(panel(page).getByLabel('계좌명 · 필수',{exact:true})).toHaveValue(fixture.accounts.find(a=>a.id===id).displayName);}
async function screenshot(page,info,name){await ready(page);await page.screenshot({path:info.outputPath(name+'-actual-synthetic.png'),fullPage:true});}

test.beforeAll(async({request})=>{
 test.setTimeout(300000); // 58 real financial writes against the owned remote schema, with no mocked acknowledgements.
 expect(process.env.QA_SYSTEM).toBe('money-integrated-v2');
 expect(['127.0.0.1','localhost','[::1]']).toContain(new URL(process.env.QA_API_URL).hostname);
 for(const [role,label,emoji] of [['SPENDING','생활비','💳'],['SAVINGS','저축통장','🌱'],['PURPOSE_INSTALLMENT','적금통장','🏦']]){
  const a=await call(request,'/accounts','POST',{provider:'IBK',displayName:prefix+' '+label,role,emoji});fixture.accounts.push(a);
 }
 [incomeRoot,expenseRoot,otherCategory]=await Promise.all([
  call(request,'/categories','POST',{name:prefix+' 사업수입',kind:'INCOME',color:'#5b8def',sortOrder:0,archived:false}),
  call(request,'/categories','POST',{name:prefix+' 식비',kind:'EXPENSE',color:'#45ae99',sortOrder:0,archived:false}),
  call(request,'/categories','POST',{name:prefix+' 생활',kind:'EXPENSE',color:'#9771d7',sortOrder:1,archived:false}),
 ]);
 incomeChild=await call(request,'/categories','POST',{name:prefix+' 외주',parentId:incomeRoot.id,kind:'INCOME',color:'#5b8def',sortOrder:0,archived:false});
 expenseChild=await call(request,'/categories','POST',{name:prefix+' 카페',parentId:expenseRoot.id,kind:'EXPENSE',color:'#45ae99',sortOrder:0,archived:false});
 const tracking=await call(request,'/tracking');const ids=kind=>[...new Set([...tracking[kind],fixture.accounts[0].id])];
 expect(ids('expense').length).toBeLessThanOrEqual(5);expect(ids('income').length).toBeLessThanOrEqual(5);
 await call(request,'/tracking','PUT',{expense:ids('expense'),income:ids('income'),expectedVersion:tracking.version});
 const [living,saving,installment]=fixture.accounts;
 for(const [source,destination,amount,label] of [[living,saving,500000,'저축 500k'],[living,installment,300000,'적금 300k'],[living,saving,70000,'저축 70k'],[saving,living,100000,'인출 100k'],[saving,installment,200000,'저축 내부 재배치']])await entry(request,{type:'TRANSFER',fromAccountId:source.id,toAccountId:destination.id,amount,label});
 await entry(request,{type:'INCOME',fromAccountId:null,toAccountId:living.id,amount:3200000,categoryId:incomeChild.id,counterpartyText:prefix+' 사업 고객',label:'수입'});
 for(let i=0;i<52;i++)fixture.expense.push(await entry(request,{type:'EXPENSE',fromAccountId:living.id,toAccountId:null,amount:1000,categoryId:i<30?expenseChild.id:otherCategory.id,counterpartyText:prefix+' 카페',label:'소비 '+i}));
});

test('money.v2.monthly-savings',async({request,page},info)=>{
 const before=await savings(request);expect(before.totals).toMatchObject({gross:870000,withdrawals:100000,net:770000,analyticsUnavailable:false,unknownHistoryCount:0});expect(before.total).toBe(3);
 expect(before.totals.composition.map(s=>[s.accountId,s.amount]).sort()).toEqual([[fixture.accounts[1].id,570000],[fixture.accounts[2].id,300000]].sort());
 expect(before.items.map(row=>row.id)).not.toContain(fixture.facts[4].id);
 await page.setViewportSize({width:1920,height:1200});await monthly(page);
 const kpis=page.locator('.money-month-kpis>section');await expect(kpis).toHaveCount(4);await expect(kpis.nth(0)).toContainText('3,200,000원');await expect(kpis.nth(1)).toContainText('52,000원');await expect(kpis.nth(3)).toContainText('770,000원');
 await expect(page.locator('.money-month-donut')).toHaveCount(3);for(const ring of await page.locator('.money-month-ring').all()){const bounds=await ring.boundingBox();expect(bounds.width).toBeGreaterThanOrEqual(200);expect(bounds.width).toBeLessThanOrEqual(220);}
 await expect(page.locator('.money-book-ledger thead th')).toHaveCount(8);await expect(page.locator('.money-book-ledger tbody tr')).toHaveCount(50);const firstRowBounds=await page.locator('.money-book-ledger tbody tr').first().boundingBox();expect(firstRowBounds.height).toBeLessThanOrEqual(150);await info.attach('monthly-row-density',{body:Buffer.from(JSON.stringify({height:firstRowBounds.height,maxHeight:150,columns:8})),contentType:'application/json'});
 await screenshot(page,info,'monthly-four-kpis-three-donuts');await page.screenshot({path:info.outputPath('monthly-four-kpis-three-donuts-viewport.png'),fullPage:false});
});

test('money.v2.donut-filter',async({request,page},info)=>{
 await monthly(page);const baseline=await page.locator('.money-month-kpis').textContent(),centers=await page.locator('.money-month-center strong').allTextContents();
 const expenses=page.locator('.money-month-donut').nth(1);await expenses.locator('.money-month-legend').getByRole('button',{name:new RegExp(expenseRoot.name)}).click();
 await expect(page.locator('.money-month-filter')).toContainText(expenseRoot.name);await expect(page.locator('.money-book-ledger tbody tr')).toHaveCount(30);await expect(expenses.getByRole('button',{name:'상위 분류로',exact:true})).toBeVisible();
 await expenses.locator('.money-month-legend').getByRole('button',{name:new RegExp(expenseChild.name)}).click();await expect(page.locator('.money-month-filter')).toContainText(expenseChild.name);await expect(page.locator('.money-book-ledger tbody tr')).toHaveCount(30);
 expect(await page.locator('.money-month-kpis').textContent()).toBe(baseline);expect(await page.locator('.money-month-center strong').allTextContents()).toEqual(centers);
 await page.getByRole('button',{name:'필터 해제',exact:true}).click();
 await page.locator('.money-month-donut').nth(2).locator('.money-month-legend').getByRole('button',{name:new RegExp(fixture.accounts[1].displayName)}).click();
 await expect(page.getByRole('region',{name:'저축 입금 거래'})).toBeVisible();await expect(page.locator('.money-book-ledger tbody tr')).toHaveCount(2);await expect(page.locator('.money-book-ledger tbody')).toContainText(prefix+' 저축 500k');await expect(page.locator('.money-book-ledger tbody')).not.toContainText('내부 재배치');
 const filtered=await call(request,`/bookkeeping/savings?from=${from}&to=${to}&destinationAccountId=${fixture.accounts[1].id}`);expect(filtered.totals).toEqual((await savings(request)).totals);expect(filtered.total).toBe(2);
 expect(await page.locator('.money-month-kpis').textContent()).toBe(baseline);expect(await page.locator('.money-month-center strong').allTextContents()).toEqual(centers);await screenshot(page,info,'savings-destination-filter-month-totals');
 await page.getByRole('button',{name:'필터 해제',exact:true}).click();await expect(page.locator('.money-book-ledger tbody tr')).toHaveCount(50);
 const titleButton=page.locator('.money-book-ledger tbody tr').first().locator('.money-inline-view').first(),label=await titleButton.getAttribute('aria-label');expect(label).toMatch(/ 제목 편집$/);const originalTitle=label.replace(/ 제목 편집$/,''),original=fixture.expense.find(f=>f.title===originalTitle);expect(original).toBeTruthy();const financialBefore=await call(request,'/transactions/'+original.id),newTitle=originalTitle+' 화면 편집',newMemo='월간 메모 편집 · 원장 원본 보존';
 await titleButton.click();await page.getByLabel(originalTitle+' 제목',{exact:true}).fill(newTitle);await page.getByLabel(originalTitle+' 제목',{exact:true}).press('Enter');await expect.poll(async()=>(await call(request,'/bookkeeping/'+original.id)).title).toBe(newTitle);
 await page.getByRole('button',{name:newTitle+' 메모 편집',exact:true}).click();await page.getByLabel(newTitle+' 메모',{exact:true}).fill(newMemo);await page.getByLabel(newTitle+' 메모',{exact:true}).press('Enter');await expect.poll(async()=>(await call(request,'/bookkeeping/'+original.id)).memo).toBe(newMemo);expect(await call(request,'/transactions/'+original.id)).toEqual(financialBefore);expect(await page.locator('.money-month-kpis').textContent()).toBe(baseline);await screenshot(page,info,'monthly-inline-edit-ledger-source-preserved');
});

test('money.v2.account-panel-icons',async({request,page},info)=>{
 await page.setViewportSize({width:1920,height:1200});const a=fixture.accounts[0];await openAccount(page,a.id);await expect(page.locator('.money-account-group>header')).toHaveCount(3);await expect(card(page,a.id)).toContainText('💳');await expect(panel(page).getByLabel('계좌 이모지',{exact:true})).toHaveValue('💳');
 const collapse=page.locator('.money-account-group>header').first().getByRole('button');await collapse.click();await expect(card(page,a.id)).toHaveCount(0);await expect(panel(page).getByLabel('계좌명 · 필수',{exact:true})).toHaveValue(a.displayName);await collapse.click();await expect(card(page,a.id)).toContainText('💳');
 const alias=a.displayName+' 별칭';await panel(page).getByLabel('계좌명 · 필수',{exact:true}).fill(alias);await panel(page).getByLabel('계좌명 · 필수',{exact:true}).press('Tab');await expect.poll(async()=>(await call(request,'/accounts/'+a.id)).displayName).toBe(alias);fixture.accounts[0]=await call(request,'/accounts/'+a.id);expect(fixture.accounts[0].emoji).toBe('💳');await expect(card(page,a.id)).toContainText('💳');
 await panel(page).getByRole('textbox',{name:'계좌 메모',exact:true}).fill('항목별 즉시 저장 · 합성 데이터');await panel(page).getByRole('textbox',{name:'계좌 메모',exact:true}).press('Tab');await expect.poll(async()=>(await call(request,'/accounts/'+a.id)).memo).toBe('항목별 즉시 저장 · 합성 데이터');
 const originalFact=await call(request,'/transactions/'+fixture.facts[0].id),originalTracking=await call(request,'/tracking'),originalPreferences=await call(request,'/overview/preferences');expect((await call(request,'/accounts/'+a.id+'/deletion-eligibility')).allowed).toBe(false);await expect(panel(page).getByRole('button',{name:'참조 없는 계좌 삭제',exact:true})).toBeDisabled();page.once('dialog',d=>d.accept());await panel(page).getByRole('button',{name:'계좌 보관',exact:true}).click();await expect.poll(async()=>(await call(request,'/accounts/'+a.id)).archived).toBe(true);await expect(card(page,a.id)).toHaveCount(0);page.once('dialog',d=>d.accept());await panel(page).getByRole('button',{name:'보관 해제',exact:true}).click();await expect.poll(async()=>(await call(request,'/accounts/'+a.id)).archived).toBe(false);await expect(card(page,a.id)).toContainText('💳');expect(await call(request,'/transactions/'+fixture.facts[0].id)).toEqual(originalFact);expect(await call(request,'/tracking')).toEqual(originalTracking);expect(await call(request,'/overview/preferences')).toEqual(originalPreferences);fixture.accounts[0]=await call(request,'/accounts/'+a.id);
 await page.getByRole('button',{name:'+ 계좌 추가',exact:true}).click();const create=page.locator('.money-dock[aria-label="계좌 추가"]');await expect(create).toBeVisible();const name=prefix+' 화면 등록';await create.getByLabel('계좌명 · 필수',{exact:true}).fill(name);await create.getByRole('combobox',{name:'금융기관',exact:true}).selectOption('CASH');await create.getByRole('combobox',{name:'자금 그룹',exact:true}).selectOption('OTHER');expect((await call(request,'/accounts')).some(a=>a.displayName===name)).toBe(false);
 const createdResponse=page.waitForResponse(r=>r.url().endsWith('/mobile/accounts')&&r.request().method()==='POST');await create.getByRole('button',{name:'계좌 등록',exact:true}).click();const response=await createdResponse;expect(response.ok()).toBe(true);fixture.created=(await response.json()).account;await expect(panel(page)).toBeVisible();await expect(panel(page).getByLabel('계좌명 · 필수',{exact:true})).toHaveValue(name);expect((await call(request,'/accounts/'+fixture.created.id)).fundGroup).toBe('OTHER');await screenshot(page,info,'account-panel-minimal-create');
});

test('money.v2.account-history',async({request,page},info)=>{
 const a=fixture.accounts[0],before=await savings(request),tracking=await call(request,'/tracking'),preferences=await call(request,'/overview/preferences'),fact=await call(request,'/transactions/'+fixture.facts[0].id);
 await openAccount(page,a.id);await panel(page).getByRole('combobox',{name:'자금 그룹',exact:true}).selectOption('SAVINGS');await panel(page).getByRole('combobox',{name:'통장 유형',exact:true}).selectOption('SAVINGS_ACCOUNT');
 expect((await call(request,'/accounts/'+a.id)).fundGroup).toBe('LIVING');
 let confirmation;page.once('dialog',async dialog=>{confirmation=dialog.message();await dialog.accept();});const savedResponse=page.waitForResponse(r=>r.url().endsWith(`/accounts/${a.id}/fund`)&&r.request().method()==='PUT');await panel(page).getByRole('button',{name:'변경 영향 확인 · 확정',exact:true}).click();expect((await savedResponse).ok()).toBe(true);expect(confirmation).toContain('과거 통계는 바뀌지 않습니다');
 await expect.poll(async()=>(await call(request,'/accounts/'+a.id)).fundGroup).toBe('SAVINGS');fixture.accounts[0]=await call(request,'/accounts/'+a.id);expect(await savings(request)).toEqual(before);expect(await call(request,'/tracking')).toEqual(tracking);expect(await call(request,'/overview/preferences')).toEqual(preferences);expect(await call(request,'/transactions/'+fact.id)).toEqual(fact);
 const history=await call(request,`/accounts/${a.id}/fund-history`);expect(history.some(h=>h.fundGroup==='LIVING'&&h.effectiveAt===null)).toBe(true);const changed=history.find(h=>h.fundGroup==='SAVINGS'&&h.effectiveAt);expect(changed).toBeTruthy();expect(Date.parse(changed.effectiveAt)).toBeGreaterThan(Date.parse('2021-02-28T00:00:00Z'));
 const recentURL=`/bookkeeping/savings?from=${today.slice(0,7)}-01&to=${today}`,recent=await call(request,recentURL);expect(recent.totals.analyticsUnavailable).toBe(false);
 const occurredAt=new Date(Math.max(Date.now(),Date.parse(changed.effectiveAt))+1000).toISOString();
 await entry(request,{type:'TRANSFER',fromAccountId:a.id,toAccountId:fixture.accounts[1].id,amount:5000,occurredAt,label:'변경 이후 저축 내부'});
 expect((await call(request,recentURL)).totals).toEqual(recent.totals);
 await entry(request,{type:'TRANSFER',fromAccountId:a.id,toAccountId:fixture.created.id,amount:12000,occurredAt,label:'변경 이후 저축 인출'});
 const after=await call(request,recentURL);expect(after.totals.gross).toBe(recent.totals.gross);expect(after.totals.withdrawals).toBe(recent.totals.withdrawals+12000);expect(after.totals.net).toBe(recent.totals.net-12000);expect(await savings(request)).toEqual(before);
 await panel(page).locator('.money-account-settings-history summary').click();await expect(panel(page).locator('.money-account-settings-history')).toContainText('기존 통계 기준');await screenshot(page,info,'account-effective-history-preserved');
 const filteredResponse=page.waitForResponse(r=>{if(!r.url().includes('/api/money/transactions?'))return false;const q=new URL(r.url()).searchParams;return q.get('accountId')===a.id||q.get('accountIds')?.split(',').includes(a.id);});await panel(page).getByRole('button',{name:'이 계좌 거래 보기',exact:true}).first().click();await expect(page).toHaveURL(new RegExp('/money/transactions\\?account='+a.id));expect((await filteredResponse).ok()).toBe(true);await expect(page.getByRole('table',{name:'Transactions',exact:true})).toBeVisible();
 await openAccount(page,a.id);await panel(page).getByRole('button',{name:'잔액 점검',exact:true}).first().click();await expect(page).toHaveURL(new RegExp('/money/reconciliation\\?account='+a.id));await expect(page.getByRole('combobox',{name:'잔액 점검 계좌',exact:true})).toHaveValue(a.id);
});

test('money.v2.responsive',async({request,page},info)=>{
 const a=fixture.accounts[0];await page.setViewportSize({width:390,height:844});await openAccount(page,a.id);await expect(page.getByRole('dialog',{name:'계좌 설정',exact:true})).toBeVisible();await expect(panel(page).getByLabel('계좌 이모지',{exact:true})).toHaveValue('💳');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await panel(page).getByRole('textbox',{name:'계좌 메모',exact:true}).fill('좁은 화면 입력 보존 · 합성');await page.setViewportSize({width:1920,height:1200});await expect(panel(page).getByRole('textbox',{name:'계좌 메모',exact:true})).toHaveValue('좁은 화면 입력 보존 · 합성');await panel(page).getByRole('textbox',{name:'계좌 메모',exact:true}).press('Tab');await expect.poll(async()=>(await call(request,'/accounts/'+a.id)).memo).toBe('좁은 화면 입력 보존 · 합성');await screenshot(page,info,'account-responsive-input-preserved');
 await page.setViewportSize({width:390,height:844});await monthly(page);await expect(page.locator('.money-month-donut')).toHaveCount(3);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(page.locator('.money-book-ledger thead th')).toHaveCount(8);await screenshot(page,info,'monthly-responsive-donuts-scroll-table');
});
