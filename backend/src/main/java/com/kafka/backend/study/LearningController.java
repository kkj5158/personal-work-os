package com.kafka.backend.study;

import java.time.*;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import java.security.Principal;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/study")
class LearningController {
    final LearningQueries read;
    final LearningCommands write;
    LearningController(LearningQueries r,LearningCommands w){read=r;write=w;}
    static boolean delegated(Principal p){return p instanceof JwtAuthenticationToken jwt && jwt.getTokenAttributes().containsKey("client_id");}

    @PostMapping("/learning-sessions")
    JsonNode start(@RequestBody JsonNode body,Principal p){return write.execute("start",null,body,delegated(p));}
    @PostMapping("/learning-sessions/manual")
    JsonNode manual(@RequestBody JsonNode body,Principal p){return write.execute("manual",null,body,delegated(p));}
    @PostMapping("/learning-sessions/{id}/{action:pause|resume|complete|cancel|checkpoints|restore}")
    JsonNode action(@PathVariable UUID id,@PathVariable String action,@RequestBody JsonNode body,Principal p){
        return write.execute(action,id,body,delegated(p));
    }
    @PatchMapping("/learning-sessions/{id}")
    JsonNode update(@PathVariable UUID id,@RequestBody JsonNode body,Principal p){return write.execute("update",id,body,delegated(p));}
    @DeleteMapping("/learning-sessions/{id}")
    JsonNode delete(@PathVariable UUID id,@RequestBody JsonNode body,Principal p){return write.execute("delete",id,body,delegated(p));}
    @GetMapping("/learning-sessions/current") JsonNode current(){return read.current();}
    @GetMapping("/learning-sessions/{id}") JsonNode detail(@PathVariable UUID id){return read.detail(id);}
    @GetMapping("/learning-operations/{key}") JsonNode receipt(@PathVariable UUID key){return read.receipt(key);}
    @GetMapping("/learning-context") JsonNode context(@RequestParam(defaultValue="3") int recentLimit,@RequestParam(defaultValue="") String topic){return read.context(recentLimit,topic);}
    @GetMapping("/learning-sessions")
    JsonNode list(@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(defaultValue="") String cursor,
                  @RequestParam(defaultValue="20") int limit,@RequestParam(defaultValue="false") boolean includeDeleted){
        return read.list(from,to,cursor,limit,includeDeleted);
    }
    @GetMapping("/statistics")
    JsonNode stats(@RequestParam(required=false) String month,@RequestParam(required=false) LocalDate from,@RequestParam(required=false) LocalDate to){
        if(month!=null){StudyException.require(from==null && to==null);
            try{var m=YearMonth.parse(month);from=m.atDay(1);to=m.plusMonths(1).atDay(1);}
            catch(DateTimeException e){throw StudyException.invalid();}}
        return read.statistics(from,to);
    }
}
