import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { QuestionField, AnswerValue } from "./QuestionField";
import { emptyIdentities } from "./StructuredWriting";
import { answerKey, questionComplete, type Identity, type Question, type Answer } from "@/lib/authoring/types";

test("Identity stages edit one slot of the shared answer and never touch the other four",async()=>{
  const dom=new JSDOM("<div id='root'></div>",{url:"https://orbit.local"});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  // react-dom decides native input-event support on first import, so load it after the DOM exists.
  const {createRoot}=await import("react-dom/client");
  const root=createRoot(document.getElementById("root")!);
  const parts=[{key:"description",title:"묘사",prompt:"P1"},{key:"effort",title:"노력",prompt:"P2"},{key:"strategy",title:"전략",prompt:"P3"},{key:"adjustment",title:"조정",prompt:"P4"}] as const;
  const stage=(index:number):Question=>({questionKey:`identities.${index+1}`,type:"IDENTITY_WRITING",prompt:`정체성 ${index+1}`,metadata:{sourceQuestionKey:"identities",index,parts:[...parts]}});
  const names:Question={questionKey:"identities",type:"IDENTITIES",prompt:"다섯 정체성",metadata:{count:5}};
  let value=null as Answer, question=names;
  const render=()=>root.render(<QuestionField question={question} answers={{}} value={value} change={next=>{value=next;render();}} />);
  const type=async(el:HTMLInputElement|HTMLTextAreaElement,text:string)=>{
    const proto=el instanceof dom.window.HTMLTextAreaElement?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;
    await act(async()=>{Object.getOwnPropertyDescriptor(proto,"value")!.set!.call(el,text);el.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});
  };
  try{
    await act(()=>render());
    assert.equal(document.querySelectorAll("input").length,10,"five name and five one-line meaning inputs");
    assert.equal(document.querySelectorAll("textarea").length,0);
    await type(document.querySelectorAll("input")[2],"돌보는 사람");
    assert.equal((value as Identity[]).length,5);
    assert.deepEqual((value as Identity[]).map(x=>x.name),["","돌보는 사람","","",""]);
    assert.equal(answerKey(stage(1)),"identities");
    question=stage(1);await act(()=>render());
    assert.equal(document.querySelectorAll("textarea").length,4,"description, effort, strategy and adjustment only");
    assert.equal(document.querySelector<HTMLInputElement>(".authoring-identity-bar input")!.value,"돌보는 사람");
    await type(document.querySelectorAll("textarea")[0],"두 번째의 묘사");
    await type(document.querySelectorAll("textarea")[3],"두 번째의 조정");
    question=stage(4);await act(()=>render());
    assert.equal(document.querySelectorAll("textarea")[0].value,"","another identity starts empty");
    await type(document.querySelectorAll("textarea")[1],"다섯 번째의 노력");
    await type(document.querySelector<HTMLInputElement>(".authoring-identity-bar input")!,"배우는 사람");
    const saved=value as Identity[];
    assert.deepEqual(saved.map(x=>x.id),emptyIdentities().map(x=>x.id));
    assert.deepEqual([saved[1].name,saved[1].description,saved[1].adjustment,saved[1].effort],["돌보는 사람","두 번째의 묘사","두 번째의 조정",undefined]);
    assert.deepEqual([saved[4].name,saved[4].effort,saved[4].description],["배우는 사람","다섯 번째의 노력",undefined]);
    assert.deepEqual(saved[0],emptyIdentities()[0]);
    assert.equal(questionComplete(stage(1),{identities:saved}),false);
    assert.equal(questionComplete(stage(1),{identities:saved.map((x,i)=>i===1?{...x,effort:"e",strategy:"s"}:x)}),true);
    assert.equal(questionComplete(names,{identities:saved}),false);
    const html=renderToStaticMarkup(<AnswerValue type="IDENTITY_WRITING" value={saved} metadata={stage(1).metadata}/>);
    assert.match(html,/돌보는 사람/);assert.match(html,/두 번째의 묘사/);assert.doesNotMatch(html,/다섯 번째의 노력/);
    assert.match(renderToStaticMarkup(<AnswerValue type="IDENTITIES" value={saved}/>),/배우는 사람/);
  }finally{await act(()=>root.unmount());dom.window.close();}
});
