package com.kafka.backend.money;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.util.Map;

@RestController
@RequestMapping("/api/money")
public class MoneyProcessingReadController {
 private final MoneyProcessingReadService read;
 public MoneyProcessingReadController(MoneyProcessingReadService read){this.read=read;}
 @ExceptionHandler({java.time.DateTimeException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
 public ResponseEntity<Map<String,String>> invalid(){return ResponseEntity.badRequest().body(Map.of("message","유효한 날짜를 입력하세요."));}
 @GetMapping("/processing") public Map<String,Object> processing(@RequestParam String from,@RequestParam String to){return read.processing(from,to);}
}
