package com.kafka.backend.sleep;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.time.*;
import java.util.*;
@RestController @RequestMapping("/api/sleep/v1")
public class SleepGuidanceController {
 private final SleepGuidanceService guidance;
 public SleepGuidanceController(SleepGuidanceService guidance){this.guidance=guidance;}
 @GetMapping("/goals") public Map<String,Object> goal(){return guidance.goal();}
 @PutMapping("/goals") public Map<String,Object> goal(@RequestBody Map<String,Object> input){return guidance.saveGoal(input);}
 @GetMapping("/guidance") public Map<String,Object> guidance(@RequestParam(defaultValue="Asia/Seoul")String timezone,@RequestParam(required=false)String asOf){return guidance.guidance(timezone,asOf==null?null:Instant.parse(asOf));}
 @ExceptionHandler(SleepError.class) public ResponseEntity<Map<String,Object>> error(SleepError e){return ResponseEntity.status(e.status).body(e.body);}
 @ExceptionHandler({DateTimeException.class,IllegalArgumentException.class}) public ResponseEntity<Map<String,Object>> invalid(Exception e){return ResponseEntity.unprocessableEntity().body(Map.of("code","INVALID_GOAL","message","목표의 시각·범위·timezone을 확인해주세요."));}
}
