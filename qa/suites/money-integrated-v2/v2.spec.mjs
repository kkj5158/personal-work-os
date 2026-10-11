import {test,expect} from '../../helpers/browser.mjs';
test.describe.configure({mode:'serial',timeout:180000});
test.use({actionTimeout:60000});
const base=()=>process.env.QA_API_URL+'/api/money';
async function call(request,url,method='GET',data){const r=await request.fetch(base()+url,{method,data});expect(r.ok(),`${method} ${url}: ${r.status()} ${r.ok()?'':await r.text()}`).toBe(true);return r.status()===204?null:r.json();}
async function open(page){await page.goto('/money/review');await expect(page.getByRole('region',{name:'검토 필요 알림 작업함'})).toBeVisible();await page.getByRole('searchbox',{name:'알림 검색'}).fill('V2 review');await expect(page.locator('.money-notice-ledger tbody tr')).toHaveCount(50);}
test('money.v2.review-bulk-undo',async({request,page},info)=>{
 test.setTimeout(300000);
 expect(process.env.QA_SYSTEM).toBe('money-integrated-v2');await open(page);
 await expect(page.getByRole('button',{name:/AI 추천/})).toHaveCount(0);
 await page.getByRole('button',{name:'현재 페이지 전체 선택'}).click();await expect(page.locator('.money-notice-toolbar')).toContainText('선택 50건');
 await page.getByRole('button',{name:'다음',exact:true}).click();await expect(page.locator('.money-notice-toolbar')).toContainText('현재 화면 밖 50건');
 await page.getByRole('button',{name:/필터 결과 전체 선택/}).click();await expect(page.locator('.money-notice-toolbar')).toContainText('선택 53건');
 await page.getByRole('button',{name:'선택 알림 일괄 처리'}).click();const modal=page.getByRole('dialog',{name:'알림 일괄 처리 미리보기'});await expect(modal).toBeVisible({timeout:120000});await expect(modal).toContainText('처리 예정');await expect(modal.getByRole('tab',{name:'처리 예정 52건'})).toBeVisible();
 await modal.getByRole('tab',{name:'제외 항목 1건'}).click();await expect(modal).toContainText('계좌 미확인');await expect(modal).toContainText('개별 금융 확인');await page.screenshot({path:info.outputPath('review-bulk-exclusion.png'),fullPage:true});
 await modal.getByRole('tab',{name:'처리 예정 52건'}).click();await expect(modal.locator('tbody tr')).toHaveCount(52);let releaseResponse;const responseGate=new Promise(resolve=>{releaseResponse=resolve;});let executeCount=0;await page.route('**/api/money/review/batches/execute',async route=>{executeCount++;const response=await route.fetch();expect(response.status()).toBe(200);await responseGate;await route.fulfill({response});});try{await modal.getByRole('button',{name:'52건 정보성 알림 정리',exact:true}).click();await expect(modal.locator('footer')).toContainText('서버 결과 확인 52/52건',{timeout:120000});await expect(modal.getByRole('button',{name:'처리 중…',exact:true})).toBeDisabled();await expect(page.locator('.money-notice-results')).toHaveCount(0);expect(executeCount).toBe(1);await page.screenshot({path:info.outputPath('review-server-confirmed-progress.png'),fullPage:true});}finally{releaseResponse();}await expect(modal).toHaveCount(0,{timeout:120000});await page.unroute('**/api/money/review/batches/execute');await expect(page.locator('.money-notice-results')).toContainText('52/52건');await expect(page.locator('.money-notice-toolbar')).toContainText('선택 1건');
 await page.locator('.money-notice-results').getByRole('button',{name:'실행 취소',exact:true}).first().click();await expect(page.locator('.money-notice-results')).toContainText('취소 완료');
 const raws=await call(request,'/notifications?limit=100');expect(raws.every(r=>r.rawPayload?.synthetic)).toBe(true);const queue=await call(request,'/ai/workbench?state=PENDING&search=V2%20review');expect(queue.total).toBe(2);expect(queue.items.some(r=>r.reason==='ACCOUNT_RESOLUTION_REQUIRED')).toBe(true);
 await page.screenshot({path:info.outputPath('review-bulk-confirmed-results-undo.png'),fullPage:true});
});
test('money.v2.review-unknown-recovery',async({request,page,runtimeErrors},info)=>{
 await page.goto('/money/review');await expect(page.getByRole('region',{name:'검토 필요 알림 작업함'})).toBeVisible();await page.getByRole('searchbox',{name:'알림 검색'}).fill('V2 review');await expect(page.locator('.money-notice-ledger tbody tr')).toHaveCount(2);
 await page.getByRole('button',{name:'현재 페이지 전체 선택'}).click();await page.getByRole('button',{name:'선택 보류',exact:true}).click();const modal=page.getByRole('dialog',{name:'알림 일괄 처리 미리보기'});await expect(modal).toBeVisible();let command;
 await page.route('**/api/money/review/batches/execute',async route=>{command=route.request().postDataJSON();const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');});
 await modal.getByRole('button',{name:'2건 보류',exact:true}).click();await expect(page.getByRole('button',{name:'원래 요청 결과 조회',exact:true})).toBeVisible();expect(command?.requestId).toBeTruthy();await page.unroute('**/api/money/review/batches/execute');
 const before=await call(request,'/review/batches/outcomes/'+command.requestId);expect(before.items.every(i=>i.status==='SAVED')).toBe(true);await page.getByRole('button',{name:'원래 요청 결과 조회',exact:true}).click();await expect(page.getByRole('button',{name:'원래 요청 결과 조회',exact:true})).toHaveCount(0);expect(await call(request,'/review/batches/outcomes/'+command.requestId)).toEqual(before);
 const injected=runtimeErrors.filter(e=>e.type==='console'&&e.message==='Failed to load resource: net::ERR_FAILED');expect(injected).toHaveLength(1);runtimeErrors.splice(runtimeErrors.indexOf(injected[0]),1);
 await page.getByRole('tab',{name:'보류',exact:true}).click();await expect(page.locator('.money-notice-ledger tbody tr')).toHaveCount(2);await page.screenshot({path:info.outputPath('review-original-request-recovery.png'),fullPage:true});
 await info.attach('original-request-recovery',{body:Buffer.from(JSON.stringify({requestId:command.requestId,serverConfirmed:true,readOnlyRecovery:true})),contentType:'application/json'});
});
