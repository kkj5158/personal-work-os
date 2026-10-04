import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBlock, normalize, cycleTodo, formatBlock, textStyle, enterBlock, dropBlocks, indentBlocks, boundaryDelete, emptyBackspace, structuralIds, cloneBlocks, numberedOrdinals } from './workpad';
import { columnOf, columnSegments } from './columns';

test('three-state cycle preserves text, headings, formatting and removes todo entirely',()=>{
  for(const type of ['TEXT','H1','H2','H3'] as const){
    let b=newBlock(type,'Release [[Notes]]');b.metadata={strike:true,numbered:true,wikiLinks:[{name:'Notes',ordinal:0,noteId:'note'}]};
    const original=structuredClone(b);
    for(let i=0;i<9;i++){
      b=cycleTodo(b);assert.equal(b.content,original.content);assert.equal(b.metadata.strike,true);assert.deepEqual(b.metadata.wikiLinks,original.metadata.wikiLinks);
      assert.equal(b.type,i%3===2?type:'CHECKLIST');assert.equal(b.checked,i%3===1);
      assert.equal(textStyle(b),type);
      if(i%3===2)assert.ok(!('textStyle' in b.metadata));
    }
  }
});
test('heading and todo commute; completed heading formatting remains completed',()=>{
  const b=newBlock('TEXT','Plan');
  for(const style of ['H1','H2','H3','TEXT'] as const){
    assert.deepEqual(cycleTodo(formatBlock(b,style)),formatBlock(cycleTodo(b),style));
    const done=formatBlock(cycleTodo(cycleTodo(b)),style);assert.equal(done.checked,true);
    assert.equal(cycleTodo(done).type,style);
  }
});
test('Enter after heading/to-do has independent style and checked state; split preserves compatible style',()=>{
  for(const style of ['H1','H2','H3'] as const)for(const todo of [0,1,2]){
    let b=newBlock(style,'abcdef');b.metadata={numbered:true};for(let i=0;i<todo;i++)b=cycleTodo(b);
    const result=enterBlock([b],b.id,6),next=result.blocks.find(v=>v.id===result.id)!;
    assert.equal(next.type,'TEXT');assert.equal(next.checked,false);assert.equal(next.metadata.numbered,undefined);assert.equal(next.metadata.textStyle,undefined);
    const split=enterBlock([b],b.id,3);assert.equal(textStyle(split.blocks[1]),style);assert.equal(split.blocks[1].checked,false);assert.equal(split.blocks.map(v=>v.content).join(''),'abcdef');
  }
});
function fixture(){const a=newBlock('H2','Plan'),b=newBlock('TEXT','Build'),c=newBlock('TEXT','Test'),d=newBlock('TEXT','Ship');return {a,b,c,d,rows:normalize([a,b,c,d])};}
test('side drop creates equal 2/3 logical columns and fourth is refused',()=>{
  const {a,b,c,d,rows}=fixture();let next=dropBlocks(rows,[b.id],a.id,'column-right');
  assert.equal(columnSegments(next)[0].columns.length,2);assert.equal(columnOf(next,next.find(v=>v.id===a.id)!)?.column,0);
  next=dropBlocks(next,[c.id],b.id,'column-right');assert.equal(columnSegments(next)[0].columns.length,3);
  assert.equal(dropBlocks(next,[d.id],c.id,'column-right'),next);
  assert.equal(next.length,4);assert.deepEqual(columnSegments(next)[0].columns.map(col=>col[0].content),['Plan','Build','Test']);
});
test('Enter, Tab, Shift+Tab and delete boundaries stay within column',()=>{
  const {a,b,rows}=fixture();let next=dropBlocks(rows,[b.id],a.id,'column-right');
  const enter=enterBlock(next,a.id,a.content.length);next=enter.blocks;
  assert.deepEqual(columnOf(next,next.find(v=>v.id===enter.id)!),columnOf(next,next.find(v=>v.id===a.id)!));
  const indented=indentBlocks(next,[b.id]);assert.equal(indented.find(v=>v.id===b.id)!.parentId,null,'first root cannot indent into prior column');
  const nested=indentBlocks(next,[enter.id]);assert.equal(nested.find(v=>v.id===enter.id)!.parentId,a.id);
  const out=indentBlocks(nested,[enter.id],true);assert.deepEqual(columnOf(out,out.find(v=>v.id===enter.id)!),columnOf(out,out.find(v=>v.id===a.id)!));
  assert.equal(boundaryDelete(next,enter.id,false),null,'Delete never joins the next column');
  assert.ok(!structuralIds(next,[a.id]).has(b.id),'heading section cannot capture another column');
});
test('move between columns, into flow and cleanup 3→2→1 preserve all content',()=>{
  const {a,b,c,d,rows}=fixture();let next=dropBlocks(dropBlocks(rows,[b.id],a.id,'column-right'),[c.id],b.id,'column-right');
  next=dropBlocks(next,[c.id],b.id,'after');assert.equal(columnSegments(next)[0].columns.length,2);assert.equal(columnOf(next,next.find(v=>v.id===c.id)!)?.column,1);
  next=dropBlocks(next,[b.id,c.id],d.id,'before');assert.ok(next.every(v=>!columnOf(next,v)));assert.equal(next.length,4);
});
test('empty column removal has safe focus and reload preserves ordered layout',()=>{
  const {a,b,c,rows}=fixture();let next=dropBlocks(rows,[b.id],a.id,'column-right');
  const inserted=enterBlock(next,b.id,b.content.length);next=inserted.blocks;
  const removed=emptyBackspace(next,inserted.id)!;assert.equal(removed.id,b.id);assert.equal(columnSegments(removed.blocks)[0].columns.length,2);
  next=normalize(next.filter(v=>v.id!==a.id));assert.ok(next.every(v=>!columnOf(next,v)));assert.ok(next.some(v=>v.id===c.id));
  const saved=dropBlocks(rows,[b.id],a.id,'column-left');assert.deepEqual(normalize(JSON.parse(JSON.stringify(saved))),saved);
  const copy=cloneBlocks(saved);assert.notEqual(columnOf(copy,copy[0])?.group,columnOf(saved,saved[0])?.group);
});
test('numbered lists run per column',()=>{
  const a=newBlock('NUMBERED','A'),b=newBlock('NUMBERED','B'),c=newBlock('NUMBERED','C');let next=dropBlocks(normalize([a,b,c]),[c.id],a.id,'column-right');
  next=dropBlocks(next,[b.id],a.id,'after');assert.deepEqual([...numberedOrdinals(next).values()],[1,2,1]);
});
