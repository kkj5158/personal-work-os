import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MoneyRowCoordinator} from './rowCoordinator';
import type {BookRow} from '../../app/money/MoneyWebData';
const row={id:'one',version:0,transactionVersion:1,projectionVersion:0,classificationVersion:0,title:'source',memo:null} as BookRow;
const applied=(book:BookRow)=>({requestId:'request',status:'APPLIED',result:{book}});
function transport(get:(path:string)=>Promise<unknown>,post:(path:string,body:unknown)=>Promise<unknown>){return {get:get as <T>(path:string)=>Promise<T>,post:post as <T>(path:string,body:unknown)=>Promise<T>};}
test('lost response looks up the original request; serial text saves use acknowledged versions',async()=>{
 const bodies:Record<string,unknown>[]=[];let calls=0;
 const c=new MoneyRowCoordinator(transport(async()=>applied({...row,version:1,title:'first'}),async(_,body)=>{bodies.push(body as Record<string,unknown>);if(++calls===1)throw Error('response lost');return applied({...row,version:2,title:'second'});}),()=> 'request');
 const one=c.edit(row,{title:'first'}),two=c.edit(row,{title:'second'});await one;await two;
 assert.equal(calls,2);assert.equal(bodies[1].overrideVersion,1);assert.equal(c.snapshot('one')?.title,'second');
});
test('explicit retry looks up outcome before resending exactly the same durable request',async()=>{
 const sequence:string[]=[],bodies:Record<string,unknown>[]=[];const c=new MoneyRowCoordinator(transport(async()=>{sequence.push('get');return {status:'UNKNOWN',result:{}};},async(_,body)=>{sequence.push('post');bodies.push(body as Record<string,unknown>);throw Error('lost');}),()=> 'request');
 await assert.rejects(c.edit(row,{memo:'draft'}),/결과/);await assert.rejects(c.edit(row,{memo:'new draft'}),/결과/);assert.deepEqual(sequence,['post','get','get','post','get']);assert.equal(bodies.length,2);assert.deepEqual(bodies[1],bodies[0]);assert.equal(c.snapshot('one'),null);
});

test('unfinished classification stage blocks bundle before transport; session change ignores late response',async()=>{
 let posts=0;let resolve!:(v:unknown)=>void;const pending=new Promise(r=>{resolve=r;});const c=new MoneyRowCoordinator(transport(async()=>null,async()=>{posts++;return pending;}));
 const release=c.registerDraft('one','classification-stage',async()=>{throw Error('unfinished root');});await assert.rejects(c.classify([{id:'one'}]),/unfinished root/);assert.equal(posts,0);release();
 const edit=c.edit(row,{title:'draft'});await new Promise(r=>setTimeout(r,0));c.dispose();resolve(applied({...row,version:1,title:'draft'}));await assert.rejects(edit,/세션/);assert.equal(c.snapshot('one'),null);
});
test('equal bookkeeping versions take fresh classification metadata from the server',()=>{
 const c=new MoneyRowCoordinator(transport(async()=>null,async()=>null));c.acknowledge({...row,version:1,classificationVersion:1,futureReferenceExcluded:false});
 const fresh={...row,version:1,classificationVersion:2,futureReferenceExcluded:true};assert.equal(c.latest(fresh),fresh);
});
test('session drafts survive row unmount and are discarded on explicit cancellation or owner boundary',()=>{
 const c=new MoneyRowCoordinator(transport(async()=>null,async()=>null));c.keepDraft('one','title','unsaved latest');const release=c.registerDraft('one','title',async()=>{});release();assert.equal(c.draft('one','title'),'unsaved latest');c.discardDraft('one','title');assert.equal(c.draft('one','title'),undefined);c.keepDraft('one','category-root','draft root');c.dispose();assert.equal(c.draft('one','category-root'),undefined);
});
