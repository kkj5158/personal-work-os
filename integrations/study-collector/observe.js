// Injected into one explicitly selected document. No input values or message content are read.
(()=>{
    globalThis.posStudyStop?.();
    const path=location.pathname;
    const listeners=new AbortController();
    let lastInput=performance.now(), lastNotice=0;
    function stop(){
        clearInterval(tick);listeners.abort();delete globalThis.posStudyStop;
        chrome.runtime.onMessage.removeListener(onMessage);
    }
    function valid(){return location.origin==='https://chatgpt.com' && location.pathname===path;}
    function onMessage(message,sender,reply){
        if(message.action==='detach'){stop();reply({});return;}
        if(message.action==='sample'){
            if(!valid()){stop();reply({bound:false});return;}
            const streaming=!!document.querySelector('main [data-is-streaming="true"],main [data-talvt-turn-state="in_progress"]');
            const stopButton=document.querySelector('button[data-testid="stop-button"]');
            const generating=streaming && !!stopButton && !stopButton.disabled && stopButton.getClientRects().length>0;
            reply({bound:true,generating,visible:!document.hidden && document.hasFocus(),idleMs:Math.max(0,performance.now()-lastInput)});
        }
    }
    function signal(e){
        if(!valid()){stop();return;}
        if(e && !e.isTrusted)return;
        if(e && ['keydown','pointerdown','pointermove','wheel','touchstart'].includes(e.type) && !document.hidden && document.hasFocus())lastInput=performance.now();
        if(performance.now()-lastNotice<900 && e && !['blur','visibilitychange','focus'].includes(e.type))return;
        lastNotice=performance.now();
        chrome.runtime.sendMessage({action:'tick'}).then(r=>{if(r?.detach)stop();}).catch(stop);
    }
    const tick=setInterval(signal,5000);
    globalThis.posStudyStop=stop;
    chrome.runtime.onMessage.addListener(onMessage);
    for(const type of ['keydown','pointerdown','pointermove','wheel','touchstart','blur','focus','visibilitychange'])
        addEventListener(type,signal,{capture:true,passive:true,signal:listeners.signal});
})();
