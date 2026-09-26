import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '../../helpers/browser.mjs';

// Only the adapter-owned schema receives these synthetic records. No shared DEV reset.
test.describe.configure({mode:'serial'});
const api=()=>process.env.QA_API_URL+'/api/money';
let hub,gate,purpose,expense,category,loan,review;
const now=new Date(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const month=today.slice(0,7),from=month+'-01',to=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
async function call(request,url,method='GET',data){const r=await request.fetch(api()+url,{method,data});expect(r.ok(),method+' '+url+' status '+r.status()).toBe(true);return r.status()===204?null:r.json();}
const entry=(type,fromAccountId,toAccountId,amount,title,extra={})=>({type,fromAccountId,toAccountId,amount,title,occurredAt:now.toISOString(),counterpartyText:'Synthetic merchant',categoryId:null,memo:null,excluded:false,...extra});
async function open(page,route,title){await page.goto('/money'+route);await expect(page.getByRole('heading',{name:title,exact:true,level:1})).toBeVisible();await expect(page.locator('.money-main [role=alert]')).toHaveCount(0);}
const panel=page=>page.locator('.money-dock');
async function save(page){await panel(page).getByRole('button',{name:/^(계좌 )?저장$/,exact:true}).click();await expect(panel(page)).toHaveCount(0);}
async function selectExpense(page){await open(page,'/transactions','Transactions');await page.getByLabel('거래 검색').fill('QA meal');await page.getByRole('button',{name:'QA meal',exact:true}).click();}

test('money.web.seed',async({request})=>{
 category=await call(request,'/categories','POST',{name:'QA food',color:'#ef8655',archived:false});
 const account=async(name,role,provider='KAKAO',suffix=null)=>call(request,'/accounts','POST',{provider,displayName:name,role,maskedReference:null,suffix});
 hub=await account('QA hub','INCOME_HUB','SHINHAN','1111');gate=await account('QA gateway','SAVINGS_GATEWAY','KAKAO','2222');purpose=await account('QA purpose','PURPOSE_SAVINGS','KAKAO','3333');
 await call(request,'/accounts/'+hub.id+'/balance-checkpoints','POST',{amount:10000,verifiedAt:new Date(now.getTime()-60000).toISOString(),note:'Synthetic verified opening',expectedVersion:hub.version});
 await call(request,'/transactions','POST',entry('INCOME',null,hub.id,1000,'QA salary'));
 await call(request,'/transactions','POST',entry('TRANSFER',hub.id,gate.id,500,'QA saving boundary'));
 await call(request,'/transactions','POST',entry('TRANSFER',gate.id,purpose.id,500,'QA saving purpose'));
 await call(request,'/transactions','POST',entry('TRANSFER',gate.id,hub.id,100,'QA saving return'));
 expense=await call(request,'/transactions','POST',entry('EXPENSE',hub.id,null,100,'QA meal',{categoryId:category.id,memo:'Source memo'}));
 await call(request,'/transactions','POST',entry('REFUND',null,hub.id,40,'QA refund',{refundOf:expense.id}));
 await call(request,'/transactions','POST',entry('INCOME',null,hub.id,5000,'QA excluded',{excluded:true}));
});
test('money.web.routes',async({page})=>{
 for(const [route,title] of [['','Overview'],['/transactions','Transactions'],['/bookkeeping','가계부'],['/accounts','Accounts'],['/loans','Loans'],['/review','Review Required'],['/settings','Settings']]){
  await open(page,route,title);await expect(page.locator('.money-main')).toBeVisible();
 }
 await page.getByRole('button',{name:'Loans',exact:true}).first().click();await expect(page).toHaveURL(/\/money\/loans$/);
});
test('money.web.periods',async({page})=>{
 await open(page,'','Overview');await expect(page.getByTestId('effective-period')).toHaveText(from+' — '+to);
 for(const label of ['1주','분기','6개월','1년','1개월']){await page.getByRole('button',{name:label,exact:true}).click();await expect(page.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');const before=await page.getByTestId('effective-period').textContent();await page.getByLabel('이전 기간').click();await expect(page.getByTestId('effective-period')).not.toHaveText(before);await page.getByLabel('다음 기간').click();await expect(page.getByTestId('effective-period')).toHaveText(before);}
 await page.getByText('기간 직접 선택',{exact:true}).click();await page.getByLabel('시작일',{exact:true}).fill(month+'-02');await page.getByLabel('종료일',{exact:true}).fill(today);await expect(page.getByTestId('effective-period')).toHaveText(month+'-02 — '+today);
});
test('money.web.overview-semantics',async({request,page})=>{
 const data=await call(request,`/overview?from=${from}&to=${to}`);expect(data.kpis).toMatchObject({income:1000,consumption:60,savings:400,assets:10940,loans:0});expect(data.flow.some(f=>f.net===400&&f.gross===600&&f.count===2)).toBe(true);
 await open(page,'','Overview');await expect(page.getByLabel('왼쪽에서 오른쪽 자금 흐름')).toBeVisible();await expect(page.getByRole('heading',{name:'관계별 자금 흐름'})).toBeVisible();await expect(page.getByText('총이동 (참고)',{exact:true})).toBeVisible();await expect(page.locator('.money-asof')).toContainText('장부 계산값');
});
test('money.web.transaction-panel',async({page,request})=>{
 const requests=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));await selectExpense(page);await expect(page.getByRole('table',{name:'Transactions',exact:true})).toBeVisible();expect((await panel(page).boundingBox()).width).toBeGreaterThanOrEqual(360);await expect(page.locator('tr.selected')).toHaveCount(1);
 expect(requests.filter(p=>/\/transactions\/[^/]+(?:\/corrections)?$/.test(p))).toEqual([]);
 await panel(page).getByLabel('제목',{exact:true}).fill('QA meal corrected');await save(page);await expect(page.getByRole('button',{name:'QA meal corrected',exact:true})).toBeVisible();
 expense=await call(request,'/transactions/'+expense.id);expect(expense.title).toBe('QA meal corrected');
 await page.getByRole('button',{name:'QA meal corrected',exact:true}).click();await panel(page).getByText('시스템 정보',{exact:true}).click();await expect(panel(page).getByText('원본 알림과 해석 이력은 읽기 전용입니다.')).toBeVisible();await expect.poll(()=>requests.some(p=>p.endsWith('/'+expense.id+'/corrections'))).toBe(true);await page.getByLabel('패널 닫기').click();
});
test('money.web.dirty-guards',async({page})=>{
 await open(page,'/transactions','Transactions');await page.getByRole('button',{name:'QA meal corrected',exact:true}).click();await panel(page).getByLabel('제목',{exact:true}).fill('UNSAVED');
 page.once('dialog',d=>d.dismiss());await page.getByLabel('패널 닫기').click();await expect(panel(page)).toBeVisible();
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'QA salary',exact:true}).click();await expect(panel(page).getByLabel('제목',{exact:true})).toHaveValue('UNSAVED');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Accounts',exact:true}).first().click();await expect(page).toHaveURL(/\/money\/transactions$/);
 page.once('dialog',d=>d.accept());await panel(page).getByRole('button',{name:'취소',exact:true}).click();await expect(panel(page)).toHaveCount(0);await expect(page.getByRole('button',{name:'UNSAVED',exact:true})).toHaveCount(0);
});
test('money.web.bookkeeping-inheritance',async({page,request})=>{
 await open(page,'/bookkeeping','가계부');await expect(page.getByRole('button',{name:'지출',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:'QA saving boundary',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'QA meal corrected',exact:true}).click();await panel(page).getByLabel('가계부 제목',{exact:true}).fill('QA daily meaning');await save(page);
 expense=await call(request,'/transactions/'+expense.id);expect(expense.title).toBe('QA meal corrected');expense=await call(request,'/transactions/'+expense.id,'PUT',{...expense,title:'QA source revised',memo:'New inherited memo',expectedVersion:expense.version});
 await page.reload();await page.getByRole('button',{name:'QA daily meaning',exact:true}).click();await expect(panel(page).getByLabel('가계부 메모',{exact:true})).toHaveValue('New inherited memo');await expect(panel(page).getByText('수정됨 · 원거래 값으로',{exact:true})).toHaveCount(1);
 await panel(page).getByRole('button',{name:'수정됨 · 원거래 값으로',exact:true}).click();await expect(panel(page).getByLabel('가계부 제목',{exact:true})).toHaveValue('QA source revised');await save(page);
 await page.getByRole('button',{name:'QA source revised',exact:true}).click();await panel(page).getByLabel('가계부 금액',{exact:true}).fill('75');await panel(page).getByRole('button',{name:'원거래 값으로 되돌리기',exact:true}).click();await expect(panel(page).getByLabel('가계부 금액',{exact:true})).toHaveValue('100');await save(page);
 await page.getByRole('button',{name:'수입',exact:true}).click();await expect(page.getByRole('button',{name:'QA salary',exact:true})).toBeVisible();
});
test('money.web.accounts',async({page,request})=>{
 await open(page,'/accounts','Accounts');await page.getByRole('button').filter({hasText:'QA hub'}).click();await panel(page).getByLabel('계좌 별명',{exact:true}).fill('QA hub renamed');await panel(page).getByLabel('자산 합계에 포함',{exact:true}).uncheck();await save(page);
 hub=(await call(request,'/accounts')).find(a=>a.id===hub.id);expect(hub.includeInAssets).toBe(false);await expect(page.getByRole('button').filter({hasText:'QA hub renamed'})).toBeVisible();
 await page.getByRole('button').filter({hasText:'QA hub renamed'}).click();await panel(page).getByLabel('자산 합계에 포함',{exact:true}).check();await save(page);
});
test('money.web.loans',async({page,request})=>{
 await open(page,'/loans','Loans');await page.getByRole('button',{name:'+ 대출 추가',exact:true}).click();for(const [name,value] of [['대출명','QA loan'],['금융사','QA lender'],['대출 유형','PERSONAL'],['남은 원금','700']])await panel(page).getByLabel(name,{exact:true}).fill(value);await save(page);await expect(page.getByRole('button',{name:'QA loan',exact:true})).toBeVisible();loan=(await call(request,'/loans'))[0];const overview=await call(request,`/overview?from=${from}&to=${to}`);expect(overview.kpis.loans).toBe(700);expect(overview.kpis.assets).toBe(10940);
 await page.getByRole('button',{name:'QA loan',exact:true}).click();await panel(page).getByLabel('남은 원금',{exact:true}).fill('0');await panel(page).getByLabel('대출 상태',{exact:true}).selectOption('COMPLETED');await save(page);expect((await call(request,`/overview?from=${from}&to=${to}`)).kpis.loans).toBe(0);
 await page.getByRole('button',{name:'QA loan',exact:true}).click();page.once('dialog',d=>d.accept());await panel(page).getByRole('button',{name:'대출 삭제',exact:true}).click();await expect(panel(page)).toHaveCount(0);await expect(page.getByRole('button',{name:'QA loan',exact:true})).toHaveCount(0);
});
test('money.web.rules',async({page,request})=>{
 await open(page,'/settings','Settings');await page.getByRole('button',{name:'+ 규칙 추가',exact:true}).click();await panel(page).getByLabel('거래처 정확히 일치',{exact:true}).fill('QA rule merchant');await panel(page).getByLabel('규칙 카테고리',{exact:true}).selectOption(category.id);await panel(page).getByLabel('기본 제목',{exact:true}).fill('QA automatic title');await panel(page).getByLabel('기본 메모',{exact:true}).fill('QA automatic memo');await save(page);
 const tx=await call(request,'/transactions','POST',entry('EXPENSE',hub.id,null,10,null,{counterpartyText:'QA rule merchant'}));expect(tx.title).toBe('QA automatic title');expect(tx.memo).toBe('QA automatic memo');await page.getByRole('button',{name:'qa rule merchant',exact:true}).click();await panel(page).getByLabel('활성',{exact:true}).uncheck();await save(page);expect((await call(request,'/transactions/'+tx.id)).title).toBe('QA automatic title');
});
test('money.web.review',async({page,request})=>{
 const raw=await call(request,'/notifications','POST',{sourcePackage:'com.kakaobank.channel',notificationKey:'qa-web:'+randomUUID(),idempotencyKey:randomUUID(),postedAt:now.toISOString(),title:'QA review item',text:'Synthetic unknown shape'});review=raw.notification;
 await expect.poll(async()=> (await call(request,'/notifications/'+review.id)).state).toBe('REVIEW_REQUIRED');await open(page,'/review','Review Required');await page.getByRole('button',{name:'QA review item',exact:true}).click();await panel(page).getByRole('button',{name:'보류',exact:true}).click();await expect(panel(page)).toHaveCount(0);await expect(page.getByRole('row').filter({hasText:'QA review item'})).toContainText('보류');
 await page.getByRole('button',{name:'QA review item',exact:true}).click();await panel(page).getByLabel('금액 (KRW)',{exact:true}).fill('5');await panel(page).getByLabel('출금 계좌',{exact:true}).selectOption(hub.id);await panel(page).getByRole('button',{name:'수정 후 승인',exact:true}).click();await expect(panel(page)).toHaveCount(0);expect((await call(request,'/notifications/'+review.id)).state).toBe('PROCESSED');
 const rejected=await call(request,'/notifications','POST',{sourcePackage:'com.kakaobank.channel',idempotencyKey:randomUUID(),postedAt:now.toISOString(),title:'QA reject item',text:'Synthetic unknown shape'});await expect.poll(async()=> (await call(request,'/notifications/'+rejected.notification.id)).state).toBe('REVIEW_REQUIRED');await page.reload();await page.getByRole('button',{name:'QA reject item',exact:true}).click();page.once('dialog',d=>d.accept());await panel(page).getByRole('button',{name:'거절',exact:true}).click();await expect(panel(page)).toHaveCount(0);expect((await call(request,'/notifications/'+rejected.notification.id)).processingReason).toBe('USER_EXCLUDED');
});
test('money.web.immediate-posting',async({request,page})=>{
 // Separate synthetic bank pair: fresh provider time, same amount/counterparty, unique owned hints.
 const ibk=await call(request,'/accounts','POST',{provider:'IBK',displayName:'QA IBK','role':'SPENDING',maskedReference:'975-******-01-014'});
 const postedAt=new Date().toISOString(),local=new Date(Date.now()+9*3600000).toISOString(),minute=local.slice(5,10).replace('-','/')+' '+local.slice(11,16);
 const out={sourcePackage:'com.ibk.android.ionebank',idempotencyKey:randomUUID(),notificationKey:randomUUID(),postedAt,title:'입출금',text:`[출금] 123원 QAOwner 975-******-01-014 ${minute} / 잔액 50,000원`};
 const incoming={sourcePackage:'com.shinhan.sbanking',idempotencyKey:randomUUID(),notificationKey:randomUUID(),postedAt,title:'입금',text:`123원 QAOwner 급여통장(1111) ${minute.replace('/','.')} 잔액 50,000원`};
 const a=(await call(request,'/notifications','POST',out)).notification;const start=Date.now();const b=(await call(request,'/notifications','POST',incoming)).notification;const accepted=Date.now();
 await expect.poll(async()=>(await call(request,'/notifications/'+b.id)).state,{intervals:[100,200,200],timeout:10000}).toBe('PROCESSED');const elapsed=Date.now()-start;
 expect((await call(request,'/notifications/'+a.id)).state).toBe('PROCESSED');const duplicate=await call(request,'/notifications','POST',incoming);expect(duplicate.created).toBe(false);expect(duplicate.notification.id).toBe(b.id);
 const rows=await call(request,'/transactions?type=TRANSFER&limit=50');expect(rows.items.filter(t=>t.fromAccountId===ibk.id&&t.toAccountId===hub.id&&t.amount===123)).toHaveLength(1);const t=rows.items.find(t=>t.fromAccountId===ibk.id&&t.toAccountId===hub.id&&t.amount===123);expect((await call(request,'/transactions/'+t.id)).sources).toHaveLength(2);
 await writeFile(path.join(process.env.QA_RUN_DIR,'posting-latency.json'),JSON.stringify({finalIngestToObservedPostingMs:elapsed,ingestRequestMs:accepted-start,acceptedToObservedPostingMs:elapsed-(accepted-start),logicalTransfers:1,rawSources:2,retryDuplicates:0}));
 await open(page,'/transactions','Transactions');await expect(page.getByRole('row').filter({hasText:'QA IBK'})).toContainText('123');
});
test('money.web.performance',async({page,request})=>{
 const paths=['/transactions?limit=50','/account-balances',`/overview?from=${from}&to=${to}`],apiTimings=[];
 for(const endpoint of paths){const start=Date.now();await call(request,endpoint);apiTimings.push({endpoint,ms:Date.now()-start});}
 const requests=[];page.on('request',r=>{if(r.url().startsWith(api()))requests.push(new URL(r.url()).pathname);});const started=Date.now();await open(page,'/transactions','Transactions');await expect(page.getByRole('button',{name:'QA source revised',exact:true})).toBeVisible();const listVisibleMs=Date.now()-started;
 expect(requests.filter(p=>/\/transactions\/[^/]+(?:\/corrections)?$/.test(p))).toHaveLength(0);expect(requests.filter(p=>p.endsWith('/detail'))).toHaveLength(0);
 const selected=Date.now();await page.getByRole('button',{name:'QA source revised',exact:true}).click();await expect(panel(page)).toBeVisible();const panelMs=Date.now()-selected;expect(panelMs).toBeLessThan(1500);
 await writeFile(path.join(process.env.QA_RUN_DIR,'web-performance.json'),JSON.stringify({apiTimings,listVisibleMs,panelMs,eagerProvenanceRequests:0,requests},null,2));
});
