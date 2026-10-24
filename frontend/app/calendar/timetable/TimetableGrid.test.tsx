import assert from "node:assert/strict";
import {test} from "node:test";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {JSDOM} from "jsdom";
import {TimetableGrid} from "./TimetableGrid";
import type {TimetableBlock} from "@/lib/api/timetables";

test("pointer drag and resize preview the entire creation group and emit the anchored placement",async()=>{
 const dom=new JSDOM("<div id='root'></div>",{url:"https://pos.local/calendar"});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
 Object.assign(dom.window.HTMLElement.prototype,{setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:700,height:1440,right:700,bottom:1440,x:0,y:0,toJSON(){}};}});
 const blocks:TimetableBlock[]=[1,2,3,4,5].map(weekday=>({id:`b${weekday}`,timetableId:"t",title:"알바",weekday,startMinute:540,durationMinutes:60,memo:"",color:null,version:0,deletedAt:null,creationGroupId:"g"}));
 blocks.push({...blocks[2],id:"single",creationGroupId:null});
 const moves:{before:TimetableBlock;after:TimetableBlock}[]=[];const root=createRoot(document.getElementById('root')!);
 const pointer=(target:Element,type:string,x:number,y:number)=>{const e=new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y});Object.defineProperty(e,'pointerId',{value:1});target.dispatchEvent(e);};
 const preview=()=>Array.from(document.querySelectorAll<HTMLElement>('[data-block]')).filter(el=>el.dataset.block!=="single").map(el=>[el.dataset.weekday,el.dataset.start,el.dataset.end]);
 try{
  await act(()=>root.render(<TimetableGrid id="t" blocks={blocks} defaultColor={null} busy={false} onCreate={()=>{}} onEdit={()=>{}} onMove={(before,after)=>{moves.push({before,after});}}/>));
  const grid=document.querySelector('.tt-time-grid')!,anchor=()=>document.querySelector('[data-block="b3"]')!;
  await act(()=>pointer(anchor(),'pointerdown',250,555));await act(()=>pointer(grid,'pointermove',350,615));
  assert.deepEqual(preview(),[2,3,4,5,6].map(day=>[String(day),'600','660']));assert.equal(document.querySelector<HTMLElement>('[data-block="single"]')?.dataset.start,'540');
  await act(()=>pointer(grid,'pointerup',350,615));assert.equal(moves.length,1);assert.equal(moves[0].before.id,'b3');assert.equal(moves[0].after.weekday,4);assert.equal(moves[0].after.startMinute,600);
  await act(()=>pointer(anchor().querySelector('[data-resize]')!,'pointerdown',250,599));await act(()=>pointer(grid,'pointermove',250,629));
  assert.deepEqual(preview(),[1,2,3,4,5].map(day=>[String(day),'540','630']));
  await act(()=>pointer(grid,'pointerup',250,629));assert.equal(moves[1].after.durationMinutes,90);
 }finally{await act(()=>root.unmount());dom.window.close();}
});
