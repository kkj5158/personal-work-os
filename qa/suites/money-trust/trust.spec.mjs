import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {test,expect} from '../../helpers/browser.mjs';

// MONEY Trust Pass. Synthetic records only, inside the run-owned isolated schema with the real scheduler.
// Scenarios are ordered and share fixtures; the imported Bridge suite already sets the serial lifecycle.
const api=()=>process.env.QA_API_URL+'/api/money';
const dock=p=>p.locator('.money-dock:not(.money-dock-idle)');
const rows=p=>p.locator('.money-main .meaning-review tbody tr');
async function call(request,url,method='GET',data){const r=await request.fetch(api()+url,{method,data});expect(r.ok(),`${method} ${url} status ${r.status()}`).toBe(true);return r.status()===204?null:r.json();}
async function open(p,route,title){await p.goto('/money'+route);await expect(p.locator('.money-header h1')).toHaveText(title);await expect(p.getByText('불러오는 중…',{exact:true})).toHaveCount(0);}
async function capture(p,name){await p.screenshot({path:path.join(process.env.QA_RUN_DIR,name+'-synthetic.png'),fullPage:false});}
const now=Date.now(),ago=s=>new Date(now-s*1000);
const kst=(d,second=false)=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(d).map(x=>[x.type,x.value]));return `${p.month}/${p.day} ${p.hour}:${p.minute}`+(second?':'+p.second:'');};
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
const from=today.slice(0,7)+'-01',to=today;
const raw=(request,sourcePackage,title,text,postedAt)=>call(request,'/notifications','POST',{sourcePackage,notificationKey:'trust-'+randomUUID(),idempotencyKey:randomUUID(),postedAt:postedAt.toISOString(),title,text}).then(r=>r.notification);
const state=async(request,id)=>(await call(request,'/notifications/'+id)).state;
const kpis=async request=>(await call(request,`/overview?from=${from}&to=${to}`)).kpis;
const entry=(type,fromAccountId,toAccountId,amount,title,occurredAt)=>({type,fromAccountId,toAccountId,amount,title,occurredAt:occurredAt.toISOString(),counterpartyText:'Synthetic trust',categoryId:null,memo:null,excluded:false});
let gateway,living,recon,opening,closed,other,split,ad,otp,format,pairOut,pairIn,expenseA,incomeA,expenseB,incomeB,closedTx,baseline;

test('money.trust.seed',async({request})=>{
 const account=(provider,displayName,role,extra={})=>call(request,'/accounts','POST',{provider,displayName,role,maskedReference:null,suffix:null,...extra});
 gateway=await account('KAKAO','신뢰게이트','SAVINGS_GATEWAY',{suffix:'9001'});
 living=await account('WOORI','신뢰생활비','SPENDING',{maskedReference:'1002-900-900***'});
 recon=await account('IBK','신뢰대조','SPENDING',{maskedReference:'900-******-01-900'});
 opening=await account('CASH','신뢰시작잔액','CASH');closed=await account('IBK','신뢰보관계좌','SPENDING');split=await account('IBK','신뢰분리','SPENDING');other=await account('SHINHAN','신뢰수입','INCOME_HUB');
 await call(request,'/categories/defaults','POST',{});
 baseline=await kpis(request);
 // 1) Noise and unknown format from an allow-listed bank app.
 ad=await raw(request,'com.kakaobank.channel','(광고) 신뢰 가을 이벤트','최대 5,000원 혜택을 확인하세요',ago(70));
 otp=await raw(request,'com.kakaobank.channel','신뢰 인증번호','인증번호 482913 을 입력하세요',ago(69));
 format=await raw(request,'com.kakaobank.channel','신뢰 승인','[승인] 12,000원 가맹점 일시불',ago(68));
 // 2) Owned transfer whose two sides lack automatic evidence (different counterparty text, 40s apart).
 pairOut=await raw(request,'com.kakaobank.channel','출금 7,700원','신뢰게이트(9001) → 표기다름 잔액 100,000원',ago(60));
 pairIn=await raw(request,'com.wooribank.smart.npib','입출금',`[입금] 본인　　　 7,700원 1002-900-900***계좌 잔액 50,000원 ${kst(ago(20),true)}`,ago(20));
 // 3) Bank-reported balances: two same-minute facts that reconcile, then one the ledger cannot explain.
 const t1=ago(58),t2=ago(52),t3=ago(30);
 await raw(request,'com.ibk.android.ionebank','입출금',`[입금] 100,000원 급여 신뢰회사 900-******-01-900 ${kst(t1)} / 잔액 100,000원`,t1);
 await raw(request,'com.ibk.android.ionebank','입출금',`[출금] 30,000원 카드결제 신뢰가게 900-******-01-900 ${kst(t2)} / 잔액 70,000원`,t2);
 await raw(request,'com.ibk.android.ionebank','입출금',`[출금] 5,000원 카드결제 신뢰편의점 900-******-01-900 ${kst(t3)} / 잔액 60,000원`,t3);
 // 4) Already-posted expense + income pairs that look like owned transfers.
 expenseA=await call(request,'/transactions','POST',entry('EXPENSE',split.id,null,4400,'신뢰 분리 출금 A',ago(600)));incomeA=await call(request,'/transactions','POST',entry('INCOME',null,other.id,4400,'신뢰 분리 입금 A',ago(540)));
 expenseB=await call(request,'/transactions','POST',entry('EXPENSE',split.id,null,3300,'신뢰 실제 지출 B',ago(1200)));incomeB=await call(request,'/transactions','POST',entry('INCOME',null,other.id,3300,'신뢰 실제 수입 B',ago(1170)));
 // 5) History on an account that is archived afterwards.
 closedTx=await call(request,'/transactions','POST',entry('EXPENSE',closed.id,null,1500,'신뢰 보관 전 지출',ago(900)));
 closed=await call(request,'/accounts/'+closed.id+'/archive','PUT',{expectedVersion:closed.version,archived:true});
});

