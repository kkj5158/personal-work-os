import {test} from "node:test";
import assert from "node:assert/strict";
import {archiveFolder} from "./archiveFolder";

function file(path:string,body="synthetic"){const f=new File([body],path.split("/").at(-1)!);Object.defineProperty(f,"webkitRelativePath",{value:path});return f;}
test("bounded selected folder produces UTF-8 stored ZIP with original bytes",async()=>{const result=await archiveFolder([file("backup/글.html","한글"),file("backup/images/a.png")]);const bytes=new Uint8Array(await result.arrayBuffer()),view=new DataView(bytes.buffer);assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint16(6,true),0x800);assert.ok(new TextDecoder().decode(bytes).includes("글.html"));assert.ok(new TextDecoder().decode(bytes).includes("한글"));assert.ok(result.size<8_000_000);});
test("folder rejects unsafe, duplicate, nested archives, oversized and excessive files before reading",async()=>{for(const files of [[file("root/../escape")],[file("root/a"),file("root/a")],[file("root/archive.zip")],[file("root/C:/secret")],Array.from({length:1001},()=>file("root/a"))])await assert.rejects(archiveFolder(files));const large=file("root/large");Object.defineProperty(large,"size",{value:2_000_001});await assert.rejects(archiveFolder([large]));});
