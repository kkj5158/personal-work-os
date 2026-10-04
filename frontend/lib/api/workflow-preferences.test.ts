import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiClient } from './client';
import { workflowApi, type TodoPreferences } from './workflow';

test('view preference patches preserve settings owned by other views', async () => {
  const original=apiClient.patch;
  const calls:{path:string;input:unknown}[]=[];
  apiClient.patch=async<T>(path:string,input?:unknown):Promise<T>=>{calls.push({path,input});return input as T;};
  try{
    const todo:TodoPreferences={groupMode:'PROJECT',projectOrder:[],sort:'PRIORITY',showCompleted:false,showUndated:true,rememberCollapse:true,collapsedProjects:[],workpadDockCollapsed:false};
    await workflowApi.savePreferences(todo);
    assert.equal(calls[0].path,'/api/workflow/preferences');
    assert.equal('workpadDockCollapsed' in (calls[0].input as object),false,'stale To-do settings cannot overwrite the dock choice');
    assert.equal((calls[0].input as TodoPreferences).sort,'PRIORITY');
    await workflowApi.patchPreferences({workpadDockCollapsed:true});
    assert.deepEqual(calls[1],{path:'/api/workflow/preferences',input:{workpadDockCollapsed:true}});
  }finally{apiClient.patch=original;}
});
