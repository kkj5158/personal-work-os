import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBlock,normalize,ordered,dropBlocks,createColumn,subtreeIds,cycleTodo,textStyle,enterBlock,depth,type Block,type DropZone} from './workpad';
import {columnOf,columnSegments,withoutColumn} from './columns';

function fixture() {
  const before=newBlock('TEXT','Morning context'),parent=newBlock('H2','Release preparation');
  parent.metadata={numbered:true,strike:true,wikiLinks:[{name:'Release',ordinal:0,noteId:'release-note'}]};
  const paragraph=newBlock('TEXT','Read [[Release]] and https://example.com/spec',parent.id);
  paragraph.metadata={wikiLinks:[{name:'Release',ordinal:0,noteId:'release-note'}]};
  const open=newBlock('CHECKLIST','Review release notes',parent.id);
  open.workTaskId='existing-task';open.metadata={taskRef:'primary',textStyle:'TEXT'};
  const done=newBlock('CHECKLIST','Build completed',parent.id);done.checked=true;
  const heading=newBlock('CHECKLIST','Release evidence',parent.id);heading.metadata={textStyle:'H3',numbered:true};
  const nested=newBlock('TEXT','Nested evidence',heading.id);
  nested.sourceBlockId='original-evidence';nested.sourceDate='2026-10-01';
  const media=newBlock('IMAGE_GROUP','Screenshots',heading.id);
  media.metadata={layout:'row',images:[{id:'existing-image',width:75,caption:'Before deployment',description:'Evidence'}]};
  const last=newBlock('BULLET','Finish the checklist',parent.id);
  const after=newBlock('TEXT','Afternoon context'),third=newBlock('H1','Next project'),tail=newBlock('TEXT','Tomorrow');
  const family=[parent,paragraph,open,done,heading,nested,media,last];
  return {before,parent,paragraph,open,done,heading,nested,media,last,after,third,tail,family,rows:normalize([before,...family,after,third,tail])};
}

function assertIntegrity(before:Block[],after:Block[],reparented:string[]=[]) {
  assert.equal(after.length,before.length,'no blocks disappear or duplicate');
  assert.equal(new Set(after.map(b=>b.id)).size,after.length,'block identities stay unique');
  assert.deepEqual([...after.map(b=>b.id)].sort(),[...before.map(b=>b.id)].sort());
  for(const original of before) {
    const current=after.find(b=>b.id===original.id)!;
    assert.deepEqual({...current,parentId:null,order:0,metadata:{}},{...original,parentId:null,order:0,metadata:{}},'content, format, completion, task and source identities survive');
    assert.deepEqual(withoutColumn(current.metadata),withoutColumn(original.metadata),'wiki/media/formatting metadata survives');
    if(!reparented.includes(original.id))assert.equal(current.parentId,original.parentId,'descendant and unrelated hierarchy stays intact');
    if(current.parentId) {
      assert.ok(after.some(b=>b.id===current.parentId),'no orphan parent IDs');
      assert.equal(current.metadata.columnGroup,undefined,'descendants never own a column group');
      assert.equal(current.metadata.column,undefined);
    }
    const ancestors=new Set([current.id]);let ancestor=current.parentId;
    while(ancestor){assert.ok(!ancestors.has(ancestor),'no hierarchy cycles');ancestors.add(ancestor);ancestor=after.find(b=>b.id===ancestor)!.parentId;}
  }
  assert.deepEqual(ordered(JSON.parse(JSON.stringify(after))),after,'save/reload retains depth-first hierarchy and sibling order');
  for(const segment of columnSegments(after))assert.ok(segment.columns.length>=1&&segment.columns.length<=3);
}

function assertFamilyOrder(rows:Block[],family:Block[]) {
  const ids=new Set(family.map(b=>b.id));
  assert.deepEqual(rows.filter(b=>ids.has(b.id)).map(b=>b.id),family.map(b=>b.id),'descendant relative order is unchanged');
  const positions=rows.flatMap((b,index)=>ids.has(b.id)?[index]:[]);
  assert.equal(positions.at(-1)!-positions[0]+1,family.length,'a dragged subtree stays contiguous');
}

test('mixed heading subtree moves upward/downward in normal flow without capturing unrelated heading section text',()=>{
  const f=fixture(),original=structuredClone(f.rows);
  const up=dropBlocks(f.rows,[f.parent.id],f.before.id,'before');
  assert.deepEqual(up.slice(0,f.family.length).map(b=>b.id),f.family.map(b=>b.id));
  assertIntegrity(f.rows,up);assertFamilyOrder(up,f.family);
  const down=dropBlocks(up,[f.parent.id],f.tail.id,'after');
  assert.deepEqual(down.slice(-f.family.length).map(b=>b.id),f.family.map(b=>b.id));
  assertIntegrity(f.rows,down);assertFamilyOrder(down,f.family);
  assert.deepEqual(f.rows,original,'drag calculations do not mutate the source');
});

