import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { QuestionField, AnswerValue } from "./QuestionField";
import { emptyEpochs, emptyGoal } from "./StructuredWriting";
import { answerKey, answerFor, questionComplete, type Goal, type Epoch, type Question, type Answer } from "@/lib/authoring/types";
import { tabTarget } from "@/lib/globalTabs";

test("All six programs retain one shell identity across runner and report",()=>{
  for(const program of ["quick-motivation","recovery","reality","grounded-future","past","review"]){
    const path=`/authoring/${program}/session/b79b7a86-0e98-426b-8d06-b8e82ca09df5`;
    assert.equal(tabTarget(path)?.contextKey,tabTarget(`${path}/report`)?.contextKey);
    assert.equal(tabTarget(path)?.system,"AUTHORING");
  }
});
test("Virtual steps share canonical answers and completion checks understand nested writing",()=>{
  const q:Question={questionKey:"goals.deepDive",type:"GOAL_DEEP_DIVE",prompt:"Deep Dive",metadata:{sourceQuestionKey:"goals"}};
  const goals=Array.from({length:6},(_,i)=>({...emptyGoal(),title:`G${i}`,description:"description",why:"why",impact:"impact",strategy:"strategy",obstacles:"obstacles",benchmark:"benchmark"}));
  assert.equal(answerKey(q),"goals"); assert.equal(answerFor(q,{goals}),goals);assert.equal(questionComplete(q,{goals}),true);
  assert.equal(questionComplete(q,{goals:goals.map((g,i)=>i===1?{...g,benchmark:""}:g)}),false);
  assert.equal(questionComplete({...q,type:"GOALS"},{goals:goals.slice(0,5)}),false);
  const epochs=emptyEpochs().map((e,i)=>({...e,title:`E${i}`,experiences:[{id:`x${i}`,title:"event",event:"raw event",effects:"raw effects",critical:i===0}]}));
  for(const type of ["EPOCHS","EXPERIENCES","EFFECTS","CRITICAL"] as const) assert.equal(questionComplete({questionKey:"epochs",type,prompt:"",metadata:{sourceQuestionKey:"epochs"}},{epochs}),true);
  assert.equal(questionComplete({questionKey:"epochs",type:"EFFECTS",prompt:""},{epochs:epochs.map((e,i)=>i===0?{...e,experiences:[{...e.experiences[0],effects:""}]}:e)}),false);
});
test("Goal reorder and Critical deselection preserve all authored text and enforce limits",async()=>{
  const dom=new JSDOM("<div id='root'></div>",{url:"https://orbit.local"});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(document.getElementById("root")!);
  let value:Answer=[{...emptyGoal(),title:"A",why:"A why",benchmark:"A benchmark"},{...emptyGoal(),title:"B",why:"B why"}];
  const render=(type:Question["type"])=>root.render(<QuestionField question={{questionKey:"q",type,prompt:"Writing"}} answers={{}} value={value} change={next=>{value=next;render(type);}} />);
  try{
    await act(()=>render("GOALS"));await act(()=>document.querySelector<HTMLButtonElement>('[aria-label="목표 1 아래로"]')!.click());
    assert.deepEqual((value as Goal[]).map(g=>[g.title,g.why]),[["B","B why"],["A","A why"]]);
    assert.equal((value as Goal[])[1].benchmark,"A benchmark");
    value=emptyEpochs().map((e,i)=>({...e,title:`Epoch${i}`,experiences:Array.from({length:2},(_,n)=>({id:`${i}-${n}`,title:`X${i}${n}`,event:"original event",effects:"original effects",critical:i<5}))}));
    await act(()=>render("CRITICAL"));
    assert.equal(document.querySelectorAll('input:disabled').length,4);
    await act(()=>document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    const experience=(value as Epoch[])[0].experiences[0];
    assert.deepEqual(experience,{id:"0-0",title:"X00",event:"original event",effects:"original effects",critical:false});
    assert.equal(document.querySelectorAll('input:disabled').length,0);
    await act(()=>render("EFFECTS"));assert.match(document.body.textContent??"",/original event/);
    assert.equal(document.querySelector<HTMLTextAreaElement>('textarea')!.value,"original effects");
    value=emptyEpochs();await act(()=>render("EPOCHS"));assert.equal(document.querySelectorAll('input').length,7);
  }finally{await act(()=>root.unmount());dom.window.close();}
});
test("Raw partial writing remains visible in reports and effects stay separate from event entry",()=>{
  const epochs=emptyEpochs();epochs[0].experiences=[{id:"x",title:"partial",event:"event-only",effects:"analysis-only",critical:false}];
  const html=renderToStaticMarkup(<AnswerValue type="EXPERIENCES" value={epochs}/>);
  assert.match(html,/event-only/);assert.doesNotMatch(html,/analysis-only/);
  const effects=renderToStaticMarkup(<AnswerValue type="EFFECTS" value={epochs}/>);
  assert.match(effects,/analysis-only/);
  assert.match(renderToStaticMarkup(<AnswerValue type="CLASSIFICATION" value={[{text:"unfinished raw",classification:""}]}/>),/unfinished raw/);
});
