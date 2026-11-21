package com.kafka.backend.naverarchive;

import java.util.*;
import java.io.*;
import javax.imageio.ImageIO;
import org.springframework.stereotype.Service;

@Service
public class ArchiveImports {
 static final String NATIVE_FORMAT="orbit-naver-archive/native-v2";
 final ArchiveService s;
 public ArchiveImports(ArchiveService service){s=service;}
 @SuppressWarnings("unchecked")
 public Map<String,Object> preview(Map<String,Object>b){
  ArchiveService.keys(b,Set.of("archiveBase64"));String base64=ArchiveService.str(b,"archiveBase64",11_000_000,true);byte[] bytes;
  try{bytes=Base64.getDecoder().decode(base64);}catch(RuntimeException e){throw ArchiveService.error(400,"ZIP base64를 확인해주세요.");}
  return previewArchive(bytes,false);
 }
 @SuppressWarnings("unchecked")
 Map<String,Object> previewArchive(byte[] bytes,boolean nativeZip){
  var files=nativeZip?ArchiveContent.unzipNative(bytes):ArchiveContent.unzip(bytes);
  String hash=ArchiveContent.hash(bytes);UUID owner=s.owner();
  if(!nativeZip&&!files.containsKey("manifest.json"))return nativeReport(files,hash);
  if(!files.containsKey("manifest.json")||files.get("manifest.json").length>2_000_000)throw ArchiveService.error(400,"ZIP 목록 파일을 확인해주세요.");
  var manifest=s.decode(ArchiveContent.utf8(files.get("manifest.json")));
  String format=nativeZip?NATIVE_FORMAT:"orbit-naver-archive/v1";
  if(!format.equals(manifest.get("format"))||!(manifest.get("posts") instanceof List<?> posts)||posts.isEmpty()||posts.size()>(nativeZip?50:500))throw ArchiveService.error(400,"ZIP 형식과 글 목록을 확인해주세요.");
  List<Map<String,Object>> candidates=new ArrayList<>();List<Map<String,Object>> rows=new ArrayList<>();Set<String> seen=new HashSet<>(),identities=new HashSet<>();int index=0;
  for(Object entry:posts){
   if(!(entry instanceof String path)||!path.endsWith(".json")||path.equals("manifest.json")||!files.containsKey(path)||files.get(path).length>2_000_000||!seen.add(path))throw ArchiveService.error(400,"중복, 누락 또는 크기 제한을 넘은 글 파일입니다.");
   var raw=s.decode(ArchiveContent.utf8(files.get(path)));var allowed=new HashSet<>(ArchiveService.FIELDS);allowed.addAll(Set.of("assets","sourceArtifact"));ArchiveService.keys(raw,allowed);raw.put("provenance","OWNER_EXPORT");var n=s.normalize(raw,true);
   var original=readOriginal(raw,files);
   if(nativeZip&&(original==null||n.get("sourceHtml")!=null||n.get("externalPostId")==null))throw ArchiveService.error(400,"원본 HTML 파일과 글 ID가 필요합니다.");
   var display=nativeZip?org.jsoup.Jsoup.parse(original.html()):org.jsoup.Jsoup.parseBodyFragment((String)n.get("sourceHtml")==null?"":(String)n.get("sourceHtml"));
   display.outputSettings().prettyPrint(false);
   if(nativeZip&&display.selectFirst(".se-viewer .se-main-container")==null)throw ArchiveService.error(400,"네이버 내보내기 HTML 구조를 확인해주세요.");
   Set<String> assetIds=new HashSet<>(),sourceRefs=new HashSet<>();
   List<Map<String,Object>> assets=new ArrayList<>();
   if(raw.containsKey("assets")){
    if(!(raw.get("assets") instanceof List<?> sourceAssets)||sourceAssets.size()>20)throw ArchiveService.error(400,"글당 이미지는 최대 20개입니다.");
    for(Object v:sourceAssets){if(!(v instanceof Map<?,?>))throw ArchiveService.error(400,"이미지 정보를 확인해주세요.");var asset=(Map<String,Object>)v;ArchiveService.keys(asset,nativeZip?Set.of("id","path","sourceRef","sha256"):Set.of("id","path","sourceRef"));UUID id=ArchiveService.uuid(asset.get("id"));if(!assetIds.add(id.toString()))throw ArchiveService.error(400,"중복 이미지 ID입니다.");String image=ArchiveService.str(asset,"path",240,true);byte[] imageBytes=files.get(image);if(imageBytes==null)throw ArchiveService.error(400,"이미지 파일이 없습니다.");
     String imageHash=ArchiveContent.hash(imageBytes);
     if(nativeZip&&!imageHash.equals(ArchiveService.str(asset,"sha256",64,true)))throw ArchiveService.error(400,"이미지 SHA-256이 일치하지 않습니다.");
     String mime=imageMime(imageBytes,nativeZip);UUID stored=UUID.randomUUID();
     String ref=ArchiveService.str(asset,"sourceRef",1000,false);if(ref!=null){if(ref.isBlank()||ref.contains("\\")||ref.startsWith("/")||ref.contains(":")||!sourceRefs.add(ref))throw ArchiveService.error(400,"로컬 이미지 참조를 확인해주세요.");}
     boolean bound=false;
     for(var img:display.select("img"))if(img.attr("src").equals(ref==null?"asset:"+id:ref)){bound=true;if(!"application/octet-stream".equals(mime))img.attr("src","asset:"+stored);}
     if(nativeZip&&!bound)throw ArchiveService.error(400,"원본 HTML의 이미지 참조와 일치하지 않습니다.");
     assets.add(Map.of("id",stored.toString(),"mime",mime,"bytes",Base64.getEncoder().encodeToString(imageBytes),"sha256",imageHash));
    }
   }
   n.put("safeHtml",ArchiveContent.safeHtml(display.body().html()));
   List<String>warnings=new ArrayList<>();
   long downloadOnly=assets.stream().filter(a->a.get("mime").equals("application/octet-stream")).count();
   int imageCount=assets.size();
   if(downloadOnly>0)warnings.add("고해상도 이미지 "+downloadOnly+"개는 원본 다운로드로 제공됩니다.");
   if(nativeZip&&!display.select(".se-oembed,.se-placesMap,iframe,video,audio").isEmpty())warnings.add("지도와 외부 임베드는 원본 파일에 보존되며 화면에서 실행하지 않습니다.");
   if(display.select("img").stream().anyMatch(img->!img.attr("src").matches("asset:[a-fA-F0-9-]{36}")))warnings.add("누락되었거나 원격·지원하지 않는 이미지는 표시하지 않습니다.");
   if(original!=null){
    if(!nativeZip&&!Objects.equals(original.html(),n.get("sourceHtml")))throw ArchiveService.error(400,"원본 HTML과 디코딩한 본문이 다릅니다.");
    assets.add(Map.of("id",UUID.randomUUID().toString(),"mime","application/octet-stream","bytes",Base64.getEncoder().encodeToString(original.bytes()),"sha256",original.sha()));n.put("fidelityStatus","NEEDS_REVIEW");warnings.add("추출 본문과 이미지를 원본 파일에 대조해주세요.");
   }
   n.put("assets",assets);if(n.get("originalPublishedAt")==null)warnings.add("날짜 확인 필요");if(!"COMPLETE_OWNER_SUPPLIED".equals(n.get("fidelityStatus")))warnings.add("본문 완전성 확인 필요");
   String identity=n.get("externalPostId")!=null?"ID:"+n.get("externalPostId"):n.get("originalUrl")!=null?"URL:"+n.get("originalUrl"):null;
   if(identity!=null&&!identities.add(identity))warnings.add("같은 미리보기 안에 원본 ID/URL 중복이 있습니다. 기존 글을 덮어쓰지 않습니다.");
   var safe=org.jsoup.Jsoup.parseBodyFragment((String)n.get("safeHtml"));Set<String> bound=new HashSet<>();assets.forEach(a->bound.add((String)a.get("id")));
   if(safe.select("img[data-asset]").stream().anyMatch(img->!bound.contains(img.attr("data-asset")))){n.put("fidelityStatus","NEEDS_REVIEW");warnings.add("일부 이미지가 누락되어 검토가 필요합니다.");}
   var d=s.duplicates(owner,n);var row=new LinkedHashMap<String,Object>();row.putAll(Map.of("index",index++,"title",n.get("title"),"warnings",warnings,"duplicates",d,"images",imageCount,"fidelityStatus",n.get("fidelityStatus")));row.put("originalPublishedAt",n.get("originalPublishedAt"));row.put("sourceCategory",n.get("sourceCategory"));row.put("bodyText",n.get("bodyText"));row.put("sourceHtmlSha256",ArchiveContent.hash(nativeZip?original.html():(String)n.get("sourceHtml")==null?"":(String)n.get("sourceHtml")));if(nativeZip){row.put("externalPostId",n.get("externalPostId"));row.put("originalSourceSha256",original.sha());}
   row.put("privateAssets",assets.stream().map(a->Map.of("id",a.get("id"),"mime",a.get("mime"),"sha256",a.get("sha256"))).toList());rows.add(row);candidates.add(n);
  }
  // Keep catalog responses bounded; full text is loaded one candidate at a time.
  for(var row:rows){String text=(String)row.remove("bodyText");row.put("excerpt",text.substring(0,Math.min(text.length(),500)));}
  var preview=Map.<String,Object>of("supported",true,"manifestSha256",hash,"count",candidates.size(),"items",rows,"officialExportCompatibility","UNTESTED_PENDING_USER_ARCHIVE","format",format,"bytes",bytes.length);
  return s.lock(owner,()->{
   var old=priorPreview(owner,hash);if(old!=null)return old;
   UUID id=UUID.randomUUID();s.db.update("insert into naver_archive_import_batches(id,owner_id,manifest_sha256,manifest) values(?,?,?,?)",id,owner,hash,s.encode(preview));int i=0;
   for(var n:candidates)s.db.update("insert into naver_archive_import_items(batch_id,owner_id,item_index,candidate) values(?,?,?,?)",id,owner,i++,s.encode(n));var result=new LinkedHashMap<String,Object>(preview);result.put("id",id);return result;
  });
 }
 Map<String,Object> priorPreview(UUID owner,String hash){
  var previous=s.db.queryForList("select id,manifest from naver_archive_import_batches where owner_id=? and manifest_sha256=?",owner,hash);
  if(previous.isEmpty())return null;
  var row=previous.getFirst();
  var result=s.decode((String)row.get("manifest"));result.put("id",row.get("id"));return result;
 }
 private record Original(byte[] bytes,String sha,String html){}
 @SuppressWarnings("unchecked")
 private Original readOriginal(Map<String,Object> raw,Map<String,byte[]> files){
  if(!raw.containsKey("sourceArtifact"))return null;
  if(!(raw.get("sourceArtifact") instanceof Map<?,?>))throw ArchiveService.error(400,"원본 파일 정보를 확인해주세요.");
  var source=(Map<String,Object>)raw.get("sourceArtifact");ArchiveService.keys(source,Set.of("path","sha256","encoding"));
  var bytes=files.get(ArchiveService.str(source,"path",240,true));String expected=ArchiveService.str(source,"sha256",64,true),encoding=ArchiveService.str(source,"encoding",40,true);
  if(bytes==null||bytes.length>2_000_000||!ArchiveContent.hash(bytes).equals(expected)||!Set.of("utf-8","utf-8-sig","cp949").contains(encoding))throw ArchiveService.error(400,"원본 파일 크기, 해시 또는 인코딩을 확인해주세요.");
  try{
   var charset=java.nio.charset.Charset.forName(encoding.equals("cp949")?"MS949":"UTF-8");
   var decoded=charset.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes)).toString();
   if(encoding.equals("utf-8-sig")&&decoded.startsWith("\ufeff"))decoded=decoded.substring(1);
   return new Original(bytes,expected,decoded);
  }catch(java.nio.charset.CharacterCodingException e){throw ArchiveService.error(400,"원본 HTML 인코딩이 올바르지 않습니다.");}
 }
 public Map<String,Object> item(UUID batch,int index){if(index<0||index>=500)throw ArchiveService.error(400,"항목 번호를 확인해주세요.");var n=s.decode((String)s.one("select candidate from naver_archive_import_items where owner_id=? and batch_id=? and item_index=?",s.owner(),batch,index).get("candidate"));var result=new LinkedHashMap<String,Object>();for(String key:List.of("title","bodyText","originalPublishedAt","sourceCategory","fidelityStatus"))result.put(key,n.get(key));return result;}
 static Map<String,Object> nativeReport(Map<String,byte[]> files,String hash){
  var html=files.entrySet().stream().filter(e->e.getKey().toLowerCase(Locale.ROOT).matches(".*\\.html?")).map(e->Map.of("path",e.getKey(),"bytes",e.getValue().length,"sha256",ArchiveContent.hash(e.getValue()))).toList();
  return Map.of("supported",false,"officialExportCompatibility","UNTESTED_PENDING_USER_ARCHIVE","warnings",List.of("원본 형식은 미검증입니다. 가져온 글은 0개입니다.","암호는 로컬에서만 해제하세요. 로컬 준비 도구로 형식을 검토하고 나눈 ORBIT ZIP을 다시 선택해주세요."),"files",files.size(),"htmlFiles",html,"count",0,"manifestSha256",hash,"bytes",files.values().stream().mapToLong(a->a.length).sum());
 }
 static String imageMime(byte[] bytes,boolean nativeZip){
  if(bytes.length==0||bytes.length>(nativeZip?ArchiveContent.NATIVE_IMAGE_LIMIT:2_000_000))throw ArchiveService.error(400,"이미지 크기를 확인해주세요.");
  try(var in=new javax.imageio.stream.MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))){
   var readers=ImageIO.getImageReaders(in);if(!readers.hasNext())throw new IOException();var reader=readers.next();
   try{
    reader.setInput(in);String f=reader.getFormatName().toLowerCase(Locale.ROOT);
    long pixels=(long)reader.getWidth(0)*reader.getHeight(0);
    if(!Set.of("png","jpeg","jpg").contains(f)||pixels>(nativeZip?120_000_000:24_000_000))throw new IOException();
    if(pixels>24_000_000){
     // Validate a bounded decode while preserving the exact original as a download.
     var sampling=reader.getDefaultReadParam();sampling.setSourceSubsampling(8,8,0,0);reader.read(0,sampling);
     return "application/octet-stream";
    }
    reader.read(0);return f.equals("png")?"image/png":"image/jpeg";
   }finally{reader.dispose();}
  }
  catch(IOException|RuntimeException e){throw ArchiveService.error(400,"안전한 PNG/JPEG 이미지만 지원합니다.");}
 }
 public Map<String,Object> status(UUID id){UUID owner=s.owner();var batch=s.one("select id,manifest_sha256 as \"manifestSha256\",state,created_at as \"createdAt\",approved_at as \"approvedAt\" from naver_archive_import_batches where owner_id=? and id=?",owner,id);batch.put("items",s.db.queryForList("select item_index as index,status,post_id as \"postId\",receipt,error_code as \"errorCode\" from naver_archive_import_items where owner_id=? and batch_id=? order by item_index",owner,id));return batch;}
 @SuppressWarnings("unchecked")
 public Map<String,Object> execute(UUID id,Map<String,Object>b){
  ArchiveService.keys(b,Set.of("manifestSha256","confirmed","requestId"));ArchiveService.uuid(b.get("requestId"));if(!Boolean.TRUE.equals(b.get("confirmed")))throw ArchiveService.error(400,"정확한 미리보기 승인이 필요합니다.");String hash=ArchiveService.str(b,"manifestSha256",64,true);UUID owner=s.owner();
  s.lock(owner,()->{var batch=s.one("select manifest_sha256,state from naver_archive_import_batches where owner_id=? and id=?",owner,id);if(!hash.equals(batch.get("manifest_sha256")))throw ArchiveService.error(409,"승인한 미리보기 해시와 다릅니다.");s.db.update("update naver_archive_import_batches set state=case when state='COMPLETE' then state else 'RUNNING' end,approved_at=coalesce(approved_at,now()) where owner_id=? and id=?",owner,id);return true;});
  var pending=s.db.queryForList("select item_index from naver_archive_import_items where owner_id=? and batch_id=? and status in ('PENDING','FAILED') order by item_index limit 50",owner,id);
  for(var item:pending){int index=((Number)item.get("item_index")).intValue();try{
   s.lock(owner,()->{
    var row=s.one("select candidate,status from naver_archive_import_items where owner_id=? and batch_id=? and item_index=?",owner,id,index);if(!Set.of("PENDING","FAILED").contains(row.get("status")))return true;
    var n=s.decode((String)row.get("candidate"));var duplicates=s.duplicates(owner,n);Map<String,Object> exact=duplicates.stream().filter(d->n.get("externalPostId")!=null&&Objects.equals(n.get("externalPostId"),d.get("externalPostId"))||n.get("originalUrl")!=null&&Objects.equals(n.get("originalUrl"),d.get("originalUrl"))).findFirst().orElse(null);
    if(exact!=null){s.db.update("update naver_archive_import_items set status='DUPLICATE',post_id=?,error_code=null where owner_id=? and batch_id=? and item_index=?",exact.get("id"),owner,id,index);return true;}
    var result=s.insert(owner,n,"IMPORT");UUID post=ArchiveService.uuid(result.get("id"));
    for(var a:(List<Map<String,Object>>)n.get("assets"))s.db.update("insert into naver_archive_assets(id,owner_id,post_id,mime_type,bytes,sha256) values(?,?,?,?,?,?)",ArchiveService.uuid(a.get("id")),owner,post,a.get("mime"),Base64.getDecoder().decode((String)a.get("bytes")),a.get("sha256"));
    s.db.update("update naver_archive_import_items set status='IMPORTED',post_id=?,receipt=?,error_code=null where owner_id=? and batch_id=? and item_index=?",post,result.get("auditReceipt"),owner,id,index);return true;
   });
  }catch(RuntimeException e){s.lock(owner,()->{s.db.update("update naver_archive_import_items set status='FAILED',error_code='ITEM_FAILED' where owner_id=? and batch_id=? and item_index=? and status in ('PENDING','FAILED')",owner,id,index);return true;});}}
  s.lock(owner,()->{Long remaining=s.db.queryForObject("select count(*) from naver_archive_import_items where owner_id=? and batch_id=? and status in ('PENDING','FAILED')",Long.class,owner,id);s.db.update("update naver_archive_import_batches set state=? where owner_id=? and id=?",remaining==0?"COMPLETE":"PARTIAL",owner,id);return true;});return status(id);
 }
 public Map<String,Object> asset(UUID id){return s.one("select mime_type,bytes,sha256 from naver_archive_assets where owner_id=? and id=?",s.owner(),id);}
}
