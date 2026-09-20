import assert from "node:assert/strict";
import {test} from "node:test";
import {CheckPersistence} from "./checkPersistence";
import type {DailyCheck} from "./types";
const check=(itemId:string,state:DailyCheck["state"]):DailyCheck=>({date:"2026-09-20",itemId,state,memo:""});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test("immediate updates, concurrent cells, ordered rapid clicks, and no refetch",async()=>{
 const writes:DailyCheck[]=[],ui:DailyCheck[]=[],errors:string[]=[];
 const pending:{resolve:()=>void;reject:(error:Error)=>void}[]=[];
 const queue=new CheckPersistence(c=>{writes.push(c);return new Promise<void>((resolve,reject)=>pending.push({resolve,reject}));},c=>ui.push(c),e=>errors.push(e));
 const a=queue.save(check("a","SUCCESS"));const a2=queue.save(check("a","UNRECORDED"));const b=queue.save(check("b","FAILURE"));
 assert.deepEqual(ui.map(c=>c.state),["SUCCESS","UNRECORDED","FAILURE"]);
 await tick();assert.deepEqual(writes.map(c=>c.itemId),["a","b"]);
 assert.equal(queue.overlay([]).find(c=>c.itemId==="a")?.state,"UNRECORDED");
 pending[0].resolve();pending[1].resolve();await tick();assert.equal(writes[2].state,"UNRECORDED");
 pending[2].resolve();await Promise.all([a,a2,b]);assert.deepEqual(errors,[]);
});
test("stale failure cannot revert newer input; latest failure restores last confirmed state",async()=>{
 const ui:DailyCheck[]=[],errors:string[]=[];const pending:{resolve:()=>void;reject:(error:Error)=>void}[]=[];
 const queue=new CheckPersistence(()=>new Promise<void>((resolve,reject)=>pending.push({resolve,reject})),c=>ui.push(c),e=>errors.push(e));
 const first=queue.save(check("a","SUCCESS"),check("a","MISSING")).catch(()=>{});
 const next=queue.save(check("a","UNRECORDED")).catch(()=>{});await tick();pending[0].reject(new Error("offline"));await tick();
 assert.equal(ui.at(-1)?.state,"UNRECORDED");assert.deepEqual(errors,[]);
 pending[1].resolve();await Promise.all([first,next]);
 const last=queue.save(check("a","FAILURE"),check("a","UNRECORDED")).catch(()=>{});await tick();pending[2].reject(new Error("offline"));await last;
 assert.equal(ui.at(-1)?.state,"UNRECORDED");assert.equal(errors.length,1);
});

test("a stale full reload cannot overwrite checks completed while its request was in flight",async()=>{
 const queue=new CheckPersistence(async()=>{},()=>{},()=>{});
 const checkpoint=queue.checkpoint();await queue.save(check("a","UNRECORDED"));
 assert.equal(queue.overlay([check("a","FAILURE")],checkpoint)[0].state,"UNRECORDED");
 assert.equal(queue.overlay([check("a","SUCCESS")],queue.checkpoint())[0].state,"SUCCESS");
});
