import assert from 'node:assert/strict';
import {test} from 'node:test';
import {legacyRows,visibleRows,relocate,layoutError,type RepresentativePreferences} from './layout';
test('3+3 collapse always renders a partial fifth-card row and retains its group',()=>{
 const p:RepresentativePreferences={accountIds:['a','b','c','d','e','f'],version:1,layout:{layoutVersion:1,rows:[{id:'living',name:'생활',accountIds:['a','b','c']},{id:'saving',name:'저축',accountIds:['d','e','f']}]}};
 assert.deepEqual(visibleRows(p,false).map(r=>r.accountIds),[['a','b','c'],['d','e']]);
 assert.equal(visibleRows(p,false)[1].name,'저축');assert.deepEqual(visibleRows(p,true)[1].accountIds,['d','e','f']);
 assert.equal(p.layout!.rows[1].accountIds.length,3);
});
test('empty rows are hidden without losing saved row identity; legacy adaptation never mutates ids',()=>{
 const ids=['a','b','c','d','e'];assert.deepEqual(legacyRows(ids).map(r=>r.accountIds),[['a','b','c'],['d','e']]);assert.equal(ids.length,5);
 const p:RepresentativePreferences={accountIds:ids,version:0,layout:{layoutVersion:1,rows:[{id:'empty',name:null,accountIds:[]},...legacyRows(ids)]}};assert.equal(visibleRows(p,false).length,2);
});
test('drag relocation protects capacity and validation rejects missing accounts and duplicates',()=>{
 const rows=legacyRows(['a','b','c','d']);assert.deepEqual(relocate(rows,'a','legacy-1').map(r=>r.accountIds),[['b','c'],['d','a']]);assert.equal(relocate(rows,'d','legacy-0'),rows);
 assert.equal(layoutError(rows,new Set(['a','b','c','d'])),'');assert.ok(layoutError(rows,new Set(['a','b','c'])));
 assert.ok(layoutError([{id:'r',name:null,accountIds:['a','a']}],new Set(['a'])));
});
