package com.kafka.backend.money;

import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/money")
public class MoneyProcessingReadController {
 private final MoneyProcessingReadService read;
 public MoneyProcessingReadController(MoneyProcessingReadService read){this.read=read;}
 @GetMapping("/processing") public Map<String,Object> processing(@RequestParam String from,@RequestParam String to){return read.processing(from,to);}
}