test('all vertical target zones move parent plus multi-level descendants and reparent only the selected root',()=>{
  for(const zone of ['before','after','child','sibling'] as const) {
    const f=fixture(),destination=newBlock('H1','Destination'),target=newBlock('TEXT','Destination child',destination.id);
    const leaf=newBlock('TEXT','Destination grandchild',target.id),sibling=newBlock('TEXT','Destination final child',destination.id);
    const rows=normalize([...f.rows,destination,target,leaf,sibling]);
    const next=dropBlocks(rows,[f.parent.id],target.id,zone);
    const expectedParent=zone==='child'?target.id:zone==='sibling'?null:destination.id;
    assert.equal(next.find(b=>b.id===f.parent.id)!.parentId,expectedParent);
    assertIntegrity(rows,next,[f.parent.id]);assertFamilyOrder(next,f.family);
    if(zone==='before')assert.ok(next.findIndex(b=>b.id===f.last.id)<next.findIndex(b=>b.id===target.id));
    if(zone==='after'||zone==='child')assert.ok(next.findIndex(b=>b.id===f.parent.id)>next.findIndex(b=>b.id===leaf.id));
    if(zone==='sibling')assert.ok(next.findIndex(b=>b.id===f.parent.id)>next.findIndex(b=>b.id===sibling.id));
  }
});

test('directly dragging a nested heading child moves only that child subtree',()=>{
  const f=fixture(),family=[f.heading,f.nested,f.media];
  const next=dropBlocks(f.rows,[f.heading.id],f.before.id,'before');
  assert.deepEqual(next.slice(0,family.length).map(b=>b.id),family.map(b=>b.id));
  assert.equal(next.find(b=>b.id===f.heading.id)!.parentId,null);
  assert.equal(next.find(b=>b.id===f.parent.id)!.parentId,null);
  assert.equal(next.find(b=>b.id===f.open.id)!.parentId,f.parent.id);
  assertIntegrity(f.rows,next,[f.heading.id]);assertFamilyOrder(next,family);
});

test('directly dragging a leaf moves that block only, preserving its parent and all other children',()=>{
  const f=fixture();assert.equal(subtreeIds(f.rows,[f.open.id]).size,1);
  const next=dropBlocks(f.rows,[f.open.id],f.before.id,'before');
  assert.equal(next[0].id,f.open.id);assert.equal(next[0].parentId,null);
  assertIntegrity(f.rows,next,[f.open.id]);
  assert.deepEqual(next.filter(b=>b.parentId===f.parent.id).map(b=>b.id),[f.paragraph.id,f.done.id,f.heading.id,f.last.id]);
});

test('overlapping multi-selection deduplicates descendants and preserves document order rather than selection order',()=>{
  const f=fixture();
  const next=dropBlocks(f.rows,[f.after.id,f.nested.id,f.parent.id,f.heading.id,f.parent.id],f.tail.id,'after');
  assert.deepEqual(next.slice(-(f.family.length+1)).map(b=>b.id),[...f.family.map(b=>b.id),f.after.id]);
  assertIntegrity(f.rows,next);assertFamilyOrder(next,f.family);
});

test('every drop zone rejects self and descendant targets without changing state',()=>{
  const f=fixture();
  for(const zone of ['before','after','child','sibling','column-left','column-right'] as DropZone[])
    for(const target of f.family)assert.equal(dropBlocks(f.rows,[f.parent.id],target.id,zone),f.rows);
  assert.equal(createColumn(f.rows,[f.parent.id],f.nested.id),f.rows);
  assert.equal(dropBlocks(f.rows,[],f.before.id,'before'),f.rows);
  assert.equal(dropBlocks(f.rows,['missing'],f.before.id,'before'),f.rows);
  assert.equal(dropBlocks(f.rows,[f.parent.id],'missing','after'),f.rows);
});

test('left/right side creation carries mixed subtrees with inherited root-only placement',()=>{
  for(const zone of ['column-left','column-right'] as const) {
    const f=fixture(),next=dropBlocks(f.rows,[f.parent.id],f.after.id,zone);
    const layout=columnOf(next,next.find(b=>b.id===f.parent.id)!)!;
    assert.equal(layout.column,zone==='column-left'?0:1);
    for(const b of f.family)assert.deepEqual(columnOf(next,next.find(row=>row.id===b.id)!),layout);
    assertIntegrity(f.rows,next);assertFamilyOrder(next,f.family);
  }
});

test('flow to existing column and reordering inside a column preserve complete subtree',()=>{
  const f=fixture();let rows=dropBlocks(f.rows,[f.after.id],f.before.id,'column-right');
  rows=dropBlocks(rows,[f.parent.id],f.after.id,'after');
  const layout=columnOf(rows,rows.find(b=>b.id===f.after.id)!);
  assert.deepEqual(columnOf(rows,rows.find(b=>b.id===f.parent.id)!),layout);
  rows=dropBlocks(rows,[f.parent.id],f.after.id,'before');
  assert.ok(rows.findIndex(b=>b.id===f.last.id)<rows.findIndex(b=>b.id===f.after.id));
  assertIntegrity(f.rows,rows);assertFamilyOrder(rows,f.family);
});

