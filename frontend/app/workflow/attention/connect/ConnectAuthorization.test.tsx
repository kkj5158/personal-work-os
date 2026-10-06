import assert from 'node:assert/strict';
import {test} from 'node:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {apiClient} from '@/lib/api/client';
import {createSupabaseBrowserClient} from '@/lib/supabase/client';
import ConnectAuthorization,{type PairingRequest} from './ConnectAuthorization';

const request:PairingRequest={challenge:'A'.repeat(43),state:'s'.repeat(43),redirectUri:'http://127.0.0.1:49152/callback',installId:'11111111-1111-4111-8111-111111111111',deviceName:'WORK QUEUE Windows'};
const response={code:'SYNTHETIC_ONE_TIME_CODE',state:request.state!,redirectUri:request.redirectUri!};
type Session={user:{id:string;email:string}}|null;
async function fixture(run:(ctx:{emit:(session:Session)=>void;changeSession:(session:Session)=>void;click:()=>Promise<void>;resolve:(value:typeof response)=>void;reject:(error:Error)=>void;redirects:string[];unmount:()=>Promise<void>;dom:JSDOM;calls:()=>number})=>Promise<void>){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/workflow/attention/connect',pretendToBeVisual:true});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 let callback:(_event:string,session:Session)=>void=()=>{},release:(value:typeof response)=>void=()=>{},fail:(error:Error)=>void=()=>{},count=0,unmounted=false;
 let session:Session={user:{id:'owner-A',email:'owner-a@example.test'}};
 const client={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:(next:typeof callback)=>{callback=next;next('INITIAL_SESSION',session);return {data:{subscription:{unsubscribe:()=>{}}}};}}} as unknown as ReturnType<typeof createSupabaseBrowserClient>;
 const original=apiClient.post,redirects:string[]=[];
 apiClient.post=async(path,body)=>{count++;assert.equal(path,'/api/workflow/attention/device-authorizations');assert.deepEqual(body,request);return new Promise((resolve,reject)=>{release=value=>resolve(value as never);fail=reject;});};
 const root=createRoot(document.getElementById('root')!);
 const unmount=async()=>{if(!unmounted){await act(()=>root.unmount());unmounted=true;}};
 try{
  await act(async()=>{root.render(<ConnectAuthorization request={request} authClient={client} redirect={url=>redirects.push(url)}/>);});
  assert.match(document.querySelector('[aria-label="연결할 POS 계정"]')!.textContent!,/owner-a@example.test/);
  await run({emit:next=>{session=next;callback('SIGNED_IN',next);},changeSession:next=>{session=next;},click:async()=>{await act(async()=>{(document.querySelector('button') as HTMLButtonElement).click();await Promise.resolve();});},resolve:value=>release(value),reject:error=>fail(error),redirects,unmount,dom,calls:()=>count});
 }finally{await unmount();apiClient.post=original;dom.window.close();}
}

test('explicit confirmed owner authorizes once and receives only the expected one-time callback',async()=>fixture(async ctx=>{
 await ctx.click();await ctx.click();assert.equal(ctx.calls(),1);
 await act(async()=>{ctx.resolve(response);await Promise.resolve();});
 assert.equal(ctx.redirects.length,1);const url=new URL(ctx.redirects[0]);assert.equal(url.origin,'http://127.0.0.1:49152');assert.equal(url.pathname,'/callback');assert.equal(url.searchParams.get('code'),response.code);assert.equal(url.searchParams.get('state'),request.state);assert.equal([...url.searchParams].length,2);
 assert.equal(window.localStorage.length,0);assert.equal(window.sessionStorage.length,0);
}));
test('owner A late response cannot pair after owner B signs in',async()=>fixture(async ctx=>{
 await ctx.click();await act(async()=>{ctx.emit({user:{id:'owner-B',email:'owner-b@example.test'}});ctx.resolve(response);await Promise.resolve();});
 assert.equal(ctx.redirects.length,0);assert.match(document.querySelector('[aria-label="연결할 POS 계정"]')!.textContent!,/owner-b@example.test/);assert.equal(document.body.textContent!.includes(response.code),false);
}));
test('logout invalidates a pending pairing and requires a logged-in owner',async()=>fixture(async ctx=>{
 await ctx.click();await act(async()=>{ctx.emit(null);ctx.resolve(response);await Promise.resolve();});
 assert.equal(ctx.redirects.length,0);assert.equal((document.querySelector('button') as HTMLButtonElement).disabled,true);
}));
test('latest session owner is checked before redirect even when its auth event is delayed',async()=>fixture(async ctx=>{
 await ctx.click();await act(async()=>{ctx.changeSession({user:{id:'owner-B',email:'owner-b@example.test'}});ctx.resolve(response);await Promise.resolve();});assert.equal(ctx.redirects.length,0);
}));
test('backgrounding suppresses a late callback even after the page becomes visible again',async()=>fixture(async ctx=>{
 await ctx.click();await act(async()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new ctx.dom.window.Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new ctx.dom.window.Event('visibilitychange'));ctx.resolve(response);await Promise.resolve();});
 assert.equal(ctx.redirects.length,0);
}));
test('unmount cancels redirect side effects from an in-flight authorization',async()=>fixture(async ctx=>{
 await ctx.click();await ctx.unmount();ctx.resolve(response);await Promise.resolve();await Promise.resolve();assert.equal(ctx.redirects.length,0);
}));
test('session refresh for the same owner preserves the explicit pairing grant',async()=>fixture(async ctx=>{
 await ctx.click();await act(async()=>{ctx.emit({user:{id:'owner-A',email:'owner-a@example.test'}});ctx.resolve(response);await Promise.resolve();});assert.equal(ctx.redirects.length,1);
}));
test('mismatched callback is rejected generically',async()=>fixture(async ctx=>{
 await ctx.click();await act(async()=>{ctx.emit({user:{id:'owner-A',email:'owner-a@example.test'}});ctx.resolve({...response,redirectUri:'http://127.0.0.1:49999/callback'});await Promise.resolve();});
 assert.equal(ctx.redirects.length,0);assert.ok(document.querySelector('[role="alert"]'));assert.equal(document.body.textContent!.includes('49999'),false);assert.equal(document.body.textContent!.includes(response.code),false);
}));
test('private response errors remain generic',async()=>fixture(async ctx=>{
 await ctx.click();await act(async()=>{ctx.reject(new Error('PRIVATE_RESPONSE_WITH_SECRET'));await Promise.resolve();});assert.ok(document.querySelector('[role="alert"]'));assert.equal(document.body.textContent!.includes('PRIVATE_RESPONSE_WITH_SECRET'),false);
}));
