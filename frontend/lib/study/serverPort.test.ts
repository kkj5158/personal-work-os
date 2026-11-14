import assert from "node:assert/strict";
import { test } from "node:test";
import { apiClient } from "../api/client";
import { fixtureSnapshot } from "./fixtures";
import { createServerStudyPort } from "./serverPort";
import { bindingFor, responseKey, type StudySnapshot } from "./model";

test("server adapter serializes autosave, false, empty removal and explicit private review", async()=>{
  const originalGet=apiClient.get,originalScoped=apiClient.scoped;
  let state:StudySnapshot={...fixtureSnapshot(new Date("2026-10-27T01:00:00Z")),ownerId:"owner",revision:0,drafts:{},attempts:[]};
  const calls:{path:string;body:unknown}[]=[];
  apiClient.get=async path=>(path.endsWith("capabilities")?{storage:"BLOCKED"}:structuredClone(state)) as never;
  apiClient.scoped=async(_owner,path,method,body)=>{
    if(method!=="POST")return (path.endsWith("capabilities")?{storage:"BLOCKED"}:structuredClone(state)) as never;
    calls.push({path,body});
    if(path.includes("/review")){state={...state,revision:state.revision!+1};return [] as never;}
    const input=body as {expectedRevision:number;action:string;data:{binding:ReturnType<typeof bindingFor>;response:{value?:boolean;selected?:string[]}}};
    assert.equal(input.expectedRevision,state.revision);
    if(input.action==="draft.save"){
      const {binding,response}=input.data,key=responseKey(binding);state=structuredClone(state);
      if(Array.isArray(response.selected)&&!response.selected.length)delete state.drafts[key];else state.drafts[key]={binding,response:response as {value:boolean},updatedAt:new Date().toISOString()};
    }
    state={...state,revision:state.revision!+1};return structuredClone(state) as never;
  };
  const port=createServerStudyPort();
  try{
    await port.refresh();assert.equal(port.mode,"server");assert.equal(port.capabilities?.storage,"BLOCKED");assert.equal(calls.length,0);
    const pkg=state.packages[0],q=pkg.extension.find(q=>q.kind==="true_false")!,binding=bindingFor(pkg,"extension",q);
    port.saveDraft(binding,{value:true});port.saveDraft(binding,{value:false});
    await port.readAnswerKeys(pkg.id,pkg.version,"extension");
    assert.equal(calls.length,2);assert.ok(calls[0].path.endsWith("commands"));assert.ok(calls[1].path.includes("/review"));assert.deepEqual(port.getSnapshot().drafts[responseKey(binding)].response,{value:false});
    const multiple=pkg.extension.find(q=>q.kind==="multiple_choice")!,multiBinding=bindingFor(pkg,"extension",multiple);
    port.saveDraft(multiBinding,{selected:[multiple.options![0].id]});await port.readAnswerKeys(pkg.id,pkg.version,"extension");
    port.saveDraft(multiBinding,{selected:[]});await port.readAnswerKeys(pkg.id,pkg.version,"extension");assert.equal(port.getSnapshot().drafts[responseKey(multiBinding)],undefined);
  }finally{port.dispose();apiClient.get=originalGet;apiClient.scoped=originalScoped;}
});

test("uncertain network retry preserves operation identity and never reports success before acknowledgment",async()=>{
  const originalGet=apiClient.get,originalScoped=apiClient.scoped;
  let state:StudySnapshot={...fixtureSnapshot(),ownerId:"owner",revision:0};let fail=true;
  const bodies:unknown[]=[];
  apiClient.get=async path=>(path.endsWith("capabilities")?{storage:"BLOCKED"}:structuredClone(state)) as never;
  apiClient.scoped=async(_owner,path,method,body)=>{if(method!=="POST")return structuredClone(state) as never;bodies.push(body);if(fail){fail=false;throw new Error("synthetic network failure");}state={...state,revision:1,feedback:[{id:"saved",text:"feedback",state:"pending_analysis",createdAt:new Date().toISOString()}]};return structuredClone(state) as never;};
  const port=createServerStudyPort();try{await port.refresh();await assert.rejects(Promise.resolve(port.addFeedback("feedback")));assert.equal(port.getSnapshot().connection?.state,"error");await port.retry();assert.deepEqual(bodies[0],bodies[1]);assert.equal(port.getSnapshot().connection?.state,"ready");assert.equal(port.getSnapshot().feedback.length,1);}finally{port.dispose();apiClient.get=originalGet;apiClient.scoped=originalScoped;}
});
