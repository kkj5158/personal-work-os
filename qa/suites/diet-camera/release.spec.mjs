import {test,expect,expectApi} from '../../helpers/browser.mjs';
const api=process.env.QA_API_URL;
test('camera.release.diet-reads',async({page})=>{
 for(const route of ['/diet','/diet/planner']){
  await expectApi(page,'/api/diet',()=>page.goto(route));
  await expect(page.locator('.diet-shell')).toBeVisible();
  await expect(page.getByText('DIET SYS 불러오는 중…',{exact:true})).toHaveCount(0);
  await expect(page.locator('.diet-error')).toHaveCount(0);
 }
});
test('camera.release.native-note',async({page})=>{
 const settings=await(await page.request.get(api+'/api/diet/note-sync')).json();
 expect(settings.enabled).toBe(true);expect(settings.workspaceId).toBeTruthy();
 const media=await(await page.request.get(api+'/api/diet/camera-media')).json();
 const active=media.filter(m=>!m.deletedAt&&!m.purgeRequested&&!m.projectionPending);
 expect(active.length,'Retained accepted Batch 4 Camera projection must exist').toBeGreaterThanOrEqual(4);
 const date=active[0].capturedDate;
 const notes=await(await page.request.get(`${api}/api/note-system/workspaces/${settings.workspaceId}/daily?end=${date}&days=1`)).json();
 const before=notes[0];expect(before.content).toContain(':::images');
 expect(before.content).toContain('Batch4 QA: preserve this user text');
 const blocks=[...before.content.matchAll(/^:::images ([^\n]+)\n:::/gm)].map(m=>JSON.parse(m[1]));
 const expected=blocks.reduce((n,b)=>n+b.images.length,0);
 await page.goto(`/notes?workspace=${settings.workspaceId}&module=DAILY_NOTES&date=${date}`);
 await expect(page.getByText('Batch4 QA: preserve this user text and',{exact:false}).first()).toBeVisible();
 await expect(page.locator('.media-cell img')).toHaveCount(expected);
 await expect.poll(()=>page.locator('.media-cell img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)),{timeout:30000}).toBe(true);
 const geometry=()=>page.locator('.media-row-images').evaluateAll(rows=>rows.map(r=>({direction:getComputedStyle(r).flexDirection,count:r.querySelectorAll('.media-cell').length})));
 expect((await geometry()).every(r=>r.direction==='row'&&r.count<=3)).toBe(true);
 await page.setViewportSize({width:390,height:1200});
 expect((await geometry()).every(r=>r.direction==='column')).toBe(true);
 const after=await(await page.request.get(`${api}/api/note-system/workspaces/${settings.workspaceId}/daily?end=${date}&days=1`)).json();
 expect(after[0].content).toBe(before.content);expect(after[0].version).toBe(before.version);
});
