import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const observer=fs.readFileSync(new URL('../integrations/study-collector/observe.js',import.meta.url),'utf8');

function sample(buttons,turns) {
    let listener;
    const surface=name=>({
        name,
        querySelectorAll:()=>turns.map(turn=>({
            getClientRects:()=>turn.visible?[{}]:[],
            closest:()=>surfaces[turn.surface]
        }))
    });
    const surfaces={current:surface('current'),previous:surface('previous')};
    const document={
        hidden:false,hasFocus:()=>true,
        querySelectorAll:selector=>buttons.filter(button=>selector.includes(button.selector)).map(button=>({
            disabled:button.disabled,
            getClientRects:()=>button.visible?[{}]:[],
            closest:()=>surfaces[button.surface]
        }))
    };
    const runtime={onMessage:{addListener:fn=>{listener=fn;},removeListener(){} }};
    vm.runInNewContext(observer,{
        chrome:{runtime},location:{origin:'https://chatgpt.com',pathname:'/c/qa'},
        performance:{now:()=>0},AbortController,document,addEventListener(){},setInterval:()=>1,clearInterval(){}
    });
    let result;
    listener({action:'sample'},null,value=>{result=value;});
    return result.generating;
}

const stop={selector:'[aria-label="중지"]',visible:true,disabled:false,surface:'current'};
const turn={visible:true,surface:'current'};

test('Recognizes the Korean stop control and the legacy stop-button test ID',()=>{
    for(const selector of [stop.selector,'[data-testid="stop-button"]']){
        assert.equal(sample([{...stop,selector}],[turn]),true);
    }
});

test('Requires an enabled visible stop control and a visible turn on its own surface',()=>{
    for(const [buttons,turns] of [
        [[],[turn]],[[stop],[]],[[{...stop,disabled:true}],[turn]],
        [[{...stop,visible:false}],[turn]],[[stop],[{...turn,visible:false}]],
        [[stop],[{...turn,surface:'previous'}]]
    ]){
        assert.equal(sample(buttons,turns),false);
    }
});

