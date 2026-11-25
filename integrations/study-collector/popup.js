const el=id=>document.getElementById(id);
async function send(action){
    const r=await chrome.runtime.sendMessage({action,env:el('env').value,challenge:el('challenge').value.trim()});
    el('status').textContent=r.message;
    el('device').value=r.device??'';
    if(r.env)el('env').value=r.env;
    if(action==='bind')el('challenge').value='';
}
for(const action of ['prepare','bind','stop'])el(action).onclick=()=>send(action).catch(()=>el('status').textContent='연결 상태를 확인하세요.');
send('status').catch(()=>el('status').textContent='상태 확인 실패');
