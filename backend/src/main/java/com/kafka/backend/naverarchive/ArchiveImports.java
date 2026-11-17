package com.kafka.backend.naverarchive;

import java.util.*;
import java.io.*;
import javax.imageio.ImageIO;
import org.springframework.stereotype.Service;

@Service
public class ArchiveImports {
 final ArchiveService s;
 public ArchiveImports(ArchiveService service){s=service;}
 @SuppressWarnings("unchecked")
 public Map<String,Object> preview(Map<String,Object>b){
  ArchiveService.keys(b,Set.of("archiveBase64"));String base64=ArchiveService.str(b,"archiveBase64",11_000_000,true);byte[] bytes;
  try{bytes=Base64.getDecoder().decode(base64);}catch(RuntimeException e){throw ArchiveService.error(400,"ZIP base64를 확인해주세요.");}
  var files=ArchiveContent.unzip(bytes);String hash=ArchiveContent.hash(bytes);UUID owner=s.owner();
  if(!files.containsKey("manifest.json"))return Map.of("supported",false,"officialExportCompatibility","UNTESTED_PENDING_USER_ARCHIVE","warnings",List.of("알 수 없는 백업 구조입니다. 원본 형식 검토가 필요하며 가져온 글은 없습니다."),"files",files.size(),"manifestSha256",hash);
  var manifest=s.decode(ArchiveContent.utf8(files.get("manifest.json")));
  if(!"orbit-naver-archive/v1".equals(manifest.get("format"))||!(manifest.get("posts") instanceof List<?> posts)||posts.isEmpty()||posts.size()>500)throw ArchiveService.error(400,"지원하는 ORBIT 준비 형식과 1–500개 글 목록이 필요합니다.");
  List<Map<String,Object>> candidates=new ArrayList<>();List<Map<String,Object>> rows=new ArrayList<>();Set<String> seen=new HashSet<>(),identities=new HashSet<>();int index=0;
  for(Object entry:posts){
   if(!(entry instanceof String path)||!path.endsWith(".json")||path.equals("manifest.json")||!files.containsKey(path)||!seen.add(path))throw ArchiveService.error(400,"중복 또는 누락된 글 파일입니다.");
   var raw=s.decode(ArchiveContent.utf8(files.get(path)));var allowed=new HashSet<>(ArchiveService.FIELDS);allowed.add("assets");ArchiveService.keys(raw,allowed);raw.put("provenance","OWNER_EXPORT");var n=s.normalize(raw,true);
   List<Map<String,Object>> assets=new ArrayList<>();
   if(raw.containsKey("assets")){
    if(!(raw.get("assets") instanceof List<?> sourceAssets)||sourceAssets.size()>20)throw ArchiveService.error(400,"글당 이미지는 최대 20개입니다.");
    for(Object v:sourceAssets){if(!(v instanceof Map<?,?>))throw ArchiveService.error(400,"이미지 정보를 확인해주세요.");var asset=(Map<String,Object>)v;ArchiveService.keys(asset,Set.of("id","path"));UUID id=ArchiveService.uuid(asset.get("id"));String image=ArchiveService.str(asset,"path",240,true);byte[] imageBytes=files.get(image);if(imageBytes==null)throw ArchiveService.error(400,"이미지 파일이 없습니다.");String mime=imageMime(imageBytes);UUID stored=UUID.randomUUID();
     n.put("safeHtml",((String)n.get("safeHtml")).replace("data-asset=\""+id+"\"","data-asset=\""+stored+"\""));
     assets.add(Map.of("id",stored.toString(),"mime",mime,"bytes",Base64.getEncoder().encodeToString(imageBytes),"sha256",ArchiveContent.hash(imageBytes)));
    }
   }
   n.put("assets",assets);List<String>warnings=new ArrayList<>();if(n.get("originalPublishedAt")==null)warnings.add("날짜 확인 필요");if(!"COMPLETE_OWNER_SUPPLIED".equals(n.get("fidelityStatus")))warnings.add("본문 완전성 확인 필요");
   String identity=n.get("externalPostId")!=null?"ID:"+n.get("externalPostId"):n.get("originalUrl")!=null?"URL:"+n.get("originalUrl"):null;
   if(identity!=null&&!identities.add(identity))warnings.add("같은 미리보기 안에 원본 ID/URL 중복이 있습니다. 기존 글을 덮어쓰지 않습니다.");
   var safe=org.jsoup.Jsoup.parseBodyFragment((String)n.get("safeHtml"));Set<String> bound=new HashSet<>();assets.forEach(a->bound.add((String)a.get("id")));
   if(safe.select("img[data-asset]").stream().anyMatch(img->!bound.contains(img.attr("data-asset")))){n.put("fidelityStatus","NEEDS_REVIEW");warnings.add("일부 이미지가 누락되어 검토가 필요합니다.");}
   var d=s.duplicates(owner,n);rows.add(Map.of("index",index++,"title",n.get("title"),"warnings",warnings,"duplicates",d,"images",assets.size(),"fidelityStatus",n.get("fidelityStatus")));candidates.add(n);
  }
  var preview=Map.<String,Object>of("supported",true,"manifestSha256",hash,"count",candidates.size(),"items",rows,"officialExportCompatibility","UNTESTED_PENDING_USER_ARCHIVE","format","orbit-naver-archive/v1");
  return s.lock(owner,()->{
   var old=s.db.queryForList("select id,manifest from naver_archive_import_batches where owner_id=? and manifest_sha256=?",owner,hash);if(!old.isEmpty()){var result=s.decode((String)old.getFirst().get("manifest"));result.put("id",old.getFirst().get("id"));return result;}
   UUID id=UUID.randomUUID();s.db.update("insert into naver_archive_import_batches(id,owner_id,manifest_sha256,manifest) values(?,?,?,?)",id,owner,hash,s.encode(preview));int i=0;
   for(var n:candidates)s.db.update("insert into naver_archive_import_items(batch_id,owner_id,item_index,candidate) values(?,?,?,?)",id,owner,i++,s.encode(n));var result=new LinkedHashMap<String,Object>(preview);result.put("id",id);return result;
  });
 }
 static String imageMime(byte[] bytes){
  if(bytes.length==0||bytes.length>2_000_000)throw ArchiveService.error(400,"이미지 크기를 확인해주세요.");
  try(var in=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))){var readers=ImageIO.getImageReaders(in);if(!readers.hasNext())throw new IOException();var reader=readers.next();try{reader.setInput(in);String f=reader.getFormatName().toLowerCase(Locale.ROOT);if(!Set.of("png","jpeg","jpg").contains(f)||(long)reader.getWidth(0)*reader.getHeight(0)>24_000_000)throw new IOException();reader.read(0);return f.equals("png")?"image/png":"image/jpeg";}finally{reader.dispose();}}
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
