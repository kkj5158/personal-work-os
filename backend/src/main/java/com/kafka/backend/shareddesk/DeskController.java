package com.kafka.backend.shareddesk;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/shared-desk")
public class DeskController {
 final DeskService service; final DeskFiles files;
 public DeskController(DeskService service,DeskFiles files){this.service=service;this.files=files;}
 static String kind(String resource){return switch(resource){case "clips"->"CLIP";case "memos"->"MEMO";case "files"->"FILE";default->throw DeskService.error(404,"NOT_FOUND","항목을 찾을 수 없습니다.");};}
 @GetMapping("/capabilities") public Map<String,Object> capabilities(){return service.capabilities();}
 @GetMapping("/{resource:clips|memos|files}") public Map<String,Object> list(@PathVariable String resource,@RequestParam(defaultValue="")String q,@RequestParam(required=false)UUID projectId,@RequestParam(defaultValue="false")boolean unlinked,@RequestParam(required=false)String cursor,@RequestParam(defaultValue="50")int limit){return service.list(kind(resource),q,projectId,unlinked,cursor,limit,false);}
 @GetMapping("/{resource:clips|memos|files}/{id}") public ResponseEntity<Map<String,Object>> get(@PathVariable String resource,@PathVariable UUID id){var r=service.get(kind(resource),id);return ResponseEntity.ok().eTag("\""+r.get("revision")+"\"").header("Cache-Control","no-store").body(r);}
 @PostMapping("/{resource:clips|memos}") public ResponseEntity<Map<String,Object>> create(@PathVariable String resource,@RequestBody Map<String,Object>b){return ResponseEntity.status(201).body(service.create(kind(resource),b));}
 @PatchMapping("/{resource:clips|memos|files}/{id}") public Map<String,Object> patch(@PathVariable String resource,@PathVariable UUID id,@RequestBody Map<String,Object>b){return service.patch(kind(resource),id,b);}
 @DeleteMapping("/{resource:clips|memos|files}/{id}") public Map<String,Object> delete(@PathVariable String resource,@PathVariable UUID id,@RequestBody Map<String,Object>b){return service.delete(kind(resource),id,b);}
 @GetMapping("/trash") public Map<String,Object> trash(@RequestParam(required=false)String cursor,@RequestParam(defaultValue="50")int limit){return service.list("ALL","",null,false,cursor,limit,true);}
 @PostMapping("/items/{id}/restore") public Map<String,Object> restore(@PathVariable UUID id,@RequestBody Map<String,Object>b){return service.restore(id,b);}
 @GetMapping("/operations/{id}") public Map<String,Object> operation(@PathVariable UUID id){return service.operation(id);}
 @GetMapping("/changes") public Map<String,Object> changes(@RequestParam(required=false)String after,@RequestParam(required=false)String until,@RequestParam(defaultValue="100")int limit){return service.changes(after,until,limit);}
 @GetMapping("/memos/{id}/replies") public Map<String,Object> replies(@PathVariable UUID id,@RequestParam(required=false)String cursor,@RequestParam(defaultValue="100")int limit){return service.replyPage(id,cursor,limit);}
 @GetMapping("/usage") public Map<String,Object> usage(){return service.usage();}
 @PostMapping("/memos/{id}/replies") public ResponseEntity<Map<String,Object>> reply(@PathVariable UUID id,@RequestBody Map<String,Object>b){return ResponseEntity.status(201).body(service.reply(id,b));}
 @PostMapping("/files/upload-tickets") public Map<String,Object> upload(@RequestBody Map<String,Object>b){return files.create(b);}
 @PostMapping("/files/{id}/upload-tickets") public Map<String,Object> retry(@PathVariable UUID id,@RequestBody Map<String,Object>b){return files.retry(id,b);}
 @PostMapping("/files/{id}/complete") public ResponseEntity<Map<String,Object>> complete(@PathVariable UUID id,@RequestBody Map<String,Object>b){var result=files.complete(id,b);if("FAILED".equals(result.get("state"))){result=new LinkedHashMap<>(result);result.put("code","FILE_VERIFICATION_FAILED");result.put("message","파일 검증에 실패했습니다. 원본 파일을 확인하고 다시 전송해주세요.");return ResponseEntity.status(422).body(result);}return ResponseEntity.status("VERIFYING".equals(result.get("status"))?202:200).body(result);}
 @PostMapping("/files/{id}/cancel") public Map<String,Object> cancel(@PathVariable UUID id,@RequestBody Map<String,Object>b){return files.cancel(id,b);}
 @PostMapping("/files/{id}/download-tickets") public ResponseEntity<Map<String,Object>> download(@PathVariable UUID id){return ResponseEntity.ok().header("Cache-Control","no-store").body(files.download(id));}
}
