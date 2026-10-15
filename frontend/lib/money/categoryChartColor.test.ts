import {test} from 'node:test';
import assert from 'node:assert/strict';
import {categoryChartColor} from './categoryChartColor';
import {categoryTotals} from './categories';
import type {Category} from './model';
test('saved root/direct/L3 colors update presentation while category amounts remain identical',()=>{
  const categories=[{id:'root',name:'식비',color:'#111111',parentId:null},{id:'child',name:'카페',color:'#abcdef',parentId:'root'}] as Category[];
  const facts=[{categoryId:'root',amount:12000},{categoryId:'child',amount:6000},{categoryId:'child',amount:-1000}];
  const before=categoryTotals(categories,facts),recolored=categories.map(c=>({...c,color:c.id==='root'?'#123456':c.color}));
  assert.equal(categoryChartColor('root',recolored,'#fallback'),'#123456');
  assert.equal(categoryChartColor('direct:root',recolored,'#fallback'),'#123456');
  assert.equal(categoryChartColor('child',recolored,'#fallback'),'#abcdef');
  assert.equal(categoryChartColor('uncategorized',recolored,'#fallback'),'#fallback');
  assert.deepEqual(categoryTotals(recolored,facts),before);
});
