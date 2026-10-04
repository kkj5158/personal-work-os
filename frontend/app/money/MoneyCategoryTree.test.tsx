import {test} from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {act,type KeyboardEvent} from "react";
import {createRoot} from "react-dom/client";
import {MoneyAnchoredPopover,categoryColumnKey} from "./MoneyCategoryTree";

test("column keyboard arrows and Home/End move focus without a selection click",()=>{
 const dom=new JSDOM(`<div class="money-category-tree"><section class="money-tree-column"><button id="a">A</button><button id="b">B</button><button disabled>C</button></section><section class="money-tree-column"><button id="d">D</button></section></div>`);
 Object.assign(globalThis,{HTMLInputElement:dom.window.HTMLInputElement});
 const document=dom.window.document,a=document.getElementById("a") as HTMLButtonElement,b=document.getElementById("b") as HTMLButtonElement,d=document.getElementById("d") as HTMLButtonElement;
 let clicks=0;for(const node of [a,b,d])node.addEventListener("click",()=>clicks++);
 const key=(target:HTMLElement,key:string)=>categoryColumnKey({target,key,nativeEvent:{isComposing:false},preventDefault(){}} as unknown as KeyboardEvent<HTMLElement>);
 a.focus();key(a,"ArrowDown");assert.equal(document.activeElement,b);key(b,"Home");assert.equal(document.activeElement,a);key(a,"End");assert.equal(document.activeElement,b);key(b,"ArrowRight");assert.equal(document.activeElement,d);key(d,"ArrowLeft");assert.equal(document.activeElement,a);assert.equal(clicks,0);
 dom.window.close();
});
test("anchored popup clamps within viewport, ignores inside clicks, and cancels on Escape/outside",async()=>{
 const dom=new JSDOM('<div id="mount"></div>',{url:"http://localhost"});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,ResizeObserver:class {observe(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true});
 Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});
 let closes=0,panelCloses=0;const root=createRoot(dom.window.document.getElementById("mount")!);
 await act(async()=>{root.render(<div onKeyDown={e=>{if(e.key==="Escape")panelCloses++;}}><button id="origin">Open</button><MoneyAnchoredPopover label="test popup" onClose={()=>closes++}><input/><button id="inside">Inside</button></MoneyAnchoredPopover></div>);});
 const popup=dom.window.document.querySelector('[role="dialog"]') as HTMLElement;
 assert.ok(popup);assert.ok(parseInt(popup.style.left)>=12);assert.ok(parseInt(popup.style.top)>=12);assert.equal(popup.hasAttribute("aria-modal"),false);
 popup.dispatchEvent(new dom.window.Event("pointerdown",{bubbles:true}));assert.equal(closes,0);
 popup.querySelector("input")!.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));assert.equal(closes,1);assert.equal(panelCloses,0);assert.equal(dom.window.document.activeElement?.id,"origin");
 dom.window.document.body.dispatchEvent(new dom.window.Event("pointerdown",{bubbles:true}));assert.equal(closes,2);
 await act(async()=>root.unmount());dom.window.close();
});
