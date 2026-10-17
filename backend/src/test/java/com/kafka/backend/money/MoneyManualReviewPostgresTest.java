package com.kafka.backend.money;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyManualReviewService.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:55467/postgres.*")
class MoneyManualReviewPostgresTest {
    final MoneyRecommendationPostgresTest f=new MoneyRecommendationPostgresTest();
    MoneyManualReviewService service;
    final Instant at=Instant.parse("2026-09-16T01:00:00Z");
    @BeforeEach void setup() throws Exception {
        f.create();f.db.execute(java.nio.file.Files.readString(java.nio.file.Path.of("src/main/resources/db/migration/V88__money_owner_loan_receipt.sql")));
        service=new MoneyManualReviewService(f.db,()->f.owner,f.json,f.money,f.commands,new MoneyFinancialService(f.db,()->f.owner,f.money,f.product,f.web,f.json),f.web);
    }
    @AfterEach void cleanup() { f.cleanup(); }
    UUID raw() {
        var r=f.money.ingest(Map.of("text","합성 수동 확인 원문 "+UUID.randomUUID(),"postedAt",at.toString())).notification();
        f.money.finishProcessing(r.id(),ProcessingState.FAILED,"UNKNOWN_FORMAT");return r.id();
    }
    Confirmation input(UUID id,TransactionType type,String amount,String currency,UUID other,UUID existing,UUID refund,UUID loan) {
        var c=service.context(id);
        return new Confirmation(UUID.randomUUID(),List.of(new Source(id,((Number)c.get("version")).longValue(),c.get("fingerprint").toString())),existing==null?"REGISTER_SEPARATE":"LINK_DUPLICATE",type,
            f.account,other,f.money.account(f.account).version(),other==null?null:f.money.account(other).version(),new BigDecimal(amount),currency,at,"OWNER_ENTERED","합성 거래","직접 확인",existing,existing==null?null:f.money.transaction(existing).version(),refund,refund==null?null:f.money.transaction(refund).version(),loan,loan==null?null:f.web.loan(loan).version(),type==TransactionType.LOAN_PAYMENT?new BigDecimal("80"):null,type==TransactionType.LOAN_PAYMENT?new BigDecimal("15"):null,type==TransactionType.LOAN_PAYMENT?new BigDecimal("5"):null,true);
    }
    Map<String,Object> confirm(UUID id,Confirmation v) { return service.confirm(id,v); }
    UUID fact(Map<String,Object> r) { assertThat(r).containsEntry("status","APPLIED");return UUID.fromString(((Map<?,?>)r.get("result")).get("transactionId").toString()); }
    UUID loan() { UUID id=UUID.randomUUID();f.db.update("insert into money_loans(id,user_id,name,lender,type,original_principal,remaining_principal,status) values(?,?,'합성 대출','합성','OTHER',1000,200,'ACTIVE')",id,f.owner);return id; }
    @Test void failedParserCanFinishAtomicallyWithoutAiAndReplayIsExact() {
        UUID r=raw();var original=f.money.notification(r).rawPayload();var v=input(r,TransactionType.EXPENSE,"12.34","USD",null,null,null,null);
        var outcome=confirm(r,v);UUID id=fact(outcome);assertThat(confirm(r,v)).isEqualTo(outcome);
        var t=f.money.transaction(id);assertThat(t.currency()).isEqualTo("USD");assertThat(t.amount()).isEqualByComparingTo("12.34");assertThat(t.sources()).hasSize(1);assertThat(t.sources().getFirst().parseAttemptId()).isNull();
        assertThat(t.sources().getFirst().evidence()).containsKey("assertion");assertThat(t.categoryId()).isNull();assertThat(f.money.notification(r).rawPayload()).isEqualTo(original);
        assertThat(f.money.notification(r).state()).isEqualTo(ProcessingState.PROCESSED);assertThat(f.calls.get()).isZero();
        assertThat(f.db.queryForObject("select count(*) from money_classification_jobs where transaction_id=? and status='QUEUED'",Long.class,id)).isZero();
    }
    @Test void newIdentityCannotPostAnAlreadyLinkedSource() {
        UUID r=raw();fact(confirm(r,input(r,TransactionType.EXPENSE,"100","KRW",null,null,null,null)));
        assertThatThrownBy(()->service.context(r)).isInstanceOf(com.kafka.backend.common.InvalidRequestException.class);
        assertThat(f.db.queryForObject("select count(*) from money_transactions",Long.class)).isEqualTo(1);
    }
    @Test void evidenceChangeIsKnownNotAppliedAndLeavesNoOrphan() {
        UUID r=raw();var v=input(r,TransactionType.EXPENSE,"100","KRW",null,null,null,null);f.db.update("update money_raw_notifications set processing_version=processing_version+1 where id=?",r);
        assertThat(confirm(r,v)).containsEntry("status","NOT_APPLIED");assertThat(f.db.queryForObject("select count(*) from money_transaction_sources",Long.class)).isZero();assertThat(f.db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();
    }
    @Test void duplicateLinkPreservesDirectCategoryAndSeparateRegistrationIsAllowed() {
        UUID existing=f.product.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,f.account,null,new BigDecimal("100"),at,"합성",f.category,null,false,null,null,"합성")).id();
        UUID r=raw();assertThat(fact(confirm(r,input(r,TransactionType.EXPENSE,"100","KRW",null,existing,null,null)))).isEqualTo(existing);assertThat(f.money.transaction(existing).categoryId()).isEqualTo(f.category);
        UUID separate=raw();fact(confirm(separate,input(separate,TransactionType.EXPENSE,"100","KRW",null,null,null,null)));assertThat(f.db.queryForObject("select count(*) from money_transactions",Long.class)).isEqualTo(2);
    }
    @Test void transferHasOneFactAndCanonicalLegs() {
        UUID other=f.money.createAccount(new AccountInput("IBK","합성 도착",AccountRole.SPENDING,null,null)).id(),r=raw();UUID id=fact(confirm(r,input(r,TransactionType.TRANSFER,"100","KRW",other,null,null,null)));
        var t=f.money.transaction(id);assertThat(t.fromAccountId()).isEqualTo(f.account);assertThat(t.toAccountId()).isEqualTo(other);assertThat(t.type()).isEqualTo(TransactionType.TRANSFER);
        assertThat(f.product.balance(f.account).amount()).isEqualByComparingTo("-100");assertThat(f.product.balance(other).amount()).isEqualByComparingTo("100");
        assertThat(f.web.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("total")).isEqualTo(0L);
    }
    @Test void refundUsesOriginalAndRejectsOverRefund() {
        UUID expense=f.product.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,f.account,null,new BigDecimal("100"),at.minusSeconds(1),"원 지출",f.category,null,false,null,null,"원 지출")).id();
        UUID r=raw();UUID id=fact(confirm(r,input(r,TransactionType.REFUND,"60","KRW",null,null,expense,null)));assertThat(f.money.transaction(id).refundOf()).isEqualTo(expense);
        UUID extra=raw();assertThat(confirm(extra,input(extra,TransactionType.REFUND,"41","KRW",null,null,expense,null))).containsEntry("status","NOT_APPLIED");
        assertThat((BigDecimal)((Map<?,?>)f.web.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("summary")).get("total")).isEqualByComparingTo("40");
    }
    @Test void principalPaymentUsesRealLoanAndOnlyInterestAndFeeAreExpenses() {
        UUID loan=loan(),r=raw();UUID id=fact(confirm(r,input(r,TransactionType.LOAN_PAYMENT,"100","KRW",null,null,null,loan)));
        assertThat(f.web.loan(loan).remainingPrincipal()).isEqualByComparingTo("120");assertThat(f.money.transaction(id).sources()).hasSize(1);
        assertThat((BigDecimal)((Map<?,?>)f.web.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("summary")).get("total")).isEqualByComparingTo("20");
    }
    @Test void receiptIncreasesPrincipalAndBalanceWithoutIncome() {
        UUID loan=loan(),r=raw();UUID id=fact(confirm(r,input(r,TransactionType.LOAN_RECEIPT,"100","KRW",null,null,null,loan)));
        assertThat(f.money.transaction(id).type()).isEqualTo(TransactionType.LOAN_RECEIPT);assertThat(f.web.loan(loan).remainingPrincipal()).isEqualByComparingTo("300");assertThat(f.product.balance(f.account).amount()).isEqualByComparingTo("100");
        assertThat(f.web.bookkeeping("2026-09-01","2026-09-30","INCOME",null,50,0,false).get("total")).isEqualTo(0L);
    }
    @Test void archivedAccountAndForeignOwnerCannotWrite() {
        UUID r=raw();var v=input(r,TransactionType.EXPENSE,"100","KRW",null,null,null,null);f.db.update("update money_accounts set archived=true where id=?",f.account);assertThat(confirm(r,v)).containsEntry("status","NOT_APPLIED");
        UUID foreign=UUID.randomUUID();var otherMoney=new MoneyService(f.db,()->foreign,f.json);
        var outsider=new MoneyManualReviewService(f.db,()->foreign,f.json,otherMoney,f.commands,null,null);
        assertThatThrownBy(()->outsider.context(r)).isInstanceOf(RuntimeException.class);
    }
    @Test void foreignMinorUnitsAndCurrencyScopedCalendarProjectionRemainExact() {
        UUID r=raw();UUID id=fact(confirm(r,input(r,TransactionType.EXPENSE,"12.345","KWD",null,null,null,null)));
        assertThat(f.money.transaction(id).amount()).isEqualByComparingTo("12.345");
        var grouped=f.web.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false,null,null,null,null,"ALL",null,"KWD");
        assertThat((BigDecimal)((Map<?,?>)grouped.get("summary")).get("total")).isEqualByComparingTo("12.345");assertThat((List<?>)grouped.get("trend")).hasSize(1);
        assertThat(f.product.balance(f.account).amount()).isZero();
        assertThat(((Map<?,?>)f.web.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("summary")).get("total")).isNull();
    }
    @Test void allPeriodCountAndPaginationUseTheSameUnclassifiedProjection() {
        for(int i=0;i<3;i++)f.expense("이전 기간 "+i);
        var page=f.web.bookkeepingAllPeriods("EXPENSE",null,1,0,false,null,"uncategorized",null,null,"ALL",null,null);
        assertThat(page.get("total")).isEqualTo(3L);assertThat((List<?>)page.get("items")).hasSize(1);
        var next=f.web.bookkeepingAllPeriods("EXPENSE",null,1,1,false,null,"uncategorized",null,null,"ALL",null,null);
        assertThat(next.get("total")).isEqualTo(3L);assertThat((List<?>)next.get("items")).hasSize(1);assertThat(next.get("items")).isNotEqualTo(page.get("items"));
    }
    @Test void existingRefundCanBeRepairedThroughDurableRelationshipCommand() {
        UUID expense=f.expense("원 지출");UUID r=raw();UUID refund=f.money.recordReviewTransactionId(new TransactionInput(TransactionType.REFUND,null,f.account,new BigDecimal("40"),"KRW",at,"미연결 환불",List.of(new TransactionSource(r,null,SourceRelationship.PRIMARY,Map.of()))));
        var request=new Repair(UUID.randomUUID(),"REFUND",f.money.transaction(refund).version(),expense,f.money.transaction(expense).version(),null,null,null,null,null,"원 지출 확인");
        assertThat(service.repair(refund,request)).containsEntry("status","APPLIED");assertThat(service.repair(refund,request)).containsEntry("status","APPLIED");assertThat(f.money.transaction(refund).refundOf()).isEqualTo(expense);assertThat(f.money.transaction(refund).sources()).hasSize(1);
    }
    @Test void existingTransferSuspicionCanBeDismissedOrLinkedOnMobile() {
        UUID expense=f.expense("출금");UUID other=f.money.createAccount(new AccountInput("IBK","합성 도착",AccountRole.SPENDING,null,null)).id();
        var t=f.money.transaction(expense);UUID income=f.product.save(null,new MoneyProductService.Entry(TransactionType.INCOME,null,other,t.amount(),t.occurredAt(),"입금",null,null,false,null,null,"입금")).id();
        assertThat(service.repair(expense,new Repair(UUID.randomUUID(),"UNRELATED",t.version(),income,0L,null,null,null,null,null,"별개 거래"))).containsEntry("status","APPLIED");
        assertThat(f.db.queryForObject("select count(*) from money_meaning_audit where action='TRANSFER_PAIR_DISMISSED'",Long.class)).isEqualTo(2);
        assertThat(service.repair(expense,new Repair(UUID.randomUUID(),"TRANSFER",t.version(),income,0L,null,null,null,null,null,"동일 이체"))).containsEntry("status","APPLIED");assertThat(f.money.transaction(expense).type()).isEqualTo(TransactionType.TRANSFER);assertThat(f.money.transaction(income).mergedInto()).isEqualTo(expense);
    }
    @Test void ownerOccurrenceControlsBalanceEvenWhenCaptureWasLater() {
        UUID raw=raw();f.db.update("update money_raw_notifications set posted_at=? where id=?",java.sql.Timestamp.from(at.plusSeconds(3600)),raw);
        fact(confirm(raw,input(raw,TransactionType.EXPENSE,"100","KRW",null,null,null,null)));
        var balance=(MoneyProductService.Balance)f.product.accountBalances(at.plusSeconds(1),f.account).getFirst().get("balance");
        assertThat(balance.amount()).isEqualByComparingTo("-100");
    }
}
