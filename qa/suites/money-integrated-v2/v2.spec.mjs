import {test,expect} from '../../helpers/browser.mjs';

test.describe.configure({mode:'serial',timeout:180000});
test.use({actionTimeout:60000});

async function read(request,path){
 const response=await request.get(process.env.QA_API_URL+'/api/money'+path);
 expect(response.ok()).toBe(true);
 return response.json();
}

async function open(page,search){
 await page.goto('/money/review');
 await page.getByRole('searchbox',{name:'거래처·알림 검색'}).fill(search);
}

test('money.v2.review-bulk-undo',async({request,page},info)=>{
 expect(process.env.QA_SYSTEM).toBe('money-integrated-v2');
 await open(page,'V2 review');
 const rows=page.locator('.money-notice-record');
 await expect(rows).toHaveCount(50);
 await page.getByRole('checkbox',{name:'현재 페이지 전체 선택'}).check();
 await page.getByRole('button',{name:'다음',exact:true}).click();
 await expect(rows).toHaveCount(3);
 await expect(page.locator('.money-notice-toolbar')).toContainText('현재 화면 밖 50건');
 await page.getByRole('checkbox',{name:'현재 페이지 전체 선택'}).check();
 await page.getByRole('button',{name:'선택 제외',exact:true}).click();
 const preview=page.getByRole('region',{name:'선택 항목 일괄 처리 미리보기'});
 await expect(preview.getByRole('listitem')).toHaveCount(53);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('review-bulk-exclusion.png')});
 const applied=page.waitForResponse(r=>r.url().endsWith('/review/batches/execute')&&r.request().method()==='POST');
 await preview.getByRole('button',{name:'53건 제외'}).click();
 const receipt=await (await applied).json();
 expect(receipt.items).toHaveLength(53);
 expect(receipt.items.every(item=>item.status==='SAVED'&&item.canUndo)).toBe(true);
 const results=page.locator('.money-notice-results');
 await expect(results).toContainText('성공 53건');
 await results.getByRole('button',{name:'실행 취소',exact:true}).first().click();
 await expect(results).toContainText('취소 완료');
 const query='/ai/workbench?scope=GATE0&search=V2%20review&state=';
 expect((await read(request,query+'PENDING')).total).toBe(1);
 expect((await read(request,query+'DEFERRED')).total).toBe(52);
});

test('money.v2.review-unknown-recovery',async({request,page,runtimeErrors},info)=>{
 expect(process.env.QA_SYSTEM).toBe('money-integrated-v2');
 await open(page,'V2 recovery');
 const rows=page.locator('.money-notice-record');
 await expect(rows).toHaveCount(2);
 let command,posts=0;
 await page.route('**/api/money/review/batches/single',async route=>{
  command=route.request().postDataJSON();
  posts++;
  const response=await route.fetch();
  expect(response.ok()).toBe(true);
  await route.abort('failed');
 });
 await rows.first().getByRole('button',{name:'제외',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const recovery=page.getByRole('button',{name:'원래 요청 결과 조회',exact:true});
 await expect(recovery).toBeEnabled();
 await expect(rows.last().getByRole('button',{name:'제외',exact:true})).toBeEnabled();
 const path='/review/batches/outcomes/'+command.requestId;
 const receipt=await read(request,path);
 expect(receipt.items[0].status).toBe('SAVED');
 await recovery.click();
 await expect(recovery).toHaveCount(0);
 await expect(rows).toHaveCount(1);
 expect(await read(request,path)).toEqual(receipt);
 expect(posts).toBe(1);
 await page.unroute('**/api/money/review/batches/single');
 const injected=runtimeErrors.findIndex(e=>e.type==='console'&&e.message.includes('net::ERR_FAILED'));
 if(injected>=0)runtimeErrors.splice(injected,1);
 await page.screenshot({path:info.outputPath('review-original-request-recovery.png')});
});
