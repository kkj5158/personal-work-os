import {randomUUID} from 'node:crypto';
import {test,expect} from '../../helpers/browser.mjs';
test.describe.configure({mode:'serial'});
const api=()=>process.env.QA_API_URL+'/api/money';
async function call(request,url,method='GET',data){const r=await request.fetch(api()+url,{method,data});expect(r.ok(),method+' '+url+' '+r.status()).toBe(true);return r.status()===204?null:r.json();}
const now=new Date(),at=new Date(now.getTime()-60000).toISOString(),opening=new Date(now.getTime()-120000).toISOString();
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),from=today.slice(0,7)+'-01',to=today;
let accounts=[],expense,loan;
const entry=(type,fromAccountId,toAccountId,amount,title,extra={})=>({type,fromAccountId,toAccountId,amount,title,occurredAt:at,counterpartyText:'Revision synthetic',categoryId:null,memo:null,excluded:false,...extra});
async function open(page,route,title){await page.goto('/money'+route);await expect(page.getByRole('heading',{name:title,level:1,exact:true})).toBeVisible();await expect(page.locator('.money-main [role=alert]')).toHaveCount(0);}
async function shot(page,testInfo,name){await page.screenshot({path:testInfo.outputPath(name+'.png'),fullPage:true});}
test.beforeAll(async({request})=>{
 expect(process.env.QA_SYSTEM).toBe('money-revision');
 for(let i=0;i<11;i++){let a=await call(request,'/accounts','POST',{provider:i===0?'IBK':'KAKAO',displayName:'Revision account '+i,role:i===1?'SAVINGS':i===2?'CASH':'SPENDING',suffix:i===0?'0909':String(7100+i)});await call(request,`/accounts/${a.id}/balance-records`,'POST',{type:'INITIAL_BALANCE',amount:100000,asOf:opening,note:'Disposable QA opening',expectedVersion:a.version});a=await call(request,'/accounts/'+a.id);accounts.push(a);}
 expense=await call(request,'/transactions','POST',entry('EXPENSE',accounts[0].id,null,12000,'Revision expense'));
 await call(request,'/transactions','POST',entry('REFUND',null,accounts[0].id,2000,'Revision refund',{refundOf:expense.id}));
 await call(request,'/transactions','POST',entry('TRANSFER',accounts[1].id,accounts[0].id,25000,'Revision savings return'));
 loan=await call(request,'/loans','POST',{name:'Revision missing schedule',lender:'Synthetic lender',loanType:'PERSONAL',remainingPrincipal:2000000,status:'ACTIVE'});
});
test('money.revision.overview-preferences',async({request,page},info)=>{
 const tracking=await call(request,'/tracking'),prefs=await call(request,'/overview/preferences');
 const ids=accounts.slice(0,10).reverse().map(a=>a.id);await call(request,'/overview/preferences','PUT',{accountIds:ids,expectedVersion:prefs.version});
 expect(await call(request,'/tracking')).toEqual(tracking);
 await page.setViewportSize({width:1920,height:1080});await open(page,'','Overview');await expect(page.locator('.money-stock-kpis .money-metric')).toHaveCount(4);await expect(page.locator('.money-representative-grid>button')).toHaveCount(5);await expect(page.locator('.money-representative-grid>button').first()).toContainText(accounts[9].displayName);await shot(page,info,'A_overview');await page.getByRole('button',{name:'더 보기 5개',exact:true}).click();await expect(page.locator('.money-representative-grid>button')).toHaveCount(10);await shot(page,info,'A_more');
 await page.getByRole('button',{name:/대표 계좌 설정/}).click();const dialog=page.getByRole('dialog',{name:'대표 계좌 설정'});await expect(dialog).toBeVisible();await expect(dialog.getByLabel(accounts[10].displayName,{exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});
test('money.revision.stock-scopes',async({request,page})=>{
 const stock=await call(request,'/overview/current-stock'),row=stock.currencies[0];expect(row.totalLoans).toBeGreaterThanOrEqual(2000000);expect(row.currentTotal).toBe(row.includedAssets-row.totalLoans);expect(row.currentTotal).toBeLessThan(0);
 await page.setViewportSize({width:1920,height:1080});await open(page,'','Overview');const before=await page.locator('.money-stock-kpis').textContent();await page.getByLabel('이전 기간').click();await expect(page.locator('.money-stock-kpis')).toHaveText(before);
 const pace=await call(request,`/overview/spending-pace?from=${from}&to=${today}`);expect(pace.buckets.every(b=>b.date<=today)).toBe(true);
});
test('money.revision.transactions-rails',async({page},info)=>{
 await page.setViewportSize({width:1920,height:1080});await open(page,'/transactions','Transactions');await expect(page.locator('.money-dock-idle')).toBeVisible();const idle=await page.locator('.money-dock-idle').boundingBox();expect(idle.width).toBe(384);const list=await page.getByRole('table',{name:'Transactions'}).boundingBox();await shot(page,info,'B_idle');
 await page.getByRole('button',{name:'Revision expense',exact:true}).click();await expect(page.getByRole('complementary',{name:'거래 상세'})).toBeVisible();const selected=await page.locator('.money-dock').boundingBox();expect(selected.x).toBe(idle.x);expect(selected.width).toBe(idle.width);expect((await page.getByRole('table',{name:'Transactions'}).boundingBox()).width).toBe(list.width);await shot(page,info,'B_transactions');
 await page.getByLabel('거래 검색').fill('definitely absent');await expect(page.locator('.money-dock-idle')).toBeVisible();await expect(page.locator('tr.selected')).toHaveCount(0);
 await page.getByLabel('거래 검색').fill('Revision expense');await page.setViewportSize({width:760,height:900});await page.getByRole('button',{name:'Revision expense',exact:true}).click();await expect(page.getByRole('dialog',{name:'거래 상세'})).toHaveAttribute('aria-modal','true');expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');await shot(page,info,'B_narrow');await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'거래 상세'})).toHaveCount(0);expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
});
test('money.revision.accounts-loans',async({page},info)=>{
 await page.setViewportSize({width:1920,height:1080});await open(page,'/accounts','Accounts');await page.getByLabel('계좌 검색').fill('Revision account');await expect(page.locator('.money-compact-account')).toHaveCount(11);await expect(page.locator('.money-compact-accounts')).toContainText('기타');await expect(page.locator('.money-compact-accounts')).toContainText('수동 기준점');await shot(page,info,'D_accounts');
 await page.getByRole('button',{name:/Revision account 0/}).first().click();await expect(page.locator('.money-dock')).toContainText('잔액 대사');await expect(page.locator('.money-dock').getByRole('button',{name:'잔액 맞추기',exact:true})).toHaveCount(0);await page.getByLabel('패널 닫기').click();
 await open(page,'/loans','Loans');await expect(page.locator('.money-compact-loans')).toContainText('설정 확인 필요');await expect(page.locator('.money-compact-loans')).toContainText('미등록');await shot(page,info,'F_loans');
});
test('money.revision.reconciliation',async({request,page},info)=>{
 const local=new Date(now.getTime()+9*3600000).toISOString(),minute=local.slice(5,10).replace('-','/')+' '+local.slice(11,16);
 const raw=await call(request,'/notifications','POST',{sourcePackage:'com.ibk.android.ionebank',idempotencyKey:randomUUID(),notificationKey:randomUUID(),postedAt:now.toISOString(),title:'입출금',text:`[출금] 1,000원 QA 0909 ${minute} / 잔액 50,000원`});
 await expect.poll(async()=>(await call(request,'/notifications/'+raw.notification.id)).state).not.toBe('CAPTURED');
 const rows=await call(request,'/reconciliation');expect(rows.some(r=>r.status==='ANCHORED')).toBe(true);
 await page.setViewportSize({width:1920,height:1080});await open(page,'/reconciliation','잔액 대사');await expect(page.locator('.money-financial-notice').first()).toContainText('독립적으로 검증된 일치가 아닙니다');await shot(page,info,'E_reconciliation');
 const row=rows.find(r=>r.accountId===accounts[0].id);if(row.status==='MISMATCH'){await page.getByRole('row').filter({hasText:'Revision account 0'}).getByRole('button',{name:'차이 조사'}).click();await page.getByLabel('조사 후에도 차이가 남아 수동 기준점 적용을 검토합니다.').check();await page.getByRole('button',{name:'잔액 조정 검토',exact:true}).click();const dialog=page.getByRole('dialog',{name:'잔액 조정 확인'});await expect(dialog.getByRole('button',{name:'수동 기준점 적용',exact:true})).toBeDisabled();await dialog.getByLabel('사유 · 필수').fill('Synthetic investigation completed');await shot(page,info,'E_adjustment');const before=await call(request,`/overview?from=${from}&to=${to}`);await dialog.getByRole('button',{name:'수동 기준점 적용',exact:true}).click();await expect(dialog).toHaveCount(0);const after=await call(request,`/overview?from=${from}&to=${to}`);expect(after.kpis.consumption).toBe(before.kpis.consumption);expect((await call(request,'/reconciliation')).find(r=>r.accountId===accounts[0].id).status).toBe('ANCHORED');}
});
test('money.revision.nonhappy',async({page,runtimeErrors},info)=>{
 await page.route('**/api/money/overview/preferences',route=>route.abort());await open(page,'','Overview').catch(()=>{});await expect(page.getByRole('button',{name:'대표 계좌 다시 불러오기'})).toBeVisible();await expect(page.locator('.money-stock-kpis .money-metric')).toHaveCount(4);await shot(page,info,'partial-error');await page.unroute('**/api/money/overview/preferences');await page.getByRole('button',{name:'대표 계좌 다시 불러오기'}).click();await expect(page.getByRole('button',{name:'대표 계좌 다시 불러오기'})).toHaveCount(0);
 await open(page,'/accounts','Accounts');for(let i=runtimeErrors.length-1;i>=0;i--)if(runtimeErrors[i].type==='console'&&runtimeErrors[i].message.includes('net::ERR_FAILED'))runtimeErrors.splice(i,1);await page.getByLabel('계좌 검색').fill('no matching accounts');await expect(page.getByText('선택한 조건의 계좌가 없습니다.')).toBeVisible();
});
test('money.revision.mobile-regression',async({request})=>{
 const a=await call(request,'/accounts/'+accounts[1].id),tracking=await call(request,'/tracking'),prefs=await call(request,'/overview/preferences');await call(request,`/accounts/${a.id}/fund`,'PUT',{fundGroup:'SAVINGS',savingsSubtype:'INSTALLMENT',expectedVersion:a.version});const latest=await call(request,'/accounts/'+a.id);expect(latest.role).toBe(a.role);expect(latest.fundGroup).toBe('SAVINGS');expect(latest.savingsSubtype).toBe('INSTALLMENT');expect(await call(request,'/tracking')).toEqual(tracking);expect(await call(request,'/overview/preferences')).toEqual(prefs);
});
