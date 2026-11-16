async (page) => {
 await page.bringToFront();
 const api='http://127.0.0.1:13223/api/workflow/attention';
 if(!page.url().startsWith('http://127.0.0.1:13222/workflow/attention'))throw Error('OWNED_BROWSER_ONLY');
 await page.getByRole('button',{name:'새로고침',exact:true}).click();
 const state=await (await page.request.get(api+'/feed')).json(),count=Object.values(state.totals).reduce((a,b)=>a+b,0);
 await page.waitForFunction(count=>document.querySelector('.aq-overview b')?.textContent===String(count),count);
 let loaded=await page.locator('.aq-list [data-attention-id]').count();while(loaded<count){await page.getByRole('button',{name:'100개 더 불러오기',exact:true}).click();await page.waitForFunction(n=>document.querySelectorAll('.aq-list [data-attention-id]').length>n,loaded);loaded=await page.locator('.aq-list [data-attention-id]').count();}
 await page.waitForFunction(count=>document.querySelectorAll('.aq-list [data-attention-id]').length===count,count);
 await page.evaluate(()=>window.scrollTo(0,0));
 const id=await page.locator('[data-group="DEFERRED"] [data-attention-id]').first().getAttribute('data-attention-id');
 await page.evaluate(()=>{window.__qaPointer=[];document.addEventListener('pointerup',()=>window.__qaPointer.push(performance.now()),{capture:true});});
 const samples=[];await page.evaluate(()=>performance.clearMeasures('attention:render'));
 for(let i=0;i<20;i++){
  if(!await page.evaluate(()=>document.hasFocus()&&document.visibilityState==='visible'))throw Error('FOREGROUND_CHANGED');
  const from=i%2===0?'DEFERRED':'COMPLETED',to=i%2===0?'COMPLETED':'DEFERRED';
  await page.locator('[data-group="'+from+'"] [data-attention-id="'+id+'"]').waitFor();
  const card=page.locator('[data-group="'+from+'"] [data-attention-id="'+id+'"]');
  await card.scrollIntoViewIfNeeded();
  // Select the first card in its group so both source and target remain in the viewport.
  const start=await card.locator('.aq-card-title').boundingBox(),target=await page.locator('[data-group="'+to+'"] h2').boundingBox();
  const response=page.waitForResponse(r=>r.url()===api+'/items/'+id+'/group'&&r.status()===200,{timeout:8000});
  await page.mouse.move(start.x+40,start.y+10);await page.mouse.down();
  await page.mouse.move(target.x+80,target.y+70,{steps:12});await page.mouse.up();
  const res=await response;await res.finished();
  await page.waitForFunction(id=>performance.getEntriesByName('attention:group-paint').at(-1)?.startTime>window.__qaPointer.at(-1),id);
  const visible=await page.evaluate(()=>performance.getEntriesByName('attention:group-paint').at(-1).startTime-window.__qaPointer.at(-1));
  const timing=res.request().timing();samples.push({pointerupToPaintMs:visible,mutationMs:timing.responseEnd-timing.requestStart});
  await page.waitForFunction(()=>!document.querySelector('.aq-toolbar button')?.disabled);
 }
 await page.getByRole('button',{name:'스택',exact:true}).click();
 const ids=await page.locator('.aq-stack [data-attention-id]').evaluateAll(ns=>ns.map(n=>n.dataset.attentionId));
 if(ids.length!==count||new Set(ids).size!==count)throw Error('PAGINATION_DUPLICATE_OR_HOLE');
 const all=[];let cursor='';do{const f=await(await page.request.get(api+'/feed'+(cursor?'?cursor='+encodeURIComponent(cursor):''))).json();all.push(...f.items);cursor=f.nextCursor;}while(cursor);
 if(JSON.stringify(all.map(i=>i.id))!==JSON.stringify(ids))throw Error('GLOBAL_CHRONOLOGY');
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 await page.locator('.aq-stack [data-attention-id]').last().scrollIntoViewIfNeeded();
 const last=await page.locator('.aq-stack [data-attention-id]').last().boundingBox();if(!last||last.height<30)throw Error('BLANK_LAST_CARD');
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'D:/DEV_Space/work-queue-v3-1-artifacts-20261116/local-'+count+'-stack.png'});
 await page.getByRole('button',{name:'그룹',exact:true}).click();
 const sorted=samples.map(s=>s.pointerupToPaintMs).sort((a,b)=>a-b),mutations=samples.map(s=>s.mutationMs).sort((a,b)=>a-b);
 return {count,loaded:ids.length,device:await page.evaluate(()=>({userAgent:navigator.userAgent,cores:navigator.hardwareConcurrency,viewport:[innerWidth,innerHeight]})),samples,p95PointerupMs:sorted[Math.ceil(.95*sorted.length)-1],p95MutationMs:mutations[Math.ceil(.95*mutations.length)-1],chronology:true,pagination:true,noBlankLastCard:true,reactProfilerEntries:await page.evaluate(()=>performance.getEntriesByName('attention:render').map(e=>({duration:e.duration,detail:e.detail}))),at:new Date().toISOString()};
}
