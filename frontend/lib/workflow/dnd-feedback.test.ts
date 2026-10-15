import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {installDragPolish} from './dnd';

test('shared native drag feedback leaves Workpad feedback to its own editor',async()=>{
 const dom=new JSDOM('<div class="wp-editor"><div data-dnd-row id="workpad"><button draggable="true">grip</button></div></div><div data-dnd-row id="catalog"><button draggable="true">grip</button></div>');
 const prior={window:globalThis.window,document:globalThis.document,Element:globalThis.Element};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Element:dom.window.Element});
 const release=installDragPolish();let images=0;
 const transfer={setDragImage:()=>images++};
 const start=(id:string)=>{const e=new dom.window.Event('dragstart',{bubbles:true});Object.defineProperty(e,'dataTransfer',{value:transfer});document.querySelector(`#${id} button`)!.dispatchEvent(e);};
 try{
  start('workpad');await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(images,0);assert.equal(document.querySelector('#workpad')!.classList.contains('wf-drag-source'),false);
  assert.equal(document.body.classList.contains('wf-dnd-active'),false);
  start('catalog');await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(images,1);assert.equal(document.querySelector('#catalog')!.classList.contains('wf-drag-source'),true);
  document.querySelector('#catalog button')!.dispatchEvent(new dom.window.Event('dragend',{bubbles:true}));
  assert.equal(document.querySelector('#catalog')!.classList.contains('wf-drag-source'),false);
 }finally{release();Object.assign(globalThis,prior);dom.window.close();}
});
