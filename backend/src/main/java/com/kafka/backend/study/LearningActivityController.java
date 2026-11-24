package com.kafka.backend.study;

import java.util.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/study")
class LearningActivityController {
    final LearningActivity activity;
    final LearningQueries queries;
    LearningActivityController(LearningActivity activity,LearningQueries queries){this.activity=activity;this.queries=queries;}
    @PostMapping("/learning-sessions/{id}/pairing-challenge")
    JsonNode challenge(@PathVariable UUID id,@RequestBody JsonNode body){return activity.challenge(id,body);}
    @GetMapping("/activity/status") JsonNode status(){return queries.current();}
    static String secret(String auth){
        if(!auth.matches("StudyCollector [a-f0-9]{64}"))throw LearningActivity.denied();
        return auth.substring("StudyCollector ".length());
    }
    @PostMapping("/activity/bind") JsonNode bind(@RequestHeader("Authorization") String auth,@RequestBody JsonNode body){return activity.bind(secret(auth),body);}
    @PostMapping("/activity/events/batch") JsonNode batch(@RequestHeader("Authorization") String auth,@RequestBody JsonNode body){return activity.ingest(secret(auth),body,false);}
    @PostMapping("/activity/heartbeat") JsonNode heartbeat(@RequestHeader("Authorization") String auth,@RequestBody JsonNode body){return activity.ingest(secret(auth),body,true);}
    @PostMapping("/activity/revoke") void revoke(@RequestHeader("Authorization") String auth){activity.revoke(secret(auth));}
}