test('two to three columns retain hierarchy; moving between columns cleans three to two and moving out returns to flow',()=>{
  const f=fixture();let rows=dropBlocks(f.rows,[f.parent.id],f.after.id,'column-right');
  rows=dropBlocks(rows,[f.third.id],f.parent.id,'column-right');
  assert.equal(columnSegments(rows).find(s=>s.columns.length>1)!.columns.length,3);
  assertIntegrity(f.rows,rows);assertFamilyOrder(rows,f.family);
  const atLimit=rows;assert.equal(dropBlocks(rows,[f.tail.id],f.third.id,'column-right'),atLimit,'fourth column refused');
  rows=dropBlocks(rows,[f.parent.id],f.after.id,'before');
  assert.equal(columnSegments(rows).find(s=>s.columns.length>1)!.columns.length,2);
  assert.equal(columnOf(rows,rows.find(b=>b.id===f.parent.id)!)!.column,0);
  assertIntegrity(f.rows,rows);assertFamilyOrder(rows,f.family);
  rows=dropBlocks(rows,[f.parent.id,f.after.id],f.tail.id,'after');
  assert.ok(rows.every(b=>columnOf(rows,b)===null),'remaining single column metadata is removed');
  assertIntegrity(f.rows,rows);assertFamilyOrder(rows,f.family);
});

test('direct child subtree can create a third column without moving its parent or siblings',()=>{
  const f=fixture();let rows=dropBlocks(f.rows,[f.parent.id],f.after.id,'column-right');
  rows=dropBlocks(rows,[f.heading.id],f.parent.id,'column-right');
  assert.equal(columnSegments(rows).find(s=>s.columns.length>1)!.columns.length,3);
  assert.equal(rows.find(b=>b.id===f.heading.id)!.parentId,null);
  assert.equal(rows.find(b=>b.id===f.open.id)!.parentId,f.parent.id);
  assert.equal(columnOf(rows,rows.find(b=>b.id===f.parent.id)!)!.column,1);
  assert.equal(columnOf(rows,rows.find(b=>b.id===f.heading.id)!)!.column,2);
  assertIntegrity(f.rows,rows,[f.heading.id]);assertFamilyOrder(rows,[f.heading,f.nested,f.media]);
});

test('side reposition within an existing three-column group is allowed when the source column empties',()=>{
  for(const left of [false,true]) {
    const f=fixture();let rows=dropBlocks(f.rows,[f.parent.id],f.after.id,'column-right');
    rows=dropBlocks(rows,[f.third.id],f.parent.id,'column-right');
    rows=dropBlocks(rows,[f.parent.id],left?f.after.id:f.third.id,left?'column-left':'column-right');
    const segment=columnSegments(rows).find(s=>s.columns.length>1)!;
    assert.deepEqual(segment.columns.map(column=>column[0].id),left?[f.parent.id,f.after.id,f.third.id]:[f.after.id,f.third.id,f.parent.id]);
    assertIntegrity(f.rows,rows);assertFamilyOrder(rows,f.family);
  }
});

test('side movement of multiple roots in one column preserves their order and cleans the emptied source column',()=>{
  const f=fixture();let rows=dropBlocks(f.rows,[f.parent.id],f.after.id,'column-right');
  rows=dropBlocks(rows,[f.before.id],f.parent.id,'before');
  rows=dropBlocks(rows,[f.third.id],f.parent.id,'column-right');
  rows=dropBlocks(rows,[f.parent.id,f.before.id,f.nested.id],f.after.id,'column-left');
  const segment=columnSegments(rows).find(s=>s.columns.length>1)!;
  assert.deepEqual(segment.columns.map(column=>column[0].id),[f.before.id,f.after.id,f.third.id]);
  assert.deepEqual(segment.columns[0].map(b=>b.id),[f.before.id,...f.family.map(b=>b.id)]);
  assertIntegrity(f.rows,rows);assertFamilyOrder(rows,f.family);
});

test('heading and child todo cycles and Enter keep their hierarchy and column after parent movement',()=>{
  const f=fixture(),rows=dropBlocks(f.rows,[f.parent.id],f.after.id,'column-right');
  for(const id of [f.parent.id,f.paragraph.id,f.heading.id]) {
    const original=rows.find(b=>b.id===id)!;
    let block=original.type==='CHECKLIST'?cycleTodo(cycleTodo(original)):original;
    const normal=block;
    for(let n=0;n<3;n++)block=cycleTodo(block);
    assert.deepEqual(block,normal);assert.equal(block.parentId,original.parentId);
    assert.equal(textStyle(block),textStyle(original));
    const inserted=enterBlock(rows,id,original.content.length),next=inserted.blocks.find(b=>b.id===inserted.id)!;
    assert.equal(next.type,'TEXT');assert.equal(next.parentId,original.parentId);
    assert.deepEqual(columnOf(inserted.blocks,next),columnOf(rows,original));
    assert.equal(depth(inserted.blocks,next.id),depth(rows,original.id));
  }
});
