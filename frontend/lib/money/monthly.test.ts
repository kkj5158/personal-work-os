import test from 'node:test';
import assert from 'node:assert/strict';
import {donutSectors,savingsPath} from './monthly';
import {categoryTotals} from './categories';

test('donut sectors keep refund-negative categories visible without invalid arcs',()=>{const rows=donutSectors([{id:'a',amount:60},{id:'b',amount:40},{id:'refund',amount:-15}]);assert.deepEqual(rows.map(row=>[row.start,row.share]),[[0,.6],[.6,.4],[1,0]]);});
test('hierarchical chart filters use canonical root, child and direct IDs',()=>{const categories=[{id:'root',name:'식비',color:'#111111',archived:false,version:0},{id:'child',parentId:'root',name:'카페',color:'#222222',archived:false,version:0}];const rows=categoryTotals(categories,[{categoryId:'root',amount:20},{categoryId:'child',amount:30}]);assert.equal(rows[0].amount,50);assert.deepEqual(rows[0].children.map(row=>row.id),['child','direct:root']);});
test('savings destination filter is independent of month totals and preserves paging',()=>{const url=new URL(savingsPath('2026-10-01','2026-10-31','owned','정기 적립',50),'https://example.test');assert.equal(url.pathname,'/bookkeeping/savings');assert.equal(url.searchParams.get('destinationAccountId'),'owned');assert.equal(url.searchParams.get('limit'),'50');assert.equal(url.searchParams.get('offset'),'50');assert.equal(url.searchParams.get('search'),'정기 적립');});
