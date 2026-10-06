import assert from 'node:assert/strict';
import {test} from 'node:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {attentionApi} from '@/lib/api/attention';
import AttentionConnections from './AttentionConnections';

test('scoped producer issuance stays transient and revocation needs a separate explicit gesture',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const original={devices:attentionApi.devices,producer:attentionApi.producer,revoke:attentionApi.revoke};
 let issued=0,revoked=0,release:((value:Awaited<ReturnType<typeof attentionApi.producer>>)=>void)|undefined;
 const credential={token:'aqp_SYNTHETIC_TEST_ONLY',credentialId:'device-1',ownerId:'owner-fixture',expiresAt:'2030-01-01T00:00:00Z'};
 attentionApi.devices=async()=>[{id:'device-1',kind:'PRODUCER',name:'Codex 로컬',namespace:'codex-local',expiresAt:credential.expiresAt,revokedAt:null}];
 attentionApi.producer=async(name,namespace)=>{assert.equal(name,'Codex 로컬');assert.equal(namespace,'codex-local');issued++;return credential;};
 attentionApi.revoke=async(id)=>{assert.equal(id,'device-1');revoked++;};
 const root=createRoot(document.getElementById('root')!);
 const click=async(text:string)=>{await act(async()=>{const button=[...document.querySelectorAll('button')].find(button=>button.textContent===text);assert.ok(button);button.click();await Promise.resolve();});};
 try{
  await act(async()=>{root.render(<AttentionConnections/>);await Promise.resolve();});
  await click('새 에이전트 키 발급');assert.equal(issued,1);
  assert.equal((document.querySelector('input') as HTMLInputElement).value,credential.token);
  assert.equal(window.localStorage.length,0);assert.equal(window.sessionStorage.length,0);assert.equal(window.location.search,'');
  await act(async()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new dom.window.Event('visibilitychange'));});
  assert.equal(document.querySelector('input'),null);
  await click('연결 해제…');assert.equal(revoked,0);await click('취소');assert.equal(revoked,0);
  await click('연결 해제…');await click('이 연결 해제');assert.equal(revoked,1);
  attentionApi.producer=()=>new Promise(resolve=>{release=resolve;});
  await click('새 에이전트 키 발급');
  await act(async()=>{document.dispatchEvent(new dom.window.Event('visibilitychange'));release!(credential);await Promise.resolve();});
  assert.equal(document.querySelector('input'),null,'late issuance cannot disclose its result after tab backgrounding');
  attentionApi.producer=async()=>{throw Error('PRIVATE_RESPONSE_BODY');};
  await click('새 에이전트 키 발급');assert.ok(document.querySelector('[role=alert]'));assert.equal(document.body.textContent!.includes('PRIVATE_RESPONSE_BODY'),false);
 }finally{await act(()=>root.unmount());Object.assign(attentionApi,original);dom.window.close();}
});
