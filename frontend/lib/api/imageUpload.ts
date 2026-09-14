/** Shared NOTE SYS / WORK FLOW upload policy; private storage owns the resulting image. */
export async function encodeImage(file:File):Promise<{data:string;mimeType:string}>{
 if(file.size>10485760)throw new Error('이미지는 최대 10MB입니다.');
 if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('PNG, JPEG, WebP, GIF 이미지를 사용하세요.');
 let blob:Blob=file;
 if(file.type==='image/webp'){
  const bitmap=await createImageBitmap(file);
  if(bitmap.width*bitmap.height>40000000){bitmap.close();throw new Error('이미지는 최대 40MP입니다.');}
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap,0,0);bitmap.close();
  blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('이미지 변환 실패')),'image/png'));
 }
 const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
 return {data,mimeType:blob.type};
}
