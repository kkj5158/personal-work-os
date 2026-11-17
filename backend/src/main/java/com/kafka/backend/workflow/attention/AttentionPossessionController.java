package com.kafka.backend.workflow.attention;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.*;
/** Not delegated: only the normal owner session can attest a protected local producer key. */
@RestController
public class AttentionPossessionController {
 private final AttentionManagement management;
 public AttentionPossessionController(AttentionManagement management){this.management=management;}
 @PostMapping("/api/workflow/attention/devices/{id}/possession") public ResponseEntity<Map<String,Object>> possession(@PathVariable UUID id,@RequestBody Map<String,Object> in){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(management.possession(id,in));}
 @ExceptionHandler(AttentionException.class) public ResponseEntity<Map<String,String>> rejected(AttentionException e){return ResponseEntity.status(e.status()).cacheControl(CacheControl.noStore()).body(Map.of("code",e.code()));}
}
