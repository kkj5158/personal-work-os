package com.kafka.backend.workflow.attention;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.*;
@RestController @RequestMapping("/api/orbit/work-queue/v1")
public class AttentionManagementController {
 private final AttentionManagement management;
 public AttentionManagementController(AttentionManagement management){this.management=management;}
 @GetMapping("/list") public Map<String,Object> list(@RequestParam Map<String,Object> in){return management.list(in,false);}
 @GetMapping("/summary") public Map<String,Object> summary(@RequestParam Map<String,Object> in){return management.list(in,true);}
 @GetMapping("/item") public Map<String,Object> item(@RequestParam UUID id){return management.item(id);}
 @GetMapping("/connections") public Map<String,Object> connections(){return management.connections();}
 @GetMapping("/operation") public Map<String,Object> operation(@RequestParam UUID requestId,@RequestParam(defaultValue="0")int offset,@RequestParam(defaultValue="50")int limit){return management.outcome(requestId,offset,limit);}
 @PostMapping("/preview") public Map<String,Object> preview(@RequestBody Map<String,Object> in){return management.preview(in);}
 @PostMapping("/execute") public ResponseEntity<Map<String,Object>> execute(@RequestBody Map<String,Object> in){var result=management.execute(in);var data=(Map<?,?>)result.get("data");return ResponseEntity.status("CONFLICT".equals(data.get("status"))?409:200).cacheControl(CacheControl.noStore()).body(result);}
 @PostMapping("/{command}") public Map<String,Object> command(@PathVariable String command,@RequestBody Map<String,Object> in){return management.command(command,in);}
 @ExceptionHandler(AttentionException.class) public ResponseEntity<Map<String,Object>> rejected(AttentionException e){return ResponseEntity.status(e.status()).cacheControl(CacheControl.noStore()).body(Map.of("code",e.code(),"message","Owner-scoped queue request rejected; recover unknown writes with original requestId"));}
 @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class) public ResponseEntity<Map<String,Object>> credentials(org.springframework.web.server.ResponseStatusException e){return ResponseEntity.status(e.getStatusCode()).cacheControl(CacheControl.noStore()).body(Map.of("code","CONNECTION_REJECTED","message","Connection cannot be changed under its current canonical state"));}
 @ExceptionHandler(org.springframework.dao.DataAccessException.class) public ResponseEntity<Map<String,String>> unavailable(){return ResponseEntity.status(503).cacheControl(CacheControl.noStore()).body(Map.of("code","TEMPORARILY_UNAVAILABLE","message","Recover the original requestId before retrying a write"));}
}
