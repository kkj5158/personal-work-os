import '../money-phase2/core.spec.mjs';
import {test,expect} from '../../helpers/browser.mjs';
import path from 'node:path';
const api=()=>process.env.QA_API_URL+'/api/money';
const now=new Date(),at=new Date(now.getTime()-60000).toISOString();
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const from=today.slice(0,7)+'-01',to=today;
const dock=p=>p.locator('.money-dock');
const mainRows=p=>p.locator('.money-main tbody tr');
async function call(request,url,method='GET',data){const r=await request.fetch(api()+url,{method,data});expect(r.ok(),`${method} ${url} status ${r.status()}`).toBe(true);return r.status()===204?null:r.json();}
async function open(p,route,title){await p.goto('/money'+route);await expect(p.locator('.money-header h1')).toHaveText(title);await expect(p.getByText('불러오는 중…',{exact:true})).toHaveCount(0);}
async function save(p){await dock(p).getByRole('button',{name:'저장',exact:true}).click();await expect(dock(p)).toHaveCount(0);}
async function capture(p,name){await p.screenshot({path:path.join(process.env.QA_RUN_DIR,name+'-synthetic.png'),fullPage:true});}
const entry=(type,account,amount,title,categoryId)=>({type,fromAccountId:type==='EXPENSE'?account:null,toAccountId:type==='INCOME'?account:null,amount,occurredAt:at,title,counterpartyText:'Synthetic Cafe',categoryId:categoryId||null,memo:'Synthetic meaning fixture',excluded:false});
let spending,income,expense,receipt,food,salary,reviewOne,reviewTwo,ruleOne,ruleTwo,raw;
test('money.phase3.seed',async({request})=>{
 const categories=await call(request,'/categories/defaults','POST',{});food=categories.find(c=>c.name==='식비');salary=categories.find(c=>c.name==='급여');
 spending=await call(request,'/accounts','POST',{provider:'IBK',displayName:'생활 테스트 계좌',role:'SPENDING',suffix:'1111'});
 income=await call(request,'/accounts','POST',{provider:'SHINHAN',displayName:'수입 테스트 계좌',role:'INCOME_HUB',suffix:'2222'});
 expense=await call(request,'/transactions','POST',entry('EXPENSE',spending.id,12500,'생활 점심',food.id));receipt=await call(request,'/transactions','POST',entry('INCOME',income.id,500000,'테스트 급여',salary.id));
 reviewOne=await call(request,'/transactions','POST',entry('EXPENSE',spending.id,2300,'검토 대상 A'));reviewTwo=await call(request,'/transactions','POST',entry('EXPENSE',spending.id,2300,'검토 대상 B'));
 const before=await call(request,`/bookkeeping?from=${from}&to=${to}&kind=EXPENSE`);expect(before.items.some(i=>i.id===expense.id)).toBe(false);
});
test('money.phase3.tracking',async({page,request})=>{
 await open(page,'/bookkeeping','가계부');await page.getByRole('button',{name:'추적 계좌 설정',exact:true}).click();const modal=page.getByRole('dialog',{name:'가계부 추적 계좌 설정'});await expect(modal).toBeVisible();
 const exp=modal.locator('section').filter({has:page.getByRole('heading',{name:/지출 추적 계좌/})});const inc=modal.locator('section').filter({has:page.getByRole('heading',{name:/수입 추적 계좌/})});
 const checks=exp.getByRole('checkbox');for(let i=0;i<await checks.count();i++)if(await checks.nth(i).isChecked())await checks.nth(i).uncheck();
 await exp.getByLabel(/생활 테스트 계좌/).check();const candidates=exp.getByRole('checkbox').filter({visible:true});for(let i=0;i<await candidates.count();i++){if((await exp.locator('input:checked').count())===5)break;if(!await candidates.nth(i).isChecked())await candidates.nth(i).check();}await expect(exp.locator('input:checked')).toHaveCount(5);await expect(exp.locator('input:not(:checked)').first()).toBeDisabled();
 for(let i=0;i<await checks.count();i++)if(await checks.nth(i).isChecked()&&!await checks.nth(i).evaluate(e=>e.closest('label').textContent.includes('생활 테스트 계좌')))await checks.nth(i).uncheck();
 await inc.getByLabel(/수입 테스트 계좌/).check();await capture(page,'08-tracking-accounts');await modal.getByRole('button',{name:'저장',exact:true}).click();await expect(modal).toHaveCount(0);await expect(mainRows(page).filter({hasText:'생활 점심'})).toHaveCount(1);
 const tracking=await call(request,'/tracking');expect(tracking.expense).toEqual([spending.id]);expect(tracking.income).toContain(income.id);
 await call(request,'/accounts','POST',{provider:'WOORI',displayName:'새 계좌 자동 선택 금지',role:'SPENDING'});expect((await call(request,'/tracking')).expense).toEqual([spending.id]);
});
test('money.phase3.bookkeeping',async({page,request})=>{
 await open(page,'/bookkeeping','가계부');await expect(page.locator('.meaning-ledger thead')).not.toContainText('상태');
 const filters=page.getByRole('group',{name:'카테고리',exact:true});await filters.getByRole('button',{name:'전체 해제',exact:true}).click();await expect(mainRows(page)).toHaveCount(0);await filters.getByRole('button',{name:'전체 선택',exact:true}).click();await expect(mainRows(page).filter({hasText:'생활 점심'})).toHaveCount(1);
 await filters.getByRole('button',{name:/식비/}).dblclick();await expect(mainRows(page)).toHaveCount(1);await filters.getByRole('button',{name:'전체 선택',exact:true}).click();
 let requests=0;const count=r=>{if(r.url().includes('/api/money/bookkeeping?'))requests++;};await expect(mainRows(page)).toHaveCount(3);page.on('request',count);await page.getByLabel('가계부 검색').pressSequentially('생활 점심',{delay:60});await expect(mainRows(page)).toHaveCount(1);expect(requests).toBe(1);page.off('request',count);
 await mainRows(page).first().click();await expect(dock(page).getByLabel('가계부 제목')).toBeEditable();expect(await dock(page).locator('details[open]').count()).toBe(0);await capture(page,'06-bookkeeping-expense-panel');
 await dock(page).getByLabel('가계부 제목').fill('내 생활 점심');page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Accounts',exact:true}).click();await expect(dock(page)).toBeVisible();await save(page);expect((await call(request,'/transactions/'+expense.id)).title).toBe('생활 점심');await page.reload();await page.getByLabel('가계부 검색').fill('');await expect(mainRows(page).filter({hasText:'내 생활 점심'})).toHaveCount(1);
 await mainRows(page).filter({hasText:'내 생활 점심'}).click();await dock(page).getByRole('button',{name:'사용자 수정 초기화 · 상속값으로'}).click();await save(page);await expect(mainRows(page).filter({hasText:'생활 점심'})).toHaveCount(1);
 await page.getByRole('tab',{name:'수입',exact:true}).click();await expect(mainRows(page).filter({hasText:'테스트 급여'})).toHaveCount(1);await mainRows(page).first().click();await capture(page,'07-bookkeeping-income-panel');await page.getByLabel('패널 닫기').click();
});
test('money.phase3.categories',async({page,request})=>{
 await open(page,'/classification','분류 · 규칙');await page.getByRole('button',{name:'카테고리 추가',exact:true}).click();await dock(page).getByLabel('카테고리 이름').fill('검증 여가');await dock(page).getByLabel('카테고리 이모지').fill('🎨');await dock(page).getByLabel('표시 순서').fill('2');await save(page);await mainRows(page).filter({hasText:'검증 여가'}).click();await dock(page).getByLabel('카테고리 이름').fill('검증 문화');await save(page);await mainRows(page).filter({hasText:'검증 문화'}).click();await capture(page,'12-categories-panel');await dock(page).getByLabel('비활성 · 과거 기록 유지').check();await save(page);await expect(mainRows(page).filter({hasText:'검증 문화'})).toContainText('비활성');
 expect((await call(request,'/categories')).some(c=>c.name==='검증 문화'&&c.archived&&c.emoji==='🎨')).toBe(true);
});
test('money.phase3.rules',async({page,request})=>{
 await open(page,'/classification','분류 · 규칙');await page.getByRole('tab',{name:'자동 분류 규칙'}).click();await page.getByRole('button',{name:'규칙 추가',exact:true}).click();await dock(page).getByLabel('규칙 이름').fill('카페 분류');await dock(page).getByLabel('조건 2 값').fill('Synthetic Cafe');await dock(page).getByLabel('분류 카테고리').selectOption(food.id);await dock(page).getByLabel('기본 제목').fill('카페 생활');await save(page);
 ruleOne=(await call(request,'/classification-rules')).find(r=>r.name==='카페 분류');expect(ruleOne.origin).toBe('MANUAL');expect((await call(request,'/bookkeeping/'+expense.id)).title).toBe('생활 점심');
 ruleTwo=await call(request,'/classification-rules','POST',{name:'보조 메모',conditions:[{field:'merchant',operator:'STARTS_WITH',value:'Synthetic'}],categoryId:null,titleDefault:'낮은 우선 제목',memoDefault:'분류 메모',status:'ACTIVE'});const future=await call(request,'/transactions','POST',entry('EXPENSE',spending.id,1500,'자동 분류 검증'));let book=await call(request,'/bookkeeping/'+future.id);expect(book.title).toBe('카페 생활');expect(book.memo).toBe('분류 메모');expect((await call(request,'/transactions/'+future.id)).title).toBe('자동 분류 검증');
 await page.reload();await page.getByRole('tab',{name:'자동 분류 규칙'}).click();await mainRows(page).filter({hasText:'보조 메모'}).dragTo(mainRows(page).filter({hasText:'카페 분류'}));await expect(mainRows(page).first()).toContainText('보조 메모');expect((await call(request,'/classification-rules'))[0].id).toBe(ruleTwo.id);
 await mainRows(page).filter({hasText:'보조 메모'}).click();await capture(page,'13-rules-panel');await dock(page).getByLabel('규칙 상태').selectOption('PAUSED');await save(page);
 await page.getByRole('tab',{name:'AI 추천'}).click();await expect(page.getByRole('button',{name:'추천 생성 · 제공자 미설정'})).toBeDisabled();await capture(page,'13-ai-unavailable');
});
test('money.phase3.history',async({page,request})=>{
 await call(request,'/bookkeeping/'+expense.id,'PUT',{expectedVersion:2,expectedTransactionVersion:0,expectedProjectionVersion:0,overrides:{title:'내가 정한 제목'}});
 await open(page,'/classification','분류 · 규칙');await page.getByRole('tab',{name:'자동 분류 규칙'}).click();await page.getByText('기존 기록에 적용 · 미리보기 후 확인',{exact:true}).click();await page.getByLabel('규칙 적용 시작일').fill(from);await page.getByLabel('규칙 적용 종료일').fill(to);await page.getByRole('button',{name:'영향 미리보기',exact:true}).click();await expect(page.getByText(/변경 대상 \d+건/)).toBeVisible();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:/확인한 \d+건에 적용/}).click();await expect(page.getByText(/변경 대상 \d+건/)).toHaveCount(0);expect((await call(request,'/bookkeeping/'+expense.id)).title).toBe('내가 정한 제목');expect((await call(request,'/transactions/'+expense.id)).title).toBe('생활 점심');
});
test('money.phase3.review',async({page,request})=>{
 await open(page,'/review','Review Required');const accounts=page.getByRole('group',{name:'계좌',exact:true});await accounts.getByRole('button',{name:'생활 테스트 계좌',exact:true}).dblclick();await page.getByLabel('검토 최소 금액').fill('2300');await page.getByLabel('검토 최대 금액').fill('2300');await expect(mainRows(page)).toHaveCount(2);
 const before=(await call(request,'/classification-rules')).length;await mainRows(page).first().locator('input[type=text],input:not([type])').fill('검토 표시 제목');await mainRows(page).first().getByRole('combobox').selectOption(food.id);await mainRows(page).first().locator('input[type=checkbox]').check();await mainRows(page).last().locator('input[type=checkbox]').click({modifiers:['Shift']});await expect(page.getByRole('button',{name:'선택 2건 검토 완료'})).toBeEnabled();await capture(page,'11-review-bulk-selection');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'선택 2건 검토 완료'}).click();await expect(mainRows(page)).toHaveCount(0);expect((await call(request,'/classification-rules')).length).toBe(before);
 await page.getByRole('group',{name:'상태',exact:true}).getByRole('button',{name:'완료',exact:true}).dblclick();await expect(mainRows(page)).toHaveCount(2);await mainRows(page).first().getByRole('button',{name:'상세 확인'}).click();await capture(page,'11-review-confirmed-panel');await dock(page).getByRole('button',{name:'이 분류를 규칙으로 저장'}).click();await expect(dock(page).getByRole('heading',{name:'분류 규칙 만들기'})).toBeVisible();expect((await call(request,'/classification-rules')).length).toBe(before);await dock(page).getByRole('button',{name:'취소',exact:true}).click();
 await page.getByText('잔액 불일치 진단 · 별도로 확인',{exact:true}).click();await expect(page.getByText('현재 비교 가능한 잔액 불일치가 없습니다.')).toBeVisible();
});
test('money.phase3.raw-review',async({page,request})=>{
 raw=(await call(request,'/notifications','POST',{packageName:'qa.synthetic',notificationKey:'phase3-'+Date.now(),postedAt:at,title:'검증 원본',text:'Synthetic unresolved notification'})).notification;
 await expect.poll(async()=>(await call(request,'/notifications/'+raw.id)).state,{timeout:15000}).toMatch(/REVIEW_REQUIRED|FAILED/);
 await open(page,'/review','Review Required');await page.getByRole('group',{name:'계좌',exact:true}).getByRole('button',{name:'전체 선택',exact:true}).click();await page.getByRole('group',{name:'상태',exact:true}).getByRole('button',{name:'대기',exact:true}).dblclick();await page.getByRole('button',{name:'전체 금액',exact:true}).click();await mainRows(page).filter({hasText:'검증 원본'}).getByRole('button',{name:'상세 확인'}).click();await expect(dock(page).getByRole('heading',{name:'알림 금융 사실 확인'})).toBeVisible();expect(await dock(page).locator('details[open]').count()).toBe(0);await dock(page).getByText('System Information',{exact:true}).click();await dock(page).getByText('원본 알림 확인',{exact:true}).click();await expect(dock(page).getByText('Synthetic unresolved notification',{exact:true})).toBeVisible();await dock(page).getByRole('button',{name:'보류',exact:true}).click();expect((await call(request,'/notifications/'+raw.id)).text).toBe('Synthetic unresolved notification');
});
test('money.phase3.settings',async({page})=>{
 await open(page,'/settings','Settings');await expect(page.getByRole('heading',{name:'MONEY Bridge',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'휴대폰 등록 코드 발급',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'카테고리',exact:true})).toHaveCount(0);await capture(page,'14-bridge-system-settings');const download=page.waitForEvent('download');await page.getByRole('button',{name:'상태 진단 요약 다운로드',exact:true}).click();expect((await download).suggestedFilename()).toBe('money-status-diagnostic.json');
});
