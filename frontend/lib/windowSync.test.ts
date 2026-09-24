import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { createWindowSync, ENTITY_CHANGE_STORAGE_KEY, isEntityChange, type EntityChange } from "./windowSync";
test("independent windows receive revision metadata and duplicate transports notify once", () => {
  const a = new JSDOM("", {url:"https://orbit.local"}), b = new JSDOM("", {url:"https://orbit.local"});
  const channels: {onmessage: ((event: {data: unknown}) => void) | null}[] = [];
  class Channel {
    onmessage: ((event: {data: unknown}) => void) | null = null;
    constructor() {channels.push(this);}
    postMessage(data: unknown) {for (const channel of channels) if(channel !== this) channel.onmessage?.({data});}
    close() {channels.splice(channels.indexOf(this),1);}
  }
  Object.assign(a.window, {BroadcastChannel:Channel}); Object.assign(b.window, {BroadcastChannel:Channel});
  const one=createWindowSync(a.window as unknown as Window), two=createWindowSync(b.window as unknown as Window);
  const received: EntityChange[]=[];
  const local: EntityChange[]=[];
  const offOne=one.subscribe(event=>local.push(event)), offTwo=two.subscribe(event=>received.push(event));
  assert.notEqual(one.windowInstanceId,two.windowInstanceId);
  one.publish({entityType:"workpad",entityId:"2026-09-24",revision:13});
  assert.equal(local.length,1); assert.equal(received.length,1);
  b.window.dispatchEvent(new b.window.StorageEvent("storage",{key:ENTITY_CHANGE_STORAGE_KEY,newValue:JSON.stringify(received[0])}));
  assert.equal(received.length,1);
  assert.deepEqual(Object.keys(received[0]).sort(),["entityId","entityType","eventId","revision","windowInstanceId"]);
  offOne(); offTwo(); assert.equal(channels.length,0); a.window.close();b.window.close();
});
test("storage fallback ignores malformed events and remains usable without a channel", () => {
  const dom=new JSDOM("",{url:"https://orbit.local"});
  const sync=createWindowSync(dom.window as unknown as Window), received:EntityChange[]=[];
  const off=sync.subscribe(event=>received.push(event));
  const event={entityType:"note",entityId:"one",revision:3,windowInstanceId:"other",eventId:"unique"};
  for(const value of ["bad",JSON.stringify({...event,revision:-1}),JSON.stringify(event)]) dom.window.dispatchEvent(new dom.window.StorageEvent("storage",{key:ENTITY_CHANGE_STORAGE_KEY,newValue:value}));
  assert.deepEqual(received,[event]);assert.equal(isEntityChange({...event,revision:Infinity}),false);
  off();dom.window.close();
});
