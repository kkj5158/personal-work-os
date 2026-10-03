package com.kafka.backend.sleep;
import com.kafka.backend.ops.SleepRecoveryAdapter;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.time.*;
import java.util.*;
@RestController @RequestMapping("/api/sleep/v1")
public class SleepController {
 private final SleepService sleep;private final SleepRecoveryAdapter recovery;
 public SleepController(SleepService sleep,SleepRecoveryAdapter recovery){this.sleep=sleep;this.recovery=recovery;}
 @ExceptionHandler(SleepError.class) public ResponseEntity<Map<String,Object>> error(SleepError e){return ResponseEntity.status(e.status).body(e.body);}
 @ExceptionHandler({DateTimeException.class,IllegalArgumentException.class}) public ResponseEntity<Map<String,Object>> invalid(Exception e){
  return ResponseEntity.unprocessableEntity().body(Map.of("code","INVALID_INPUT","message","날짜, 시각과 입력을 확인해주세요."));
 }
 @GetMapping("/today") public Map<String,Object> today(@RequestParam(defaultValue="Asia/Seoul")String timezone){return sleep.today(timezone);}
 @PostMapping("/actions") public Map<String,Object> action(@RequestBody Map<String,Object> input){return sleep.action(input);}
 @GetMapping("/sessions") public Map<String,Object> sessions(@RequestParam(required=false)String from,@RequestParam(required=false)String to,@RequestParam(required=false)String cursor,
  @RequestParam(defaultValue="30")int limit,@RequestParam(defaultValue="false")boolean includeExcluded){return sleep.history(from,to,cursor,limit,includeExcluded);}
 @GetMapping("/sessions/{id}") public Map<String,Object> session(@PathVariable UUID id){return sleep.session(id);}
 @GetMapping("/sessions/{id}/events") public Map<String,Object> events(@PathVariable UUID id,@RequestParam(required=false)String cursor,@RequestParam(defaultValue="30")int limit){return sleep.events(id,cursor,limit);}
 @GetMapping("/reminder-settings") public Map<String,Object> settings(){return sleep.settings();}
 @PutMapping("/reminder-settings") public Map<String,Object> settings(@RequestBody Map<String,Object> input,@RequestParam(defaultValue="Asia/Seoul")String timezone){return sleep.saveSettings(input,timezone);}
 @PostMapping("/reminder-device") public Map<String,Object> device(@RequestBody Map<String,Object> input,@RequestParam(defaultValue="Asia/Seoul")String timezone){return sleep.reminderDevice(input,timezone);}
 @GetMapping("/metrics") public Map<String,Object> metrics(@RequestParam(defaultValue="7d")String window,@RequestParam(defaultValue="Asia/Seoul")String timezone,@RequestParam(required=false)String asOf){return sleep.metrics(window.equals("7d")?7:window.equals("30d")?30:0,timezone,asOf==null?null:Instant.parse(asOf));}
 @GetMapping("/context") public Map<String,Object> context(@RequestParam(defaultValue="Asia/Seoul")String timezone,@RequestParam(required=false)String asOf){return sleep.context(timezone,asOf==null?null:Instant.parse(asOf));}
 @GetMapping("/recovery-context") public Map<String,Object> recovery(@RequestParam(defaultValue="Asia/Seoul")String timezone,@RequestParam(required=false)String asOf){return recovery.context(timezone,asOf==null?null:Instant.parse(asOf));}
}
