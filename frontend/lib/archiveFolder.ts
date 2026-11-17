// Browser-selected local files only. Stored ZIP: no global decompression limit changes.
export async function archiveFolder(files:File[]):Promise<File>{
 if(!files.length||files.length>1000)throw Error("폴더 파일 수는 1–1000개여야 합니다. 큰 백업은 로컬 준비 도구로 나눠주세요.");
 const names=new Set<string>();let size=22;
 const entries=files.map(file=>{const full=file.webkitRelativePath||file.name;const name=full.includes("/")?full.slice(full.indexOf("/")+1):full;
  if(!name||name.length>240||name.startsWith("/")||name.includes("\\")||name.includes(":")||name.split("/").some(p=>!p||p===".."||p===".")||/\.(zip|rar|7z|gz|tar)$/i.test(name)||names.has(name))throw Error("안전하지 않거나 중복된 폴더 경로입니다.");
  names.add(name);const path=new TextEncoder().encode(name);size+=file.size+76+path.length*2;if(file.size>2_000_000||size>8_000_000)throw Error("폴더는 파일당 2 MB, 전체 8 MB 이하여야 합니다. 큰 백업은 로컬 준비 도구로 나눠주세요.");return{file,path};});
 const blocks:Uint8Array<ArrayBuffer>[]=[],central:Uint8Array<ArrayBuffer>[]=[];let offset=0;
 for(const{file,path}of entries){const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length!==file.size)throw Error("파일이 변경되었습니다. 폴더를 다시 선택해주세요.");let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
  const header=new Uint8Array(30),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint32(14,crc,true);h.setUint32(18,bytes.length,true);h.setUint32(22,bytes.length,true);h.setUint16(26,path.length,true);blocks.push(header,path,bytes);
  const entry=new Uint8Array(46),c=new DataView(entry.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint32(16,crc,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);c.setUint16(28,path.length,true);c.setUint32(42,offset,true);central.push(entry,path);offset+=30+path.length+bytes.length;
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer),length=central.reduce((n,b)=>n+b.length,0);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,length,true);e.setUint32(16,offset,true);
 return new File([...blocks,...central,end],"local-folder-review.zip",{type:"application/zip"});
}
