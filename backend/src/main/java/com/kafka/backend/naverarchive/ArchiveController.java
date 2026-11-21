package com.kafka.backend.naverarchive;

import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

@RestController
@RequestMapping("/api/naver-archive")
public class ArchiveController {
 final ArchiveService s;final ArchiveImports imports;final ArchiveNativeUploads nativeUploads;final NaverRssSyncService rss;
 public ArchiveController(ArchiveService service,ArchiveImports imports,ArchiveNativeUploads nativeUploads,NaverRssSyncService rss){s=service;this.imports=imports;this.nativeUploads=nativeUploads;this.rss=rss;}
 String actor(){var a=SecurityContextHolder.getContext().getAuthentication();return a instanceof JwtAuthenticationToken j&&j.getTokenAttributes().containsKey("client_id")?"MCP":"WEB";}
 @GetMapping("/posts") public Map<String,Object> list(@RequestParam Map<String,String>q){return s.list(q);}
 @GetMapping("/summary") public Map<String,Object> summary(){var summary=new LinkedHashMap<>(s.summary());summary.put("rssSync",rss.status());return summary;}
 @GetMapping("/posts/{id}") public Map<String,Object> get(@PathVariable UUID id){return s.get(id);}
 @GetMapping("/posts/{id}/revisions") public Map<String,Object> revisions(@PathVariable UUID id){return s.revisions(id);}
 @GetMapping("/posts/{id}/revisions/{version}") public Map<String,Object> revision(@PathVariable UUID id,@PathVariable long version){return s.revision(id,version);}
 @GetMapping("/operations/{id}") public Map<String,Object> operation(@PathVariable UUID id){return s.outcome(id);}
 @PostMapping("/posts/duplicate-check") public Map<String,Object> duplicates(@RequestBody Map<String,Object>b){return s.duplicateCheck(b);}
 @PostMapping("/posts") public Map<String,Object> create(@RequestBody Map<String,Object>b){return s.create(b,actor());}
 @PatchMapping("/posts/{id}") public Map<String,Object> update(@PathVariable UUID id,@RequestBody Map<String,Object>b){return s.update(id,b,actor());}
 @PostMapping("/posts/{id}/archive") public Map<String,Object> archive(@PathVariable UUID id,@RequestBody Map<String,Object>b){return s.archive(id,true,b,actor());}
 @PostMapping("/posts/{id}/restore") public Map<String,Object> restore(@PathVariable UUID id,@RequestBody Map<String,Object>b){return s.archive(id,false,b,actor());}
 @PutMapping("/posts/{id}/read-progress") public Map<String,Object> progress(@PathVariable UUID id,@RequestBody Map<String,Object>b){return s.progress(id,b);}
 @PostMapping("/imports/preview") public Map<String,Object> preview(@RequestBody Map<String,Object>b){return imports.preview(b);}
 @GetMapping("/imports/native-upload") public Map<String,Object> nativeUpload(){return nativeUploads.active();}
 @PutMapping("/imports/native-upload/{sha}/{part}") public Map<String,Object> uploadNativePart(@PathVariable String sha,@PathVariable int part,@RequestBody Map<String,Object> body){return nativeUploads.upload(sha,part,body);}
 @PostMapping("/imports/native-upload/{sha}/preview") public Map<String,Object> previewNativeUpload(@PathVariable String sha){return nativeUploads.preview(sha);}
 @DeleteMapping("/imports/native-upload/{sha}") public Map<String,Object> cancelNativeUpload(@PathVariable String sha){return nativeUploads.cancel(sha);}
 @GetMapping("/imports/{id}") public Map<String,Object> status(@PathVariable UUID id){return imports.status(id);}
 @GetMapping("/imports/{id}/items/{index}") public Map<String,Object> item(@PathVariable UUID id,@PathVariable int index){return imports.item(id,index);}
 @PostMapping("/imports/{id}/execute") public Map<String,Object> execute(@PathVariable UUID id,@RequestBody Map<String,Object>b){return imports.execute(id,b);}
 @GetMapping("/assets/{id}") public ResponseEntity<byte[]> asset(@PathVariable UUID id){var a=imports.asset(id);var response=ResponseEntity.ok().contentType(MediaType.parseMediaType((String)a.get("mime_type"))).header("Cache-Control","private, no-store").header("X-Content-Type-Options","nosniff").header("Content-Security-Policy","default-src 'none'; sandbox");if("application/octet-stream".equals(a.get("mime_type")))response.header("Content-Disposition","attachment; filename=original-source.bin");return response.body((byte[])a.get("bytes"));}
 @ExceptionHandler(ArchiveException.class) public ResponseEntity<Map<String,String>> error(ArchiveException e){return ResponseEntity.status(e.status).cacheControl(CacheControl.noStore()).body(Map.of("message",e.getMessage()));}
}
