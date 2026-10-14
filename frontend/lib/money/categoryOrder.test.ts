import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reorderCategorySlots} from './categoryOrder';
const rows=[{id:'a',group:'one'},{id:'other',group:'two'},{id:'b',group:'one'},{id:'c',group:'one'}];
test('before/after sorting preserves other group slots and rejects cross-group drops',()=>{
  const scope=(item:typeof rows[number])=>item.group;
  assert.deepEqual(reorderCategorySlots(rows,'a','b',false,scope).map(x=>x.id),['a','other','b','c']);
  assert.deepEqual(reorderCategorySlots(rows,'a','b',true,scope).map(x=>x.id),['b','other','a','c']);
  assert.deepEqual(reorderCategorySlots(rows,'c','a',false,scope).map(x=>x.id),['c','other','a','b']);
  assert.equal(reorderCategorySlots(rows,'a','other',true,scope),rows);
  assert.deepEqual(rows.map(x=>x.id),['a','other','b','c']);
});
