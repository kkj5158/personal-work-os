package com.kafka.backend.money;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.*;
import java.math.BigDecimal;

@RestController
@RequestMapping("/api/money")
public class MoneyMeaningController {
 private final MoneyMeaningService meaning;private final MoneyReviewService review;
 public MoneyMeaningController(MoneyMeaningService meaning,MoneyReviewService review){this.meaning=meaning;this.review=review;}
 @ExceptionHandler({java.time.DateTimeException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class}) public ResponseEntity<Map<String,String>> invalid(){return ResponseEntity.badRequest().body(Map.of("message","유효한 날짜 / 식별자를 입력하세요."));}
 @ExceptionHandler(org.springframework.dao.DataAccessException.class) public ResponseEntity<Map<String,String>> storage(org.springframework.dao.DataAccessException e){return ResponseEntity.status(e instanceof org.springframework.dao.DataIntegrityViolationException?409:500).body(Map.of("message","저장하지 못했습니다. 새로고침 후 다시 확인하세요."));}
 @GetMapping("/tracking") public Map<String,Object> tracking(){return meaning.tracking();}
 @PutMapping("/tracking") public Map<String,Object> tracking(@RequestBody MoneyMeaningService.TrackingInput input){return meaning.saveTracking(input);}
 @GetMapping("/classification-rules") public List<Map<String,Object>> rules(){return meaning.rules();}
 @PostMapping("/classification-rules") public Map<String,Object> rule(@RequestBody MoneyMeaningService.RuleInput input){return meaning.saveRule(null,input);}
 @PutMapping("/classification-rules/{id}") public Map<String,Object> rule(@PathVariable UUID id,@RequestBody MoneyMeaningService.RuleInput input){return meaning.saveRule(id,input);}
 @PutMapping("/classification-rules/order") public List<Map<String,Object>> order(@RequestBody MoneyMeaningService.RuleOrder input){return meaning.reorder(input);}
 @PostMapping("/classification-rules/history/preview") public Map<String,Object> preview(@RequestBody MoneyMeaningService.HistoryRequest input){return meaning.preview(input);}
 @PostMapping("/classification-rules/history/apply") public Map<String,Object> apply(@RequestBody MoneyMeaningService.HistoryRequest input){return meaning.applyHistory(input);}
 @GetMapping("/meaning-history/{id}") public List<Map<String,Object>> history(@PathVariable UUID id){return meaning.history(id);}
 @GetMapping("/classification-rules/ai-status") public Map<String,Object> ai(){return Map.of("available",false,"reason","승인된 AI 추천 제공자가 설정되지 않았습니다. 수동 결정 규칙을 사용할 수 있습니다.");}
 @GetMapping("/review/queue") public Map<String,Object> queue(@RequestParam(required=false) String reasons,@RequestParam(required=false) String accountIds,@RequestParam(required=false) String types,@RequestParam(required=false) String states,@RequestParam(required=false) BigDecimal minAmount,@RequestParam(required=false) BigDecimal maxAmount,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset){return review.queue(reasons,accountIds,types,states,minAmount,maxAmount,limit,offset);}
 @GetMapping("/review/diagnostics") public Map<String,Object> diagnostics(){return review.diagnostics();}
 @PostMapping("/review/complete") public Map<String,Object> complete(@RequestBody MoneyReviewService.Complete input){return review.complete(input);}
}
