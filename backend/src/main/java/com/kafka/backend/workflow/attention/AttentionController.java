package com.kafka.backend.workflow.attention;

import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import static com.kafka.backend.workflow.attention.AttentionTypes.*;

@RestController @RequestMapping("/api/workflow/attention")
public class AttentionController {
    private final AttentionService service;
    public AttentionController(AttentionService service){this.service=service;}
    @GetMapping("/feed") public ResponseEntity<Feed> feed(@RequestParam(required=false)String cursor,@RequestParam(required=false,name="q")String query,@RequestParam(required=false)String kind,@RequestParam(required=false)String intent,@RequestParam(defaultValue="false")boolean incomplete,@RequestHeader(value="If-None-Match",required=false)String previous){var result=service.feed(cursor,query,kind,intent,incomplete);String tag=service.feedEtag(result);return tag.equals(previous)?ResponseEntity.status(304).cacheControl(CacheControl.noCache().cachePrivate()).eTag(tag).build():ResponseEntity.ok().cacheControl(CacheControl.noCache().cachePrivate()).eTag(tag).body(result);}
    @PostMapping("/items/{id}/group") public Mutation group(@PathVariable UUID id,@RequestBody Group in){return service.group(id,in);}
    @GetMapping("/snapshot") public ResponseEntity<Snapshot> snapshot(@RequestHeader(value="If-None-Match",required=false)String previous){var read=service.conditionalSnapshot(previous);return read.snapshot()==null?ResponseEntity.status(304).cacheControl(CacheControl.noCache().cachePrivate()).eTag(read.etag()).build():ResponseEntity.ok().cacheControl(CacheControl.noCache().cachePrivate()).eTag(read.etag()).body(read.snapshot());}
    @GetMapping("/items") public History history(@RequestParam String status,@RequestParam(required=false)String cursor,@RequestParam(required=false,name="q")String query){return service.history(status,cursor,query);}
    @GetMapping("/items/{id}") public Item item(@PathVariable UUID id){return service.item(id);}
    @GetMapping("/browser-scopes") public java.util.List<AttentionService.BrowserScope> browserScopes(){return service.browserScopes();}
    @GetMapping("/browser-scopes/{scope}/active") public ResponseEntity<Void> activeBrowser(@PathVariable UUID scope){
        return ResponseEntity.status(service.activeBrowserScope(scope)?204:403).cacheControl(CacheControl.noStore()).build();
    }
    @PostMapping("/browser-scopes/{device}") public AttentionService.BrowserScope allowBrowser(@PathVariable UUID device){return service.allowBrowser(device);}
    @DeleteMapping("/browser-scopes/{scope}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void revokeBrowser(@PathVariable UUID scope){service.revokeBrowser(scope);}
    @PostMapping("/items") public Mutation create(@RequestBody Create in){
        if(in.source()!=null && in.source().capture()!=null) throw new AttentionException(400,"BROWSER_ROUTE_REQUIRED");
        return service.create(in);
    }
    @PostMapping(value="/browser-content/items",consumes=MediaType.APPLICATION_JSON_VALUE)
    public Mutation browserItem(jakarta.servlet.http.HttpServletRequest request) throws java.io.IOException {
        Create in=AttentionContent.read(AttentionContentController.readBounded(request),Create.class);
        if(in.source()==null || in.source().capture()==null) throw new AttentionException(400,"BROWSER_CAPTURE_REQUIRED");
        return service.create(in);
    }
    @PatchMapping("/items/{id}") public Mutation edit(@PathVariable UUID id,@RequestBody Map<String,Object> in){return service.edit(id,in);}
    @PostMapping("/items/{id}/memo") public Mutation memo(@PathVariable UUID id,@RequestBody Map<String,Object> in){return service.memo(id,AttentionService.memoRequest(in));}
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
