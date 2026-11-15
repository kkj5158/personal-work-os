import test from "node:test";
import assert from "node:assert/strict";
import {acquireImage} from "./media-cache";
import {uploadImage} from "./api";

test("authenticated image memory is shared only within an owner/profile and revoked after the last consumer",async()=>{
 const previousFetch=globalThis.fetch,previousRevoke=URL.revokeObjectURL;let calls=0;const revoked:string[]=[];
 globalThis.fetch=async()=>{calls++;return new Response(new Uint8Array([1,2,3]),{headers:{"Content-Type":"image/png"}});};URL.revokeObjectURL=url=>{revoked.push(url);previousRevoke(url);};
 try{const a=acquireImage("owner-a","profile-a","image"),b=acquireImage("owner-a","profile-a","image");assert.equal(await a.url,await b.url);assert.equal(calls,1);a.release();assert.equal(revoked.length,0);b.release();assert.equal(revoked.length,1);const other=acquireImage("owner-b","profile-a","image");assert.notEqual(await other.url,await a.url);assert.equal(calls,2);other.release();assert.equal(revoked.length,2);}finally{globalThis.fetch=previousFetch;URL.revokeObjectURL=previousRevoke;}
});
test("photo upload sends metadata and authenticated bytes, then completes before returning an attachment ID",async()=>{
 const previous=globalThis.fetch;const requests:{path:string;method:string;body:unknown}[]=[];
 globalThis.fetch=async(input,init)=>{const path=String(input);requests.push({path,method:init?.method??"GET",body:init?.body});if(path.endsWith("/images"))return Response.json({id:"image",url:"https://provider.invalid/unused",headers:{}});if(path.endsWith("/bytes"))return new Response(null,{status:204});if(path.endsWith("/complete"))return Response.json({ready:true});throw Error("Unexpected request");};
 try{const id=await uploadImage("owner","profile",new File([new Uint8Array([1,2,3])],"image.png",{type:"image/png"}));assert.equal(id,"image");assert.equal(requests.length,3);assert.equal(requests[1].method,"PUT");assert.match(requests[1].path,/\/profiles\/profile\/images\/image\/bytes$/);assert.equal((JSON.parse(String(requests[0].body))).sha256.length,64);assert.match(requests[2].path,/\/complete$/);}finally{globalThis.fetch=previous;}
});
test("a failed byte transfer cannot become a published attachment",async()=>{
 const previous=globalThis.fetch;let completes=0;globalThis.fetch=async(input)=>{const path=String(input);if(path.endsWith("/images"))return Response.json({id:"image",url:"https://provider.invalid/unused",headers:{}});if(path.endsWith("/bytes"))return new Response(null,{status:503});completes++;return Response.json({});};try{await assert.rejects(()=>uploadImage("owner","profile",new File(["bytes"],"photo.png",{type:"image/png"})));assert.equal(completes,0);}finally{globalThis.fetch=previous;}
});
