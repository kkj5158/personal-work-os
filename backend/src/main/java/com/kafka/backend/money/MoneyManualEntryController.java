package com.kafka.backend.money;

import com.fasterxml.jackson.annotation.JsonInclude;
import static com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL;

import com.kafka.backend.common.CurrentUserProvider;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import static com.kafka.backend.money.MoneyService.require;

@RestController
@RequestMapping("/api/money/manual-entries")
public class MoneyManualEntryController {
    public record Entry(UUID requestId,MoneyProductService.Entry transaction,Long fromVersion,Long toVersion,Long refundVersion,
      @JsonInclude(NON_NULL) UUID semanticCategoryId,
      @JsonInclude(NON_NULL) Long semanticPolicyVersion){
  public Entry(UUID requestId,MoneyProductService.Entry transaction,Long fromVersion,Long toVersion,Long refundVersion){this(requestId,transaction,fromVersion,toVersion,refundVersion,null,null);}
 }
    public record Receipt(UUID requestId,MoneyFinancialService.ReceiptInput receipt,
      @JsonInclude(NON_NULL) UUID semanticCategoryId,
      @JsonInclude(NON_NULL) Long semanticPolicyVersion,
      @JsonInclude(NON_NULL) String title,
      @JsonInclude(NON_NULL) String counterpartyText,
      @JsonInclude(NON_NULL) String memo){
  public Receipt(UUID requestId,MoneyFinancialService.ReceiptInput receipt){this(requestId,receipt,null,null,null,null,null);}
 }
    public record Payment(UUID requestId,MoneyFinancialService.PaymentInput payment,UUID semanticCategoryId,Long semanticPolicyVersion,Long fromVersion,String title,String counterpartyText,String memo){}
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
            var fact=product.save(null,e);
            product.bindFinancialCategory(fact.id(),input.requestId(),input.semanticCategoryId(),input.semanticPolicyVersion(),e.type().name());
            return Map.of("transactionId",fact.id());
        });
    }
    @PostMapping("/loan-receipt") public Map<String,Object> receipt(@RequestBody Receipt input){
        require(input!=null&&input.requestId()!=null,"요청 ID가 필요합니다.");
        return commands.execute(users.getCurrentUserId(),input.requestId(),"MANUAL_LOAN_RECEIPT",input,
            ()->{
                var fact=financial.receipt(input.receipt());
                product.setManualMetadata(fact.id(),input.title(),input.counterpartyText(),input.memo());
                product.bindFinancialCategory(fact.id(),input.requestId(),input.semanticCategoryId(),input.semanticPolicyVersion(),"LOAN_RECEIPT");
                return Map.of("transactionId",fact.id());
            });
    }
    @PostMapping("/loan-payment")
    public Map<String,Object> payment(@RequestBody Payment input) {
        require(input!=null && input.requestId()!=null && input.payment()!=null,"상환 정보와 요청 ID가 필요합니다.");
        return commands.execute(users.getCurrentUserId(),input.requestId(),"MANUAL_LOAN_PAYMENT",input,()->{
            MoneyMeaningService.version(money.account(input.payment().paymentAccountId()).version(),input.fromVersion());
            var fact=financial.payment(null,input.payment());
            product.setManualMetadata(fact.id(),input.title(),input.counterpartyText(),input.memo());
            product.bindFinancialCategory(fact.id(),input.requestId(),input.semanticCategoryId(),input.semanticPolicyVersion(),"LOAN_PAYMENT");
            return Map.of("transactionId",fact.id());
        });
    }
}
