package com.kafka.backend.orbit;
import com.kafka.backend.sleep.SleepService;
import com.kafka.backend.ops.SleepRecoveryAdapter;
import org.springframework.web.bind.annotation.*;
import java.util.*;
/** Read-only extension of POS context APIs; not an ORBIT conversation application or ledger. */
@RestController @RequestMapping("/api/orbit/context")
public class SleepContextController {
 private final SleepService sleep;private final SleepRecoveryAdapter recovery;
 public SleepContextController(SleepService sleep,SleepRecoveryAdapter recovery){this.sleep=sleep;this.recovery=recovery;}
 @GetMapping("/get_sleep_context") public Map<String,Object> sleep(@RequestParam(defaultValue="Asia/Seoul")String timezone){return sleep.context(timezone,null);}
 @GetMapping("/get_recovery_context") public Map<String,Object> recovery(@RequestParam(defaultValue="Asia/Seoul")String timezone){return recovery.context(timezone,null);}
}
