import {test} from "node:test";
import assert from "node:assert/strict";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {JSDOM} from "jsdom";
import {ArchiveDateNotice} from "./ArchiveDateNotice";

test("undated discovery remains visible for an empty date range and offers a return path",async()=>{
 const dom=new JSDOM('<div id="root"></div>');
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,React,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.querySelector('#root')!);let missing=0,all=0;
 try{
  await act(()=>root.render(<ArchiveDateNotice unknownDates={282} showingUnknown={false} hasDateRange onShowUnknown={()=>missing++} onShowAll={()=>all++}/>));
  assert.match(document.body.textContent!,/282건도 보관/);
  assert.match(document.body.textContent!,/날짜 범위에는 포함되지 않습니다/);
  await act(()=>document.querySelector('button')!.click());assert.equal(missing,1);
  await act(()=>root.render(<ArchiveDateNotice unknownDates={282} showingUnknown hasDateRange={false} onShowUnknown={()=>missing++} onShowAll={()=>all++}/>));
  assert.match(document.body.textContent!,/순서는 게시일 순서가 아닙니다/);
  await act(()=>document.querySelector('button')!.click());assert.equal(all,1);
  await act(()=>root.render(<ArchiveDateNotice unknownDates={0} showingUnknown={false} hasDateRange={false} onShowUnknown={()=>missing++} onShowAll={()=>all++}/>));
  assert.equal(document.querySelector('section'),null);
 }finally{await act(()=>root.unmount());dom.window.close();}
});