test('money.trust.noise-lanes',async({page,request})=>{
 test.setTimeout(240000);
 await expect.poll(()=>state(request,ad.id),{timeout:30000}).toBe('PROCESSED');expect((await call(request,'/notifications/'+ad.id)).processingReason).toBe('IGNORED_NON_FINANCIAL');
 await expect.poll(()=>state(request,otp.id),{timeout:30000}).toBe('PROCESSED');await expect.poll(()=>state(request,format.id),{timeout:30000}).toBe('REVIEW_REQUIRED');
 await open(page,'/review','Review Required');await expect(page.locator('.money-dock-idle')).toBeVisible();
 // Primary decision queue: neither noise nor unknown formats.
 for(const title of ['(광고) 신뢰 가을 이벤트','신뢰 인증번호','신뢰 승인'])await expect(rows(page).filter({hasText:title})).toHaveCount(0);
 await page.getByRole('tab',{name:/알림 형식 확인/}).click();const unknown=rows(page).filter({hasText:'신뢰 승인'});await expect(unknown).toContainText('알 수 없는 알림 형식');await expect(unknown).not.toContainText('UNRECOGNIZED_SHAPE');await capture(page,'T1-review-format-lane');
 await page.getByRole('tab',{name:'무시된 알림',exact:true}).click();const ignored=page.locator('.money-main tbody tr');await expect(ignored.filter({hasText:'(광고) 신뢰 가을 이벤트'})).toContainText('자동 무시');await expect(ignored.filter({hasText:'신뢰 인증번호'})).toHaveCount(1);await capture(page,'T2-review-ignored-lane');
 // Restore keeps the original evidence and returns it to Review; nothing reached the ledger.
 await ignored.filter({hasText:'신뢰 인증번호'}).getByRole('button',{name:'검토로 되돌리기',exact:true}).click();await expect(ignored.filter({hasText:'신뢰 인증번호'})).toHaveCount(0);expect(await state(request,otp.id)).toBe('REVIEW_REQUIRED');
 expect((await call(request,'/notifications/'+otp.id)).text).toBe('인증번호 482913 을 입력하세요');
 // Bulk "not a transaction" from the format lane.
 await page.getByRole('tab',{name:/알림 형식 확인/}).click();await rows(page).filter({hasText:'신뢰 승인'}).getByRole('checkbox').check();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'선택 1건 거래 아님으로 처리',exact:true}).click();await expect(rows(page).filter({hasText:'신뢰 승인'})).toHaveCount(0);
 expect((await call(request,'/notifications/'+format.id)).processingReason).toBe('USER_IGNORED_NON_FINANCIAL');
 expect(await state(request,ad.id)).toBe('PROCESSED');
});

