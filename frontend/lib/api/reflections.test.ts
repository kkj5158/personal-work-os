import assert from "node:assert/strict";
import {test} from "node:test";
import {apiClient,ApiError} from "./client";
import {openReflection} from "./reflections";
const entry={id:"reflection",date:"2020-01-03",content:"",status:"EDITING",version:0,snapshot:null};
test("concurrent open shares creation and never navigates through workOsRoute",async t=>{
  let posts=0;t.mock.method(apiClient,"get",async()=>{throw new ApiError(404,"missing");});
  t.mock.method(apiClient,"post",async()=>{posts++;return {...entry,workOsRoute:"/worklog"};});
  const [a,b]=await Promise.all([openReflection(entry.date),openReflection(entry.date)]);
  assert.equal(posts,1);assert.equal(a.id,b.id);
});
test("concurrent remote creation recovers only an existing409; other errors propagate",async t=>{
  let gets=0;t.mock.method(apiClient,"get",async()=>{if(!gets++)throw new ApiError(404,"missing");return entry;});
  t.mock.method(apiClient,"post",async()=>{throw new ApiError(409,"exists");});
  assert.equal((await openReflection(entry.date)).id,entry.id);
  t.mock.method(apiClient,"get",async()=>{throw new ApiError(500,"server failure");});
  await assert.rejects(openReflection(entry.date),/server failure/);
});
