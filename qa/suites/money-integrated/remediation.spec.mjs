import {randomUUID} from 'node:crypto';
import {test,expect} from '../../helpers/browser.mjs';
test.describe.configure({mode:'serial',timeout:180000});
const base=()=>process.env.QA_API_URL+'/api/money';
async function call(request,url,method='GET',data){const response=await request.fetch(base()+url,{method,data});expect(response.ok(),method+' '+url+' '+response.status()).toBe(true);return response.status()===204?null:response.json();}
async function open(page,route){await page.setViewportSize({width:1920,height:1200});await page.goto('/money'+route);await expect(page.locator('.money-main')).toBeVisible();await expect(page.getByText('불러오는 중…',{exact:true})).toHaveCount(0);}
async function shot(page,info,label){await page.screenshot({path:info.outputPath(label+'-synthetic.png'),fullPage:true});}
function acknowledgeInjectedFailure(errors,path){const expected=errors.filter(e=>e.type==='http'&&e.status===503&&e.path===path||e.type==='console'&&e.message.includes('status of 503'));expect(expected.length).toBeGreaterThan(0);for(const error of expected)errors.splice(errors.indexOf(error),1);}
let account,loan,manual;
test.beforeAll(async({request})=>{
 account=await call(request,'/accounts','POST',{provider:'KAKAO',displayName:'수정 검증 생활비',role:'SPENDING',suffix:'8499'});
 await call(request,`/accounts/${account.id}/balance-records`,'POST',{type:'INITIAL_BALANCE',amount:200000,asOf:new Date(Date.now()-3600000).toISOString(),note:'Owned synthetic remediation fixture',expectedVersion:account.version});account=await call(request,'/accounts/'+account.id);
 manual=await call(request,'/transactions','POST',{type:'EXPENSE',fromAccountId:account.id,toAccountId:null,amount:3500,occurredAt:new Date().toISOString(),counterpartyText:'수정 검증 카페',title:'수정 검증 수동 내역',categoryId:null,memo:'되돌려도 유지할 메모',excluded:false});
 const tracking=await call(request,'/tracking');await call(request,'/tracking','PUT',{expense:[...new Set([...tracking.expense,account.id])],income:tracking.income,expectedVersion:tracking.version});
 loan=await call(request,'/loans','POST',{name:'수정 검증 대출',lender:'합성 기관',type:'PERSONAL',remainingPrincipal:90000,status:'ACTIVE'});
});
test('money.remediation.read-first',async({request,page},info)=>{
 await open(page,'/accounts?account='+account.id);const detail=page.getByRole('complementary',{name:'계좌 상세'});await expect(detail.getByRole('heading',{name:account.displayName})).toBeVisible();await expect(detail.getByText('196,500원',{exact:true})).toBeVisible();await expect(detail.getByText('잔액 점검 요약',{exact:true})).toBeVisible();await expect(detail.locator('input')).toHaveCount(0);await expect(page.locator('.money-drawer-backdrop')).toHaveCount(0);await shot(page,info,'accounts-read-first');
 await detail.getByRole('button',{name:'계좌 정보 수정 · 자금 구역 설정',exact:true}).click();await expect(page.getByLabel('계좌 이름')).toBeVisible();await page.getByRole('button',{name:'패널 닫기',exact:true}).click();expect((await call(request,'/accounts/'+account.id)).version).toBe(account.version);
 await open(page,'/loans');await page.getByRole('button',{name:loan.name,exact:false}).first().click();const loanDetail=page.getByRole('complementary',{name:'대출 상세'});await expect(loanDetail.getByText('최근 상환 요약',{exact:true})).toBeVisible();await expect(loanDetail.getByText('90,000원',{exact:true})).toBeVisible();await shot(page,info,'loans-read-first');await loanDetail.getByRole('button',{name:'대출 정보 수정',exact:true}).click();await expect(page.locator('.money-dock input').first()).toBeVisible();
});
test('money.remediation.provenance',async({request,page})=>{
 const rows=await call(request,'/transactions?limit=100');const direct=rows.items.find(t=>t.id===manual.id);expect(direct.manual).toBe(true);expect(direct.sourceCount??direct.sources.length).toBe(0);
 await open(page,'/transactions');const directRow=page.getByRole('row').filter({hasText:'수정 검증 수동 내역'});await expect(directRow).toContainText('수동 금융 기록');
 const derived=rows.items.find(t=>!t.manual&&(t.sourceCount??t.sources.length)>0);if(derived){await expect(page.getByRole('row').filter({hasText:derived.title??derived.counterpartyText}).first()).toContainText('원문');}
});
test('money.remediation.reconciliation-groups',async({request,page},info)=>{
 const cutoff=new Date().toISOString(),url=`/accounts/${account.id}/reconciliation-snapshot?cutoff=${encodeURIComponent(cutoff)}`;const before=await call(request,url);
 await call(request,'/notifications','POST',{sourcePackage:'com.example.unrelated',notificationKey:randomUUID(),idempotencyKey:randomUUID(),postedAt:new Date().toISOString(),title:'다른 앱의 합성 안내',text:'선택한 금융 계좌와 관련 없는 원문'});
 const after=await call(request,url+'&token='+encodeURIComponent(before.token));expect(after.partial).toBe(before.partial);expect(after.unresolved).toBe(before.unresolved);expect(after.registeredBalance).toBe(before.registeredBalance);
 await open(page,'/reconciliation?account='+account.id);await expect(page.getByRole('heading',{name:'먼저 확인할 내역',exact:true})).toBeVisible();const supporting=page.locator('details').filter({has:page.locator('summary',{hasText:'같은 거래의 추가 알림'})});await expect(supporting).not.toHaveAttribute('open');await page.locator('summary').filter({hasText:'같은 값으로 들어간 거래'}).click();await expect(page.getByRole('heading',{name:'같은 값으로 들어간 거래',exact:true})).toBeVisible();await expect(page.locator('.money-reconciliation-table')).toContainText('수정 검증 수동 내역');await shot(page,info,'reconciliation-grouped');
});
test('money.remediation.dependent-failure',async({page,runtimeErrors},info)=>{
 await page.route('**/api/money/overview/current-stock',route=>route.fulfill({status:503,json:{message:'합성 조회 장애'}}));await open(page,'/accounts');await expect(page.getByRole('button',{name:'자산 합계 다시 불러오기',exact:true})).toBeVisible();await expect(page.locator('.money-compact-accounts')).toContainText(account.displayName);await shot(page,info,'accounts-stock-partial-failure');acknowledgeInjectedFailure(runtimeErrors,'/api/money/overview/current-stock');await page.unroute('**/api/money/overview/current-stock');
 await open(page,'');const kpi=await page.locator('.money-stock-kpis').first().innerText();await page.route('**/api/money/overview/spending-pace?*',route=>route.fulfill({status:503,json:{message:'합성 갱신 장애'}}));await page.getByRole('button',{name:'새로고침',exact:true}).click();await expect(page.getByRole('button',{name:'소비 속도 다시 불러오기',exact:true})).toBeVisible();await expect(page.locator('.money-spending-pace')).toContainText('이전 자료를 표시합니다');await expect(page.locator('.money-stock-kpis').first()).toHaveText(kpi.replaceAll('\n',''));await shot(page,info,'overview-independent-freshness');acknowledgeInjectedFailure(runtimeErrors,'/api/money/overview/spending-pace');await page.unroute('**/api/money/overview/spending-pace?*');
});
