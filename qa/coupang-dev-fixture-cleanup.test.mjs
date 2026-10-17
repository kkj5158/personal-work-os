import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = (await fs.readFile(new URL('./coupang-dev-fixture-cleanup.mjs', import.meta.url), 'utf8'))
  .replace("import fs from 'node:fs/promises';", '')
  .replace("import assert from 'node:assert/strict';", '');
const owner = '10000000-0000-4000-8000-000000000001';
const templates = [
  { id:'e5d650fb-0dd9-4b21-a057-0b64ba1852e8', name:'QA Coupang 20261017', version:2, active:true, presets:[] },
  { id:'9fc35d3a-152f-4037-8161-ea90f76b361b', name:'QA Coupang other 20261017', version:1, active:true, presets:[] },
];
const rows = [
  ['af60badc-3254-4edc-a05a-84e19f93baf0','2026-10-14',8],
  ['2007f2c5-fd80-4f80-be8f-abf766edaecd','2026-10-15',2],
  ['4a562239-e6b0-4244-ae74-b72d5954c42a','2026-10-16',1],
  ['eb7a2a34-f162-43c0-9407-962c0e79b91e','2026-10-17',1],
  ['6551f277-fe64-4e92-9287-16ddd142281e','2026-10-18',1],
  ['6330da53-c011-4fe4-819a-1a5e0f33bba5','2026-10-19',1],
].map(([id,workDate,version])=>({id,workDate,version,contractVersion:4,removed:false,templateId:templates[0].id,payments:[],receiptConfirmationHistory:[]}));

async function run(scenario, execute=false) {
  const data = new Map([...templates,...rows].map(r=>[r.id,structuredClone(r)]));
  const calls=[], logs=[];
  let week={version:1,specialWorkAllowance:10000,weeklyHolidayAllowance:15000,dailyFingerprint:'offline-fingerprint'};
  if(scenario==='stale') data.get(rows[3].id).version=8;
  if(scenario==='payments') data.get(rows[0].id).payments=[{id:'historical-payment-preserve'}];
  if(scenario==='foreignTemplate') data.get(rows[0].id).templateId='20000000-0000-4000-8000-000000000001';
  const token = 'eyJhbGciOiJFUzI1NiJ9.'+Buffer.from(JSON.stringify({iss:'https://pos-auth-dev-development.up.railway.app/auth/v1',sub:owner,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.OFFLINE_SIGNATURE';
  const processMock={env:{COUPANG_DEV_ACCESS_TOKEN_FILE:'offline-private-file',COUPANG_DEV_EXPECTED_USER_ID:scenario==='wrongOwner'?'20000000-0000-4000-8000-000000000001':owner},argv:execute?['node','test','--execute']:['node','test'],exitCode:0};
  const fetchMock=async(url,options)=>{
    assert.equal(new URL(url).origin,'https://workflow-api-development-development.up.railway.app');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,'Bearer '+token);
    const path=new URL(url).pathname, id=path.split('/').at(-1);
    calls.push({method:options.method,path});
    if(scenario==='http401') return {ok:false,status:401};
    if(options.method==='GET') return {ok:true,status:200,json:async()=>structuredClone(path.includes('earnings-weeks')?week:data.get(id))};
    const body=JSON.parse(options.body);
    if(path.endsWith('/remove-off')) {
      const item=data.get(path.split('/').at(-2)); assert.equal(body.expectedVersion,item.version); item.removed=true;item.version++;
      return {ok:true,status:200,json:async()=>structuredClone(item)};
    }
    if(path.includes('earnings-weeks')) { assert.equal(body.expectedVersion,week.version);week={...week,...body,version:week.version+1};return {ok:true,status:200,json:async()=>structuredClone(week)}; }
    const item=data.get(id);
    if(body.expectedVersion===item.version) {
      Object.assign(item,{...body,version:item.version+1});delete item.expectedVersion;
    } else {
      if(item.removed) return {ok:false,status:409};
      assert.equal(body.expectedVersion,item.version-1);
      if(scenario==='badReplay') item.version++;
    }
    return {ok:true,status:200,json:async()=>structuredClone(item)};
  };
  const context=vm.createContext({fs:{readFile:async()=>token},assert,Buffer,AbortSignal,Date,fetch:fetchMock,process:processMock,console:{log:s=>logs.push(s),error:s=>logs.push(s)}});
  await vm.runInContext('(async()=>{'+source+'})()',context);
  assert(!logs.join('\n').includes(token),'token leaked');
  return {calls,logs,code:processMock.exitCode,data,week};
}
test('dry-run validates every fixture and performs only GET',async()=>{
  const r=await run('ok');assert.equal(r.code,0);assert.equal(r.calls.length,9);assert(r.calls.every(c=>c.method==='GET'));
});
for(const scenario of ['stale','payments','foreignTemplate','wrongOwner','http401']) test(scenario+' stops before any mutation',async()=>{
  const r=await run(scenario,true);assert.equal(r.code,1);assert(r.calls.every(c=>c.method==='GET'));assert(r.logs.some(s=>s.includes('STOPPED')));
});
test('exact cleanup replays each OFF request, archives only allowlisted rows and preserves payments',async()=>{
  const r=await run('ok',true);assert.equal(r.code,0);
  for(const row of rows){const saved=r.data.get(row.id);assert.equal(saved.removed,true);assert.deepEqual(saved.payments,[]);assert.equal(saved.version,row.version+2);}
  assert.equal(r.calls.filter(c=>c.method==='PUT'&&c.path.includes('earnings-records')).length,18);
  assert.equal(r.week.specialWorkAllowance,0);assert.equal(r.week.weeklyHolidayAllowance,0);
  assert(templates.every(t=>!r.data.get(t.id).active));
});
test('replay version drift stops before archive and subsequent fixture mutations',async()=>{
  const r=await run('badReplay',true);assert.equal(r.code,1);assert.equal(r.calls.filter(c=>c.method==='POST').length,0);assert.equal(r.calls.filter(c=>c.method==='PUT').length,2);
});
