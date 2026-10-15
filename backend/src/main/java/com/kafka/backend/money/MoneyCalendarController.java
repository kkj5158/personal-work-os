package com.kafka.backend.money;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyCalendarTypes.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.DeserializationFeature;

@RestController
@RequestMapping("/api/money/calendar")
public class MoneyCalendarController {
 private final MoneyCalendarService work;private final MoneyWebService ledger;
 private static final JsonMapper STRICT=JsonMapper.builder().disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT).disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
 public MoneyCalendarController(MoneyCalendarService work,MoneyWebService ledger){this.work=work;this.ledger=ledger;}
 @ExceptionHandler({DateTimeException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,tools.jackson.core.JacksonException.class})
 public ResponseEntity<Map<String,String>> invalid(){return ResponseEntity.badRequest().body(Map.of("message","날짜·시각·식별자를 확인하세요."));}
 @GetMapping("/ledger") public Map<String,Object> ledger(@RequestParam String month,@RequestParam String kind,@RequestParam(required=false) String accountIds,@RequestParam(required=false) String categoryIds){return ledger.calendarLedger(month,kind,accountIds,categoryIds);}
 @GetMapping("/templates") public List<Map<String,Object>> templates(){return work.templates();}
 private <T> T input(JsonNode node,Class<T> type){return STRICT.treeToValue(node,type);}
 @GetMapping("/templates/{id}") public Map<String,Object> template(@PathVariable UUID id){return work.template(id);}
 @PutMapping("/templates/{id}") public Map<String,Object> template(@PathVariable UUID id,@RequestBody JsonNode body){return work.saveTemplate(id,input(body,TemplateInput.class));}
 @GetMapping("/work") public Map<String,Object> month(@RequestParam String month){return work.month(month);}
 @GetMapping("/pay-calendar") public Map<String,Object> payCalendar(@RequestParam String month){return work.payCalendar(month);}
 @GetMapping("/pay-weeks/{start}") public Map<String,Object> payWeek(@PathVariable LocalDate start){return work.payWeek(start);}
 @PutMapping("/pay-weeks/{start}") public Map<String,Object> payWeek(@PathVariable LocalDate start,@RequestBody JsonNode body){return work.savePayWeek(start,input(body,WeekInput.class));}
 @PostMapping("/work-records/{id}/remove-off") public Map<String,Object> removeOff(@PathVariable UUID id,@RequestBody JsonNode body){return work.removeOff(id,input(body,RemoveOffInput.class));}
 @GetMapping("/work-records/{id}") public Map<String,Object> record(@PathVariable UUID id){return work.record(id);}
 @PutMapping("/work-records/{id}") public Map<String,Object> record(@PathVariable UUID id,@RequestBody JsonNode body){return work.saveWork(id,input(body,WorkInput.class));}
 @GetMapping("/weeks/{start}") public Map<String,Object> week(@PathVariable LocalDate start){return work.week(start);}
 @PutMapping("/weeks/{start}") public Map<String,Object> week(@PathVariable LocalDate start,@RequestBody JsonNode body){return work.saveWeek(start,input(body,WeekInput.class));}
}
