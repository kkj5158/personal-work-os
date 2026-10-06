package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/money/ai/merchant-links")
public class MoneyMerchantLinkController {
 private final MoneyMerchantLinkService service;
 public MoneyMerchantLinkController(MoneyMerchantLinkService service){this.service=service;}
 @GetMapping public Map<String,Object> list(@RequestParam(defaultValue="") String search,@RequestParam(defaultValue="0") int offset){return service.list(search,offset);}
 @PostMapping("/preview") public Map<String,Object> preview(@RequestBody MoneyMerchantLinkService.Input input){return service.preview(input);}
 @PostMapping("/apply") public Map<String,Object> apply(@RequestBody MoneyMerchantLinkService.Input input){return service.apply(input);}
}
