import {test} from "node:test";
import assert from "node:assert/strict";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {JSDOM} from "jsdom";
import {naverArchive as api,type RssItem,type RssStatus} from "../../lib/api/naverArchive";
import {RssSyncPanel} from "./RssSyncPanel";

test("RSS queue truthfully labels partial text, keeps pagination, and only starts owner completion on request",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:"https://synthetic.invalid"});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,React,IS_REACT_ACT_ENVIRONMENT:true});
 const original={...api};const root=createRoot(document.querySelector('#root')!);let chosen:RssItem|undefined,configured=false;const pages:(string|undefined)[]=[];
 const item=(id:string):RssItem=>({externalPostId:id,title:`SYNTHETIC ${id}`,category:null,publishedAt:null,originalUrl:`https://blog.naver.com/yozo990/${id}`,excerpt:"<img src=x onerror=alert(1)> 요약...",sourceSha256:"a".repeat(64),state:"PARTIAL_NEEDS_SOURCE",mediaIncomplete:true,truncated:true,linkedPostId:null,duplicateCandidates:[]});
 const status:RssStatus={available:true,enabled:false,version:1,blogId:"yozo990",fullArchiveEnabled:false,backlog:2,policyBlocked:false,coverageGap:false,lastAttemptAt:null,lastSuccessAt:null,nextRetryAt:null,lastErrorCategory:null,lastRun:null};
 api.rssStatus=async()=>({...status,enabled:configured});api.rssItems=async(cursor)=>{pages.push(cursor);return {items:[item(cursor?"2":"1")],total:2,nextCursor:cursor?null:"next"};};api.rssConfigure=async(enabled,version)=>{assert.equal(version,1);configured=enabled;return {...status,enabled};};api.rssRun=async()=>({state:"SUCCESS_RSS_ONLY",discovered:0,partial:2,inserted:0});
 const click=async(text:string)=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent===text);assert.ok(button,text);await act(async()=>{button.click();});};
 try{
  await act(async()=>{root.render(<RssSyncPanel refreshToken={0} onComplete={x=>{chosen=x;}} onOpenExisting={()=>{throw Error("not requested");}}/>);});
  assert.match(document.body.textContent!,/전체 본문 자동 보관은 지원하지 않습니다/);assert.equal(document.querySelectorAll('img').length,0);assert.equal(chosen,undefined);
  await click("다음 대기 글 보기");assert.equal(document.querySelectorAll('.na-rss-item').length,2);assert.deepEqual(pages,[undefined,"next"]);
  await click("전체 원문 직접 입력");assert.equal((chosen as RssItem|undefined)?.externalPostId,"1");
  await click("10분 자동 확인 켜기");assert.equal(configured,true);assert.match(document.querySelector('.na-rss>summary')!.textContent!,/10분마다 확인 중/);
  await click("지금 RSS 확인");assert.match(document.body.textContent!,/전체 보관 0건/);assert.match(document.body.textContent!,/원문 필요 2건/);
 }finally{Object.assign(api,original);await act(()=>root.unmount());dom.window.close();}
});

test("platform block disables network and enable actions while preserving the queue",async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,React,IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(document.querySelector('#root')!),original={...api};
 api.rssStatus=async()=>({available:true,enabled:false,version:2,blogId:"yozo990",fullArchiveEnabled:false,backlog:0,policyBlocked:true,coverageGap:true,lastAttemptAt:null,lastSuccessAt:null,nextRetryAt:null,lastErrorCategory:"POLICY_BLOCKED",lastRun:null});api.rssItems=async()=>({items:[],total:0,nextCursor:null});
 try{await act(async()=>{root.render(<RssSyncPanel refreshToken={0} onComplete={()=>{}} onOpenExisting={()=>{}}/>);});for(const text of ["10분 자동 확인 켜기","지금 RSS 확인"])assert.equal([...document.querySelectorAll('button')].find(x=>x.textContent===text)?.disabled,true);assert.match(document.body.textContent!,/POLICY_BLOCKED/);assert.match(document.body.textContent!,/누락은 소유자 백업으로 대조/);}finally{Object.assign(api,original);await act(()=>root.unmount());dom.window.close();}
});
