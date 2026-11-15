import {test} from 'node:test';
import assert from 'node:assert/strict';
import {project,target,patchFor} from './pos-api-autodeploy.mjs';
test('environment and API identities cannot be selected arbitrarily',()=>{
 assert.equal(project,'2b52b232-38b2-44b6-b97e-4caba54f90bc');
 assert.notEqual(target('dev').service,target('prod').service);
 for(const value of ['',undefined,'production','postgres','web','other-project'])assert.throws(()=>target(value));
});
test('only the API source is patched; explicit null survives JSON encoding',()=>{
 for(const name of ['dev','prod']){
  const t=target(name),p=JSON.parse(JSON.stringify(patchFor(name)));
  assert.deepEqual(Object.keys(p),['services']);assert.deepEqual(Object.keys(p.services),[t.service]);
  assert.deepEqual(Object.keys(p.services[t.service]),['source']);
  assert.deepEqual(p.services[t.service].source,{repo:'kkj5158/personal-work-os',branch:name,commitSha:null});
 }
});
