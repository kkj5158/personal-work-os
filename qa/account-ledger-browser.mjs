// Run this function through the approved team_kafka_playwright owned-tab provider.
// The port/name guards prohibit running write scenarios against shared or production records.
async (page) => {
 const web='http://127.0.0.1:13017',api='http://127.0.0.1:18097/api/money';
 const checks=[],requests=[],errors=[];
 const check=(name,ok,details)=>{checks.push({name,status:ok?'PASS':'FAIL',...(details?{details}:{} )});if(!ok)throw Error(name);};
 const get=async path=>{const response=await page.request.get(api+path);if(!response.ok())throw Error('API_'+response.status()+':'+path);return response.json();};
 const listen=request=>{if(request.url().startsWith(api))requests.push({method:request.method(),path:new URL(request.url()).pathname});};
 const pageError=error=>errors.push(error.message);
 page.on('request',listen);page.on('pageerror',pageError);
 try{
  await page.goto(web+'/money/ledger');await page.setViewportSize({width:1600,height:980});
  await page.getByRole('button',{name:'전체 계좌 보기',exact:true}).waitFor();
  const accounts=await get('/accounts');check('synthetic account guard',accounts.length===4&&accounts.every(a=>a.displayName.startsWith('합성')));
  const a=accounts.find(a=>a.displayName==='합성 생활비'),b=accounts.find(a=>a.displayName==='합성 수입');
  const search=page.getByRole('textbox',{name:'계좌 거래 검색'}),scope=page.getByRole('group',{name:'조회 계좌 단일 선택'});
  const all=scope.getByRole('button',{name:'전체 계좌 보기',exact:true});
  const chip=name=>scope.getByRole('button',{name:new RegExp(name)});
  const settled=async()=>{await page.waitForTimeout(150);await page.waitForFunction(()=>!document.querySelector('.money-account-ledger')?.textContent?.includes('불러오는 중…'));};
  const find=async text=>{await search.fill(text);await settled();await page.waitForTimeout(150);};
  await all.click();await settled();
  check('single account filter has exactly one active scope',await scope.locator('button[aria-pressed=true]').count()===1);
  check('each account has a visible button',await scope.getByRole('button').count()===accounts.length+1);
  check('no primary account dropdown',await scope.locator('select').count()===0);
  const allData=await get('/account-ledger?from=2026-11-01&to=2026-11-30&limit=1&offset=0');
  check('full matching result count exceeds page size',allData.total>50&&allData.items.length===1);
  const beforeCounts=allData.accountCounts;
  const pageTwo=await get('/account-ledger?from=2026-11-01&to=2026-11-30&limit=1&offset=1&accountId='+a.id);
  check('account chip counts independent of pagination and selected scope',JSON.stringify(beforeCounts)===JSON.stringify(pageTwo.accountCounts));
  await find('합성 이체');
  await page.locator('tr[data-transaction-id]').first().waitFor();
  check('ALL transfer is one canonical row',await page.locator('tr[data-transaction-id]').count()===1);
  const transferId=await page.locator('tr[data-transaction-id]').first().getAttribute('data-transaction-id');
  const transferBefore=await get('/transactions/'+transferId);
  await chip('합성 생활비').click();await settled();
  check('destination account shows exact credit leg',(await page.locator('tr[data-transaction-id]').innerText()).includes('+30,000'));
  await chip('합성 수입').click();await settled();
  check('source account replaces selection and shows debit',(await scope.locator('button[aria-pressed=true]').count())===1&&(await page.locator('tr[data-transaction-id]').innerText()).includes('−30,000'));
  check('scope switching never mutates canonical transfer',JSON.stringify(await get('/transactions/'+transferId))===JSON.stringify(transferBefore));
  await all.focus();await page.keyboard.press('Space');await settled();check('account button keyboard activation',await all.getAttribute('aria-pressed')==='true');
  for(const name of ['합성 이체','합성 저축','합성 환불','합성 상환','합성 의미 미확정']){
   await find(name);const row=page.locator('tr[data-transaction-id]').first();await row.waitFor();
   check(name+' has no lifestyle selector',await row.locator('select[aria-label$="생활 카테고리"]').count()===0);
  }
  await find('합성 소비');let row=page.locator('tr[data-transaction-id]').first();await row.waitFor();
  check('confirmed expense exposes lifestyle category',await row.locator('select[aria-label$="생활 카테고리"]').count()===1);
  await row.getByRole('checkbox').check();await row.getByRole('button',{name:/상세 편집/}).click();
  await page.getByRole('region',{name:'행 아래 금융 편집'}).waitFor();
  await chip('합성 수입').click();await settled();
  check('account switch closes draft and clears bulk selection',await page.getByRole('region',{name:'행 아래 금융 편집'}).count()===0&&await page.getByRole('region',{name:'카테고리만 일괄 변경'}).count()===0);
  await all.click();await find('합성 의미 미확정');row=page.locator('tr[data-transaction-id]').first();await row.waitFor();
  const unresolvedId=await row.getAttribute('data-transaction-id'),before=await get('/transactions/'+unresolvedId);
  const writesBefore=requests.filter(r=>r.method!=='GET').length;
  await row.locator('select[aria-label$="금융 유형"]').selectOption('EXPENSE');
  await page.getByRole('region',{name:'행 아래 금융 편집'}).waitFor();await settled();
  check('financial type selection opens draft without writes',requests.filter(r=>r.method!=='GET').length===writesBefore);
  await page.getByRole('textbox',{name:'금융 판단 정정 근거'}).fill('합성 브라우저 검증: 원문과 실제 출금 확인');
  await page.getByRole('button',{name:'금융 유형 영향 확인',exact:true}).click();
  await page.getByRole('region',{name:'확정 전 금융 영향'}).waitFor();
  check('validated preview leaves canonical fact unchanged',JSON.stringify(await get('/transactions/'+unresolvedId))===JSON.stringify(before));
  await page.getByRole('button',{name:'금융 변경 확정',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.al-editor')?.textContent?.includes('금융 변경이 확정되었습니다.'));
  const after=await get('/transactions/'+unresolvedId);
  check('explicit confirmation updates same canonical identity once',after.id===before.id&&after.version===before.version+1&&after.amount===before.amount);
  const resolved=await get('/account-ledger/rows/'+unresolvedId);check('unresolved confirmation becomes confirmed expense',resolved.meaning_state==='CONFIRMED'&&resolved.display_type==='EXPENSE');
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  await page.getByRole('button',{name:'미처리 알림',exact:true}).click();await settled();
  check('pending RAW view explicitly excluded from money totals',(await page.locator('.al-raw').innerText()).includes('포함하지 않습니다'));
  const pending=await get('/account-ledger/pending?from=2026-11-01&to=2026-11-30&limit=50&offset=0');
  check('pending RAW remains separate and has no incoming/outgoing summary',pending.total>=1&&pending.summary.incoming===null&&pending.summary.outgoing===null);
  await chip('합성 생활비').click();await settled();check('unknown RAW not guessed into selected account',await page.locator('.al-raw article').count()===0);
  await page.getByRole('button',{name:'필터 초기화',exact:true}).click();await settled();
  check('reset restores ALL canonical view',await all.getAttribute('aria-pressed')==='true'&&await page.locator('.al-table').count()===1);
  await page.setViewportSize({width:390,height:844});await settled();
  const sizing=await page.evaluate(()=>({body:document.body.scrollWidth,viewport:innerWidth,scroll:document.querySelector('.al-table-scroll')?.scrollWidth,client:document.querySelector('.al-table-scroll')?.clientWidth}));
  check('mobile has no horizontal body overflow',sizing.body<=sizing.viewport+1,sizing);
  check('mobile table has usable horizontal scroll',sizing.scroll>sizing.client);
  check('no uncaught page errors',errors.length===0,errors);
  return {status:'PASS',observedAt:new Date().toISOString(),provider:'team_kafka_playwright',environment:'OWNED_LOOPBACK_SYNTHETIC',checks,writeRequests:requests.filter(r=>r.method!=='GET'),errors};
 }catch(error){return {status:'FAIL',observedAt:new Date().toISOString(),checks,error:error.message,errors};}
 finally{page.off('request',listen);page.off('pageerror',pageError);}
}
