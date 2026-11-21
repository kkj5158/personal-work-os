package com.kafka.backend.naverarchive;

import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/naver-archive/sync")
public class NaverRssController {
 final NaverRssSyncService service;
 public NaverRssController(NaverRssSyncService service){this.service=service;}
 @GetMapping public Map<String,Object> status(){return service.status();}
 @GetMapping("/items") public Map<String,Object> items(@RequestParam Map<String,String> q){return service.items(q);}
 @PostMapping("/config") public Map<String,Object> configure(@RequestBody Map<String,Object> body){return service.configure(body);}
 @PostMapping("/run") public Map<String,Object> run(@RequestBody Map<String,Object> body){return service.runNow(body);}
 @PostMapping("/items/{external}/link") public Map<String,Object> link(@PathVariable String external,@RequestBody Map<String,Object> body){return service.link(external,body);}
 @PostMapping("/items/{external}/ack") public Map<String,Object> acknowledge(@PathVariable String external,@RequestBody Map<String,Object> body){return service.acknowledge(external,body);}
 @ExceptionHandler(ArchiveException.class) public ResponseEntity<Map<String,String>> error(ArchiveException e){return ResponseEntity.status(e.status).cacheControl(CacheControl.noStore()).body(Map.of("message",e.getMessage()));}
}