test('money.trust.transfer-pair',async({page,request})=>{
 test.setTimeout(300000);
 // Conservative automation: after the wait, both sides require a decision instead of becoming expense + income.
 await expect.poll(()=>state(request,pairOut.id),{timeout:200000,intervals:[5000]}).toBe('REVIEW_REQUIRED');await expect.poll(()=>state(request,pairIn.id),{timeout:60000}).toBe('REVIEW_REQUIRED');
 // Explicit card payment / payroll fixtures post after the same wait; settle them before taking the KPI baseline.
 await expect.poll(async()=>(await call(request,`/transactions?accountId=${recon.id}&types=INCOME,EXPENSE&limit=50`)).total,{timeout:120000,intervals:[5000]}).toBe(3);
 const before=await kpis(request);
 await open(page,'/review','Review Required');const out=rows(page).filter({hasText:'출금 7,700원'});await expect(out).toContainText('상대 계좌 미확인');await expect(out).toContainText('이체 짝 후보');
 const width=async()=>(await page.locator('.money-main').boundingBox()).width;const idle=await width();
 await out.getByRole('button',{name:'상세 확인',exact:true}).click();await expect(dock(page).getByRole('heading',{name:'내 계좌 간 이체로 확정'})).toBeVisible();expect(await width()).toBe(idle);
 await expect(dock(page).getByLabel('처리 단계')).toContainText('짝이 되는 반대 방향 알림 1건');await expect(dock(page).getByLabel('출금 계좌')).toHaveValue(gateway.id);await expect(dock(page).getByLabel('입금 계좌')).toHaveValue(living.id);await capture(page,'T3-review-transfer-pair');
 // A lone confirmation of one side warns instead of silently splitting the transfer.
 await dock(page).getByRole('button',{name:'이 알림만 따로 확인',exact:true}).click();await expect(dock(page).getByRole('note')).toContainText('이체로 확정하세요');
 // New facts never offer archived accounts; categories follow the transaction type.
 await expect(dock(page).getByLabel('출금 계좌').locator('option',{hasText:'신뢰보관계좌'})).toHaveCount(0);
 await dock(page).getByRole('button',{name:'소비 카테고리',exact:true}).click();let menu=dock(page).locator('.category-picker-menu');await expect(menu.getByRole('button',{name:/식비$/}).first()).toBeVisible();await expect(menu.getByRole('button',{name:/근로소득$/})).toHaveCount(0);await dock(page).getByRole('button',{name:'소비 카테고리',exact:true}).click();
 await dock(page).getByLabel('유형').selectOption('INCOME');await dock(page).getByRole('button',{name:'수입 카테고리',exact:true}).click();menu=dock(page).locator('.category-picker-menu');await expect(menu.getByRole('button',{name:/근로소득$/}).first()).toBeVisible();await expect(menu.getByRole('button',{name:/식비$/})).toHaveCount(0);await capture(page,'T4-income-categories-only');await dock(page).getByRole('button',{name:'수입 카테고리',exact:true}).click();
 await dock(page).getByRole('note').getByRole('button',{name:'두 알림을 이체 1건으로 확정',exact:true}).click();
 await dock(page).getByRole('button',{name:'이체 1건으로 확정',exact:true}).click();
 // After processing, the workbench moves to the next item without closing the column.
 await expect(rows(page).filter({hasText:'출금 7,700원'})).toHaveCount(0);await expect(dock(page)).toBeVisible();expect(await width()).toBe(idle);
 expect(await state(request,pairOut.id)).toBe('PROCESSED');expect(await state(request,pairIn.id)).toBe('PROCESSED');
 const posted=(await call(request,`/transactions?accountId=${living.id}&limit=50`)).items;expect(posted.length).toBe(1);expect(posted[0].type).toBe('TRANSFER');expect(posted[0].fromAccountId).toBe(gateway.id);expect((await call(request,'/transactions/'+posted[0].id)).sources.length).toBe(2);
 const after=await kpis(request);expect(after.income).toBe(before.income);expect(after.consumption).toBe(before.consumption);
});

