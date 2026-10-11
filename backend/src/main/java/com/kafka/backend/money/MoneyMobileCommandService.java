package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.stereotype.Service;
import java.util.*;
import static com.kafka.backend.money.MoneyService.require;

/** Additive transport wrapper. Canonical finance/meaning services validate and persist every fact. */
@Service
public class MoneyMobileCommandService {
    public record QuickEntry(UUID requestId, MoneyProductService.Entry transaction, boolean bookkeepingIncluded) {}
    public record ReviewDecision(UUID requestId, MoneyAiService.Decision decision) {}
    public record RawConfirmation(UUID requestId, MoneyProductService.ReviewPost review) {}
    public record Undo(UUID requestId, UUID eventId) {}
    public record BookMeaning(UUID requestId, UUID transactionId, MoneyWebTypes.BookkeepingEdit edit) {}
    private final CurrentUserProvider users;
    private final MoneyCommandService commands;
    private final MoneyProductService product;
    private final MoneyWebService web;
    private final MoneyAiService ai;
    public MoneyMobileCommandService(CurrentUserProvider users, MoneyCommandService commands, MoneyProductService product, MoneyWebService web, MoneyAiService ai) {
        this.users=users; this.commands=commands; this.product=product; this.web=web; this.ai=ai;
    }
    public Map<String,Object> create(QuickEntry input) {
        require(input!=null && input.requestId()!=null && input.transaction()!=null,"거래와 요청 식별자가 필요합니다.");
        return commands.execute(users.getCurrentUserId(),input.requestId(),"MOBILE_QUICK_ENTRY",input,()->{
            var entry=input.transaction();
            require(entry.type()!=null && Set.of(MoneyTypes.TransactionType.EXPENSE,MoneyTypes.TransactionType.INCOME,
                MoneyTypes.TransactionType.TRANSFER,MoneyTypes.TransactionType.REFUND).contains(entry.type()),"빠른 입력 유형을 확인하세요.");
            require(entry.expectedVersion()==null && !entry.excluded(),"빠른 입력에서 기존 금융 사실을 정정하거나 제외할 수 없습니다.");
            var transaction=product.save(null,entry);
            if(entry.type()==MoneyTypes.TransactionType.EXPENSE && !input.bookkeepingIncluded()) {
                var row=web.bookkeepingRow(transaction.id());
                var overrides=new LinkedHashMap<>((Map<String,Object>)row.get("overrides")); overrides.put("excluded",true);
                web.saveBookkeeping(transaction.id(),new MoneyWebTypes.BookkeepingEdit(((Number)row.get("version")).longValue(),
                    ((Number)row.get("transactionVersion")).longValue(),overrides,((Number)row.get("projectionVersion")).longValue()));
            }
            return Map.of("transactionId",transaction.id());
        });
    }
    public Map<String,Object> outcome(UUID requestId) { return commands.outcome(users.getCurrentUserId(),requestId); }
    public Map<String,Object> decide(ReviewDecision input) {
        require(input!=null && input.requestId()!=null && input.decision()!=null,"검토와 요청 식별자가 필요합니다.");
        return commands.execute(users.getCurrentUserId(),input.requestId(),"MOBILE_REVIEW_DECISION",input,()->ai.decide(input.decision()));
    }
    public Map<String,Object> confirm(RawConfirmation input) {
        require(input!=null && input.requestId()!=null && input.review()!=null,"원문 검토와 요청 식별자가 필요합니다.");
        return commands.execute(users.getCurrentUserId(),input.requestId(),"MOBILE_RAW_CONFIRM",input,()->Map.of("transactionId",product.reviewPost(input.review()).id()));
    }
    public Map<String,Object> undo(Undo input) {
        require(input!=null && input.requestId()!=null && input.eventId()!=null,"취소할 결정과 요청 식별자가 필요합니다.");
        return commands.execute(users.getCurrentUserId(),input.requestId(),"MOBILE_REVIEW_UNDO",input,()->ai.undo(input.eventId()));
    }
    public Map<String,Object> book(BookMeaning input) {
        require(input!=null && input.requestId()!=null && input.transactionId()!=null && input.edit()!=null,"가계부 변경과 요청 식별자가 필요합니다.");
        return commands.execute(users.getCurrentUserId(),input.requestId(),"MOBILE_BOOK_MEANING",input,()->web.saveBookkeeping(input.transactionId(),input.edit()));
    }
}
