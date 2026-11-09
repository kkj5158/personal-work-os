package com.kafka.backend.orbit;
import com.kafka.backend.sleep.SleepService;
import com.kafka.backend.ops.SleepRecoveryAdapter;
import org.springframework.web.bind.annotation.*;
import java.util.*;
/** Read-only extension of POS context APIs; not an ORBIT conversation application or ledger. */
@org.springframework.transaction.annotation.Transactional(readOnly=true,timeout=10)
@RestController @RequestMapping("/api/orbit/context")
public class SleepContextController {
 private final OrbitQueryGuard guard;private final SleepService sleep;private final SleepRecoveryAdapter recovery;
 public SleepContextController(SleepService sleep,SleepRecoveryAdapter recovery,OrbitQueryGuard guard){this.guard=guard;this.sleep=sleep;this.recovery=recovery;}
 @GetMapping("/get_sleep_context") public Map<String,Object> sleep(@RequestParam(defaultValue="Asia/Seoul")String timezone){guard.check("sleep_events","sleep_sessions");return sleep.context(timezone,null);}
 @GetMapping("/get_recovery_context") public Map<String,Object> recovery(@RequestParam(defaultValue="Asia/Seoul")String timezone){guard.check("sleep_events","sleep_sessions");return recovery.context(timezone,null);}
}