test('money.trust.posted-pair',async({page,request})=>{
 const before=await kpis(request);
 await open(page,'/review','Review Required');const a=rows(page).filter({hasText:'신뢰 분리 출금 A'});await expect(a).toContainText('내 계좌 간 이체로 보임');
 await a.getByRole('button',{name:'상세 확인',exact:true}).click();await expect(dock(page).getByRole('heading',{name:'내 계좌 간 이체 확인'})).toBeVisible();await expect(dock(page).locator('.money-pair-card')).toContainText('60초');await capture(page,'T5-review-posted-pair');
 await dock(page).getByRole('button',{name:'하나의 이체로 묶기',exact:true}).click();await expect(rows(page).filter({hasText:'신뢰 분리 출금 A'})).toHaveCount(0);
 const linked=await call(request,'/transactions/'+expenseA.id);expect(linked.type).toBe('TRANSFER');expect(linked.toAccountId).toBe(other.id);expect((await call(request,'/transactions/'+expenseA.id+'/corrections')).some(c=>c.action==='LINK_TRANSFER')).toBe(true);
 const after=await kpis(request);expect(after.income).toBe(before.income-4400);expect(after.consumption).toBe(before.consumption-4400);
 // "Not a transfer" keeps both facts untouched and only removes the suggestion.
 const b=rows(page).filter({hasText:'신뢰 실제 지출 B'});await b.getByRole('button',{name:'상세 확인',exact:true}).click();page.once('dialog',d=>d.accept());await dock(page).getByRole('button',{name:'이체 아님 · 각각 유지',exact:true}).click();
 // Now an ordinary uncategorized expense (its title is an inline input, so locate by its checkbox label).
 await expect(rows(page).filter({has:page.getByRole('checkbox',{name:'신뢰 실제 지출 B 선택',exact:true})})).toContainText('분류 확인');expect((await call(request,'/transactions/'+expenseB.id)).type).toBe('EXPENSE');expect((await call(request,'/transactions/'+incomeB.id)).type).toBe('INCOME');
 expect((await kpis(request)).income).toBe(after.income);
});

test('money.trust.reconciliation',async({page,request})=>{
 test.setTimeout(300000);
 await expect.poll(async()=>(await call(request,`/transactions?accountId=${recon.id}&types=INCOME,EXPENSE&limit=50`)).total,{timeout:200000,intervals:[5000]}).toBe(3);
 let row=(await call(request,'/reconciliation')).find(r=>r.accountId===recon.id);
 // Same-minute facts are ordered by each account's own observation time: only the unexplained 5,000 remains.
 expect(row).toMatchObject({status:'MISMATCH',observedBalance:60000,ledgerBalance:65000,difference:-5000,basis:'FIRST_NOTIFICATION'});
 expect((await call(request,'/reconciliation')).find(r=>r.accountId===living.id)).toMatchObject({status:'UNVERIFIABLE',observedBalance:50000});
 const before=await kpis(request);
 await open(page,'/accounts','Accounts');const table=page.getByRole('region',{name:'잔액 대조'});const line=table.locator('tbody tr').filter({hasText:'신뢰대조'});
 await expect(line).toContainText('차이 있음');await expect(line).toContainText('65,000');await expect(line).toContainText('60,000');await expect(table.locator('tbody tr').filter({hasText:'신뢰시작잔액'})).toContainText('확인된 잔액 없음');await capture(page,'T6-accounts-reconciliation-mismatch');
 await line.getByRole('button',{name:'차이 확인',exact:true}).click();await expect(dock(page)).toContainText('잔액 보정');await expect(dock(page)).toContainText('수입·소비·순저축 통계에는 포함되지 않습니다');await dock(page).getByLabel('맞추는 사유').fill('Synthetic unexplained difference');await capture(page,'T7-accounts-reconcile-panel');
 await dock(page).getByRole('button',{name:'저장',exact:true}).click();await expect(dock(page)).toHaveCount(0);await expect(line).toContainText('직접 확인한 잔액 기준');
 row=(await call(request,'/reconciliation')).find(r=>r.accountId===recon.id);expect(row).toMatchObject({status:'ANCHORED',difference:0});
 const adjustment=(await call(request,`/transactions?accountId=${recon.id}&type=BALANCE_ADJUSTMENT&limit=5`)).items[0];expect(adjustment.amount).toBe(-5000);
 expect(await call(request,'/transactions/'+adjustment.id+'/financial-detail')).toMatchObject({calculatedBalance:65000,verifiedBalance:60000});
 const after=await kpis(request);expect(after.income).toBe(before.income);expect(after.consumption).toBe(before.consumption);expect(after.savings).toBe(before.savings);
 // Confirmed Review sources keep their bank balance as evidence.
 expect((await call(request,'/reconciliation')).find(r=>r.accountId===gateway.id)).toMatchObject({observedBalance:100000,observedSource:'NOTIFICATION'});
});

