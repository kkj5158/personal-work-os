package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import static com.kafka.backend.money.MoneyService.require;

@RestController
@RequestMapping("/api/money/manual-entries")
public class MoneyManualEntryController {
    public record Entry(UUID requestId,MoneyProductService.Entry transaction,Long fromVersion,Long toVersion,Long refundVersion){}
    public record Receipt(UUID requestId,MoneyFinancialService.ReceiptInput receipt){}
    private final CurrentUserProvider users;
    private final MoneyCommandService commands;
    private final MoneyService money;
    private final MoneyProductService product;
    private final MoneyFinancialService financial;
    public MoneyManualEntryController(CurrentUserProvider users,MoneyCommandService commands,MoneyService money,MoneyProductService product,MoneyFinancialService financial){
        this.users=users;this.commands=commands;this.money=money;this.product=product;this.financial=financial;
    }
    @PostMapping public Map<String,Object> create(@RequestBody Entry input){
        require(input!=null&&input.requestId()!=null&&input.transaction()!=null,"거래와 요청 ID가 필요합니다.");
        return commands.execute(users.getCurrentUserId(),input.requestId(),"WEB_MANUAL_ENTRY",input,()->{
            var e=input.transaction();
            require(e.occurredAt()!=null&&!e.occurredAt().isAfter(java.time.Instant.now().plusSeconds(60)),"실제 거래 시각을 확인하세요.");
            MoneyService.currencyAmount(e.amount(),"KRW");
            if(e.fromAccountId()!=null)MoneyMeaningService.version(money.account(e.fromAccountId()).version(),input.fromVersion());
            if(e.toAccountId()!=null)MoneyMeaningService.version(money.account(e.toAccountId()).version(),input.toVersion());
            if(e.refundOf()!=null)MoneyMeaningService.version(money.transaction(e.refundOf()).version(),input.refundVersion());
            return Map.of("transactionId",product.save(null,e).id());
        });
    }
    @PostMapping("/loan-receipt") public Map<String,Object> receipt(@RequestBody Receipt input){
        require(input!=null&&input.requestId()!=null,"요청 ID가 필요합니다.");
        return commands.execute(users.getCurrentUserId(),input.requestId(),"MANUAL_LOAN_RECEIPT",input,
            ()->Map.of("transactionId",financial.receipt(input.receipt()).id()));
    }
}
