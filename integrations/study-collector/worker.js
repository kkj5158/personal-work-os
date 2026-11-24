const origins={dev:'https://workflow-api-development-development.up.railway.app',prod:'https://personal-work-os-prod-production.up.railway.app'};
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
let serial=Promise.resolve(), previous, anchor, nextFlush=0, failures=0, queuedTick=false;
function serialize(fn){const next=serial.then(fn);serial=next.catch(()=>{});return next;}
async function request(b,path,body){
    const response=await fetch(origins[b.env]+'/api/study/activity/'+path,{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
        signal:AbortSignal.timeout(5000),headers:{Authorization:'StudyCollector '+b.secret,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!response.ok)throw Object.assign(Error('측정 서버 응답 '+response.status),{status:response.status});
    return response.status===204||path==='revoke'?{}:response.json();
}
async function tabIdentity(tab){
    const u=new URL(tab.url??'about:blank');
    const match=u.origin==='https://chatgpt.com' && u.pathname.match(/^\/(?:g\/[^/]+\/)?c\/([a-f\d-]{36})\/?$/i);
    if(!match)throw Error('주소가 정해진 ChatGPT 대화에서 열어주세요.');
    return hash(match[1]);
}
async function active(){const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});return tab;}
async function clear(reason){
    const {binding}=await chrome.storage.session.get('binding');
    if(binding)await chrome.tabs.sendMessage(binding.tab,{action:'detach'}).catch(()=>{});
    previous=null;anchor=null;nextFlush=0;failures=0;
    await chrome.alarms.clear('study');
    await chrome.storage.session.remove(['binding','pending']);
    await chrome.storage.local.remove('outbox');
    await chrome.storage.session.set({message:reason});
    await chrome.action.setBadgeText({text:''});
}
function calibrate(reply){anchor={sec:reply.serverSecond,mono:performance.now(),wall:Date.now()};}
function seconds(){return anchor.sec+Math.floor((performance.now()-anchor.mono)/1000);}
async function sample(invalidate=false){
    const {binding:b}=await chrome.storage.session.get('binding');if(!b)return;
    const {outbox=[]}=await chrome.storage.local.get('outbox');
    try{
        if(!anchor || Math.abs(Date.now()-anchor.wall-(performance.now()-anchor.mono))>1800){
            previous=null;
            if(!anchor && outbox.length){await flush(b,outbox);return;}
            const reply=await request(b,'heartbeat',{generation:b.generation,ackSequence:b.ack});
            calibrate(reply);b.lease=reply.leaseUntil;await chrome.storage.session.set({binding:b});
        }
        const end=seconds();if(end>b.lease){await clear('연결 기한이 지나 미관측으로 처리했습니다. 다시 연결하세요.');return;}
        let state, idleAt;
        const tab=await chrome.tabs.get(b.tab);
        if(await tabIdentity(tab)!==b.chat){await clear('대화가 변경되었습니다. 새 대화에서 다시 연결하세요.');return;}
        const win=await chrome.windows.get(tab.windowId),os=await chrome.idle.queryState(300);
        if(!win.focused || !tab.active || os==='locked'){state='AWAY';}
        else {
            const page=await chrome.tabs.sendMessage(b.tab,{action:'sample'}).catch(()=>null);
            if(!page?.bound){previous=null;return;}
            idleAt=page.generating?Infinity:end+Math.ceil((300000-page.idleMs)/1000);
            state=!page.visible?'AWAY':!page.generating&&(os==='idle'||page.idleMs>=300000)?'IDLE':'STUDYING';
        }
        // A delayed wake, document transition or ambiguous eligibility transition leaves a gap.
        if(!invalidate && previous && end>previous.end && end-previous.end<=40){
            let until=end;
            if(previous.state==='STUDYING')until=Math.min(end,previous.idleAt??end);
            if(state===previous.state && until>previous.end)addSpan(outbox,b,previous.end,until,state);
            else if(previous.state==='STUDYING' && state==='IDLE' && previous.idleAt<=end){
                if(until>previous.end)addSpan(outbox,b,previous.end,until,'STUDYING');
                if(until<end)addSpan(outbox,b,Math.max(until,previous.end),end,'IDLE');
            }
        }
        previous={end,state,idleAt};
        if(outbox.length>1000){await clear('측정 대기열 한도를 넘었습니다. 다시 연결하세요.');return;}
        await chrome.storage.local.set({outbox});
        if(performance.now()>=nextFlush)await flush(b,outbox);
    }catch(e){
        previous=null;
        if(e.status && e.status<500 && e.status!==429){await clear('측정 연결이 종료되었습니다. 필요하면 다시 연결하세요.');return;}
        failures++;nextFlush=performance.now()+Math.min(60000,2000*2**Math.min(failures,5))+Math.random()*1500;
        await chrome.storage.session.set({message:'연결 지연 · 확인되지 않은 시간은 미관측입니다.'});
    }
}
function addSpan(outbox,b,start,end,state){
    const last=outbox.at(-1);
    if(last && !last.sent && last.state===state && last.end===start && end-last.start<=60){last.end=end;return;}
    outbox.push({sequence:(last?.sequence??b.ack)+1,start,end,state});
}
async function flush(b,outbox){
    const events=outbox.slice(0,32);let reply;
    if(events.length){
        for(const event of events)event.sent=true;
        await chrome.storage.local.set({outbox});
        reply=await request(b,'events/batch',{generation:b.generation,batchId:crypto.randomUUID(),
            events:events.map(({sent,...interval})=>interval)});
    }else reply=await request(b,'heartbeat',{generation:b.generation,ackSequence:b.ack});
    // Persist the acknowledged prefix before compaction; replays are safe after worker suspension.
    b.ack=reply.ackSequence;b.lease=reply.leaseUntil;await chrome.storage.session.set({binding:b,message:'연결됨 · 감지된 활동만 기록합니다.'});
    await chrome.storage.local.set({outbox:outbox.filter(e=>e.sequence>b.ack)});
    if(!anchor)calibrate(reply);
    failures=0;nextFlush=performance.now()+30000;
}
async function popup(m){
    const {pending,binding,message}=await chrome.storage.session.get(['pending','binding','message']);
    if(m.action==='status')return {message:message??'연결 대기',device:pending?.device,env:pending?.env??binding?.env};
    if(m.action==='stop'){if(binding)await request(binding,'revoke',{}).catch(()=>{});await clear('측정 해제됨');return {message:'측정 해제됨'};}
    const t=await active(),chat=await tabIdentity(t);
    if(m.action==='prepare'){
        if(!Object.hasOwn(origins,m.env))throw Error('환경을 확인하세요.');
        const key=secret(),device=await hash(key);
        await chrome.storage.session.set({pending:{env:m.env,chat,tab:t.id,secret:key,device},message:'기기 코드를 POS 학습 기록에 입력하세요.'});
        return {device,message:'POS 학습 기록에서 확인 코드를 발급받으세요.'};
    }
    if(m.action!=='bind'||!pending||pending.chat!==chat||pending.tab!==t.id||pending.env!==m.env)throw Error('먼저 이 대화에서 기기 코드를 받으세요.');
    const r=await request(pending,'bind',{challenge:m.challenge});
    if(binding)await request(binding,'revoke',{}).catch(()=>{});
    await clear('연결 중');
    await chrome.scripting.executeScript({target:{tabId:t.id},files:['observe.js']});
    await chrome.storage.session.set({binding:{...pending,generation:r.generation,ack:r.ackSequence,lease:r.leaseUntil},message:'측정 연결됨'});
    calibrate(r);chrome.idle.setDetectionInterval(300);
    await chrome.alarms.create('study',{periodInMinutes:0.5});await chrome.action.setBadgeText({text:'ON'});
    return {message:'측정 연결됨'};
}
function schedule(invalidate=false){
    if(invalidate)previous=null;
    if(queuedTick)return;queuedTick=true;
    serialize(async()=>{try{await sample(invalidate);}finally{queuedTick=false;}}).catch(()=>{});
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
    if(sender.id!==chrome.runtime.id)return;
    if(m.action==='tick'&&sender.tab){chrome.storage.session.get('binding').then(({binding})=>{
        if(binding?.tab===sender.tab.id){schedule();reply({});}else reply({detach:true});});return true;}
    if(sender.url!==chrome.runtime.getURL('popup.html'))return;
    serialize(()=>popup(m)).then(reply,e=>reply({message:e.message}));return true;
});
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='study')schedule();});
chrome.windows.onFocusChanged.addListener(()=>schedule(true));
chrome.tabs.onActivated.addListener(()=>schedule(true));
chrome.idle.onStateChanged.addListener(()=>schedule(true));
chrome.tabs.onRemoved.addListener(id=>serialize(async()=>{const {binding}=await chrome.storage.session.get('binding');if(binding?.tab===id)await clear('탭이 닫혔습니다.');}));
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status==='loading'||change.url)serialize(async()=>{
    const {binding}=await chrome.storage.session.get('binding');if(binding?.tab===id)await clear('페이지 이동 후 다시 연결하세요.');
});});
chrome.runtime.onStartup.addListener(()=>serialize(()=>clear('브라우저 재시작 후 다시 연결하세요.')));
