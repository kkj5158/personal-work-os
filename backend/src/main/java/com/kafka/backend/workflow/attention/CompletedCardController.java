package com.kafka.backend.workflow.attention;

import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/workflow/attention/completed-cards")
public class CompletedCardController {
    private final AttentionManagement management;
    public CompletedCardController(AttentionManagement management){this.management=management;}
    public record Preview(UUID requestId,List<UUID> ids,UUID undoBatch) {}
    @PostMapping("/preview")
    public Map<String,Object> preview(@RequestBody Preview request) {
        var plan=new HashMap<String,Object>();
        plan.put("requestId",Objects.toString(request.requestId(),""));
        if(request.undoBatch()==null){
            plan.put("action","HIDE");
            plan.put("group","COMPLETED");
            if(request.ids()!=null) plan.put("ids",request.ids().stream().map(UUID::toString).toList());
        }else{
            if(request.ids()!=null) throw new AttentionException(400,"INVALID_FILTER");
            management.requireCompletedBatch(request.undoBatch());
            plan.put("action","RESTORE");
            plan.put("batchId",request.undoBatch().toString());
        }
        return management.preview(plan);
    }
    @PostMapping("/execute")
    public ResponseEntity<Map<String,Object>> execute(@RequestBody Map<String,Object> request){
        var result=management.executeCompleted(request);
        var data=(Map<?,?>)result.get("data");
        return ResponseEntity.status("CONFLICT".equals(data.get("status"))?409:200).cacheControl(org.springframework.http.CacheControl.noStore()).body(result);
    }
    @ExceptionHandler(AttentionException.class)
    public ResponseEntity<Map<String,String>> rejected(AttentionException e){
        return ResponseEntity.status(e.status()).body(Map.of("code",e.code()));
    }
}
