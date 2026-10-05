package com.kafka.backend.workflow.attention;

import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import static com.kafka.backend.workflow.attention.AttentionTypes.*;

@RestController @RequestMapping("/api/workflow/attention")
public class AttentionController {
    private final AttentionService service;
    public AttentionController(AttentionService service){this.service=service;}
    @GetMapping("/snapshot") public ResponseEntity<Snapshot> snapshot(@RequestHeader(value="If-None-Match",required=false)String previous){var snapshot=service.snapshot();String etag=service.etag(snapshot);return previous!=null&&Arrays.asList(previous.split(",")).stream().map(String::trim).anyMatch(etag::equals)?ResponseEntity.status(304).cacheControl(CacheControl.noCache().cachePrivate()).eTag(etag).build():ResponseEntity.ok().cacheControl(CacheControl.noCache().cachePrivate()).eTag(etag).body(snapshot);}
    @GetMapping("/items") public History history(@RequestParam String status,@RequestParam(required=false)String cursor,@RequestParam(required=false,name="q")String query){return service.history(status,cursor,query);}
    @GetMapping("/items/{id}") public Item item(@PathVariable UUID id){return service.item(id);}
    @PostMapping("/items") public Mutation create(@RequestBody Create in){return service.create(in);}
    @PatchMapping("/items/{id}") public Mutation edit(@PathVariable UUID id,@RequestBody Map<String,Object> in){return service.edit(id,in);}
    @PostMapping("/items/{id}/complete") public Mutation complete(@PathVariable UUID id,@RequestBody Action in){return service.status(id,"COMPLETED",in);}
    @PostMapping("/items/{id}/reopen") public Mutation reopen(@PathVariable UUID id,@RequestBody Action in){return service.status(id,"OPEN",in);}
    @PostMapping("/items/{id}/dismiss") public Mutation dismiss(@PathVariable UUID id,@RequestBody Action in){return service.status(id,"DISMISSED",in);}
    @PostMapping("/items/{id}/seen") public Mutation seen(@PathVariable UUID id,@RequestBody Action in){return service.seen(id,in);}
    @PostMapping("/items/{id}/move") public Mutation move(@PathVariable UUID id,@RequestBody Move in){return service.move(id,in);}
    @PostMapping("/items/{id}/target") public Mutation target(@PathVariable UUID id,@RequestBody Target in){return service.target(id,in);}
    @PostMapping("/lanes") public Mutation createLane(@RequestBody LaneCreate in){return service.createLane(in);}
    @PatchMapping("/lanes/{id}") public Mutation renameLane(@PathVariable UUID id,@RequestBody LaneRename in){return service.renameLane(id,in);}
    @PostMapping("/lanes/order") public Mutation orderLanes(@RequestBody LaneOrder in){return service.orderLanes(in);}
    @PostMapping("/lanes/{id}/remove") public Mutation removeLane(@PathVariable UUID id,@RequestBody LaneRemove in){return service.removeLane(id,in);}
    @PostMapping("/source-resolution") public Mutation resolve(@RequestBody Resolution in){return service.resolve(in);}
    @ExceptionHandler(AttentionException.class) public ResponseEntity<Map<String,Object>> rejected(AttentionException ex){var body=new LinkedHashMap<String,Object>();body.put("code",ex.code());body.put("message",ex.status()==409?"다른 곳에서 바뀌었습니다. 새로 확인해 주세요.":"요청을 확인해 주세요.");if(ex.latest()!=null)body.put("latest",ex.latest());if(ex.queueRevision()!=null)body.put("queueRevision",ex.queueRevision());return ResponseEntity.status(ex.status()).cacheControl(CacheControl.noStore()).body(body);}
    @ExceptionHandler(org.springframework.dao.DataAccessException.class) public ResponseEntity<Map<String,String>> unavailable(){return ResponseEntity.status(503).body(Map.of("code","TEMPORARILY_UNAVAILABLE","message","잠시 후 다시 시도해 주세요."));}
}
