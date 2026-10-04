import test from 'node:test';
import assert from 'node:assert/strict';
import { dropZoneAt, columnDropState } from './workpad-dnd-targets';
import { newBlock } from './workpad';

test('Visible side bands are broad while top/bottom edges always reorder', () => {
  const rect={left:100,top:200,width:600,height:80};
  assert.equal(dropZoneAt(rect,170,240,true),'column-left');
  assert.equal(dropZoneAt(rect,630,240,true),'column-right');
  assert.equal(dropZoneAt(rect,170,219,true),'before');
  assert.equal(dropZoneAt(rect,630,261,true),'after');
  assert.equal(dropZoneAt(rect,300,240,true),'child');
  assert.equal(dropZoneAt(rect,110,240,false),'sibling');
  assert.equal(dropZoneAt(rect,630,240,false),'child');
  assert.equal(dropZoneAt({left:0,top:0,width:180,height:36},60,18,true),'child');
});

test('Column previews reject own descendants and distinguish max3 from moving a whole column', () => {
  const parent=newBlock('H2','Parent'),child=newBlock('TEXT','Child',parent.id),a=newBlock(),b=newBlock(),flow=newBlock();
  const group=crypto.randomUUID();
  [parent,a,b].forEach((block,column)=>block.metadata={columnGroup:group,column});
  const blocks=[parent,child,a,b,flow];
  assert.equal(columnDropState(blocks,[parent.id],child),null);
  assert.equal(columnDropState(blocks,[parent.id],parent),null);
  assert.equal(columnDropState(blocks,[flow.id],a),'full');
  assert.equal(columnDropState(blocks,[parent.id],a),'available');
  assert.equal(columnDropState(blocks,[child.id],flow),'available');
});
