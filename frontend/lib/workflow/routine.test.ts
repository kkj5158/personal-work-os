import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBlock,indentBlocks,dropBlocks} from './workpad';
import {clearRoutineChecks,restoreRoutineChecks,routineProgress} from './routine';
test('reset scope, nested checks and undo retain later text, order, headings and deletions',()=>{
  const heading=newBlock('H1','Heading'),one=newBlock('CHECKLIST','One'),two=newBlock('CHECKLIST','Two',one.id),text=newBlock('TEXT','Body');
  one.checked=true;two.checked=true;const original=[heading,one,two,text];
  const {ids,blocks}=clearRoutineChecks(original);assert.deepEqual(routineProgress(blocks),{completed:0,total:2});
  const later=blocks.filter(b=>b.id!==two.id).map(b=>b.id===one.id?{...b,content:'Later'}:b);
  const restored=restoreRoutineChecks(later,ids);assert.equal(restored.length,3);assert.equal(restored[1].content,'Later');assert.equal(restored[1].checked,true);
  assert.deepEqual(routineProgress([]),{completed:0,total:0});assert.deepEqual(original[0],restored[0]);
  assert.equal(indentBlocks(blocks,[one.id])[1].parentId,heading.id);
  assert.equal(dropBlocks(blocks,[text.id],heading.id,'before')[0].id,text.id);
});
