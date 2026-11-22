import assert from 'node:assert/strict';
import {test} from 'node:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {attentionApi,type AttentionDevice} from '@/lib/api/attention';
import AttentionConnections from './AttentionConnections';
test('expired producer restore requires confirmation; revoked and Windows keys have separate paths',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const original={devices:attentionApi.devices,restore:attentionApi.restore};let restores=0;
 const rows:AttentionDevice[]=[{id:'p',kind:'PRODUCER',name:'Codex expired',namespace:'codex-local',expiresAt:'2000-01-01T00:00:00Z',revokedAt:null},{id:'w',kind:'DEVICE',name:'Windows expired',namespace:'human',expiresAt:'2000-01-01T00:00:00Z',revokedAt:null},{id:'r',kind:'PRODUCER',name:'Revoked',namespace:'team-kafka',expiresAt:null,revokedAt:'2001-01-01T00:00:00Z'}];
 attentionApi.devices=async()=>rows;attentionApi.restore=async id=>{assert.equal(id,'p');restores++;rows[0]={...rows[0],expiresAt:null,persistent:true};};
 const root=createRoot(document.getElementById('root')!);const click=async(text:string)=>act(async()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent===text);assert.ok(b,text);b.click();await Promise.resolve();});
 try{await act(async()=>{root.render(<AttentionConnections/>);await Promise.resolve();});await click('복구');assert.equal(restores,0);await click('기존 키 보관 확인 · 복구');assert.equal(restores,1);assert.equal(document.body.textContent?.includes('Invalid Date'),false);await click('재연결');assert.match(document.body.textContent!,/수집기에서 연결을 다시 시작/);assert.equal(document.querySelector('details li button'),null);await click('Windows 수집기 연결 안내');assert.match(document.body.textContent!,/이 계정으로 브라우저에서 승인/);assert.equal([...document.querySelectorAll('button')].some(x=>x.textContent==='새 에이전트 키 발급'),false);}finally{await act(()=>root.unmount());Object.assign(attentionApi,original);dom.window.close();}
});
