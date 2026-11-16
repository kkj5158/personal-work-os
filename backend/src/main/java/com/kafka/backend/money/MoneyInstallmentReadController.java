package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/money/bookkeeping/installment-contributions")
public class MoneyInstallmentReadController {
 private final MoneyInstallmentReadService service;
 public MoneyInstallmentReadController(MoneyInstallmentReadService service){this.service=service;}
 @GetMapping public MoneyInstallmentReadService.Page read(@RequestParam String from,@RequestParam String to,@RequestParam(required=false) UUID destinationAccountId,@RequestParam(required=false) String search,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset,@RequestParam(required=false) String currency){return service.read(from,to,destinationAccountId,search,limit,offset,currency);}
}
