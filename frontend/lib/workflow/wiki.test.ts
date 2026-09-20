import assert from 'node:assert/strict';
import { reconcileLinks, wikiQuery } from './wiki';
const a={name:'Same',ordinal:0,noteId:'A'},b={name:'Same',ordinal:1,noteId:'B'};
assert.deepEqual(reconcileLinks('[[Same]] [[Same]]','[[Same]]',[a,b],{start:0,end:9}),[{...b,ordinal:0}]);
assert.deepEqual(reconcileLinks('[[Same]]','before [[Same]]',[a]),[a]);
assert.deepEqual(reconcileLinks('[[Same]]','[[Changed]]',[a]),[]);
assert.deepEqual(reconcileLinks('[[Same]]','',[a]),[]);
assert.equal(wikiQuery('Discuss [[Plan',14)?.query,'Plan');
console.log('PASS resolved occurrences survive edits without rebinding duplicate names');