test('money.trust.opening-balance',async({page,request})=>{
 await open(page,'/accounts','Accounts');const card=()=>page.locator('.money-account-card').filter({hasText:'신뢰시작잔액'});
 await card().click();await expect(dock(page).getByText('시작 잔액 미확인',{exact:true})).toBeVisible();await dock(page).getByRole('button',{name:'초기 잔액 등록',exact:true}).click();await dock(page).getByLabel('초기 잔액',{exact:true}).fill('1000');await dock(page).getByRole('button',{name:'저장',exact:true}).click();await expect(dock(page)).toHaveCount(0);await expect(card()).toContainText('1,000');
 await card().click();await dock(page).getByRole('button',{name:'초기 잔액 수정',exact:true}).click();await expect(dock(page).getByRole('heading',{name:'초기 잔액 수정'})).toBeVisible();await expect(dock(page).getByLabel('초기 잔액',{exact:true})).toHaveValue('1000');await dock(page).getByLabel('초기 잔액',{exact:true}).fill('2000');await dock(page).getByRole('button',{name:'저장',exact:true}).click();await expect(dock(page)).toHaveCount(0);await expect(card()).toContainText('2,000');
 expect((await call(request,`/transactions?accountId=${opening.id}&type=INITIAL_BALANCE`)).total).toBe(1);
 await card().click();await dock(page).getByRole('button',{name:'초기 잔액 해제',exact:true}).scrollIntoViewIfNeeded();await capture(page,'T8-accounts-opening-balance-controls');let message='';page.once('dialog',d=>{message=d.message();d.accept();});await dock(page).getByRole('button',{name:'초기 잔액 해제',exact:true}).click();await expect(dock(page)).toHaveCount(0);
 expect(message).toContain('계좌와 이후 거래 내역은 그대로 유지');expect((await call(request,`/transactions?accountId=${opening.id}&type=INITIAL_BALANCE`)).total).toBe(0);expect((await call(request,'/accounts/'+opening.id)).archived).toBe(false);
 await card().click();await expect(dock(page).getByText('시작 잔액 미확인',{exact:true})).toBeVisible();await page.getByLabel('패널 닫기').click();
});

test('money.trust.archived-accounts',async({page,request})=>{
 await open(page,'/accounts','Accounts');const card=page.locator('.money-account-card').filter({hasText:'신뢰보관계좌'});await expect(card).toHaveCount(0);await capture(page,'T9-accounts-archived-hidden');
 await page.getByLabel(/보관 계좌 보기/).check();await expect(card).toContainText('보관됨');await capture(page,'T10-accounts-archived-shown');
 // Routine ledger filter hides it, yet its history renders and stays editable with the original account.
 await open(page,'/transactions','Transactions');await expect(page.getByRole('group',{name:'계좌',exact:true}).getByRole('button',{name:/신뢰보관계좌/})).toHaveCount(0);
 await page.getByLabel('거래 검색').fill('신뢰 보관 전 지출');await page.getByRole('button',{name:'신뢰 보관 전 지출',exact:true}).click();await expect(dock(page).getByLabel('출금 계좌')).toHaveValue(closed.id);await expect(dock(page).getByLabel('출금 계좌').locator('option:checked')).toContainText('보관됨');
 await dock(page).getByLabel('메모',{exact:true}).fill('보관 후 메모 수정');await capture(page,'T11-archived-history-editable');await dock(page).getByRole('button',{name:'저장',exact:true}).click();await expect(dock(page)).toHaveCount(0);
 const edited=await call(request,'/transactions/'+closedTx.id);expect(edited.memo).toBe('보관 후 메모 수정');expect(edited.fromAccountId).toBe(closed.id);
 const rejected=await request.fetch(api()+'/transactions',{method:'POST',data:entry('EXPENSE',closed.id,null,1,'신뢰 보관 신규',new Date())});expect(rejected.status()).toBe(400);
});
