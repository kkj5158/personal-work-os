import test from "node:test";
import assert from "node:assert/strict";
import {removeSyntheticAuthUser} from "../log-synthetic-auth-cleanup.mjs";
const actor={id:"test-actor",label:"a",email:"synthetic@example.invalid"},runId="test-run";
const response=(status,body)=>new Response(body?JSON.stringify(body):null,{status});
const user={id:actor.id,email:actor.email,user_metadata:{qaRunId:runId}};
test("already absent requires GET404 and performs no DELETE",async()=>{
  const calls=[];const result=await removeSyntheticAuthUser(async(route,method)=>{calls.push(method);return response(404);},actor,runId);
  assert.equal(result.status,"PASS_ALREADY_ABSENT");assert.deepEqual(calls,["GET"]);
});
test("unauthorized or mismatched identity never authorizes DELETE",async()=>{
  for(const [status,body] of [[401,null],[500,null],[200,{...user,email:"owner@example.com"}],[200,{...user,user_metadata:{qaRunId:"another"}}]]){
    const calls=[];await assert.rejects(removeSyntheticAuthUser(async(route,method)=>{calls.push(method);return response(status,body);},actor,runId),/IDENTITY_FENCE/);
    assert.deepEqual(calls,["GET"]);
  }
});
test("DELETE success is verified by GET absence",async()=>{
  const statuses=[response(200,user),response(200),response(404)],calls=[];
  const result=await removeSyntheticAuthUser(async(route,method)=>{calls.push(method);return statuses.shift();},actor,runId);
  assert.equal(result.status,"PASS_REMOVED");assert.deepEqual(calls,["GET","DELETE","GET"]);
});
test("failed DELETE can reconcile only with explicit absence",async()=>{
  const statuses=[response(200,user),response(500),response(404)];
  const result=await removeSyntheticAuthUser(async()=>statuses.shift(),actor,runId);
  assert.equal(result.status,"PASS_REMOVED");assert.equal(result.deleteStatus,500);
});
test("unavailable or still present readback remains failure",async()=>{
  for(const last of [response(200,user),response(401),response(500)]){
    const statuses=[response(200,user),response(200),last];
    await assert.rejects(removeSyntheticAuthUser(async()=>statuses.shift(),actor,runId),/ABSENCE_NOT_VERIFIED/);
  }
});
