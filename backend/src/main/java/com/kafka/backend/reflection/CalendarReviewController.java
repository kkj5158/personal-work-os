package com.kafka.backend.reflection;

import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.DeserializationFeature;
import static com.kafka.backend.reflection.CalendarReviewTypes.*;

@RestController
@RequestMapping("/api/calendar/reviews")
public class CalendarReviewController {
    private final CalendarReviewService service;
    private static final JsonMapper STRICT=JsonMapper.builder().disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT).disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
    private <T>T input(JsonNode node,Class<T> type){if(node==null||!node.isObject())throw new com.kafka.backend.common.InvalidRequestException("입력 정보를 확인하세요.");return STRICT.treeToValue(node,type);}
    @ExceptionHandler(tools.jackson.core.JacksonException.class)
    public ResponseEntity<Map<String,String>> invalid(){return ResponseEntity.badRequest().body(Map.of("message","점수·감정·버전은 정수로 입력하세요."));}
    public CalendarReviewController(CalendarReviewService service){this.service=service;}
    @GetMapping public Range range(@RequestParam LocalDate from,@RequestParam LocalDate to){return service.range(from,to);}
    @GetMapping("/days/{date}") public Daily daily(@PathVariable LocalDate date){return service.daily(date);}
    @GetMapping("/weeks/{date}") public ResponseEntity<Weekly> weekly(@PathVariable LocalDate date){var value=service.weekly(date);return value==null?ResponseEntity.noContent().build():ResponseEntity.ok(value);}
    @PutMapping("/weeks/{date}") public Weekly saveWeekly(@PathVariable LocalDate date,@RequestBody JsonNode body){return service.saveWeekly(date,input(body,WeeklyInput.class));}
}
