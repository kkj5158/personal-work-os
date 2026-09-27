package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyFinancialService.*;
import static com.kafka.backend.money.MoneyWebTypes.*;
import static org.assertj.core.api.Assertions.*;

/** Every test runs in a rollback transaction in the managed synthetic MONEY schema. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class MoneyFinancialPostgresTest extends MoneyWebPostgresTest {
    BigDecimal n(long value){return BigDecimal.valueOf(value);}
    MoneyFinancialService financial(MoneyService m,MoneyProductService p,MoneyWebService w,org.springframework.jdbc.core.JdbcTemplate db){return new MoneyFinancialService(db,()->MoneyPostgresIntegrationTest.OWNER,m,p,w,JsonMapper.builder().build());}
    PaymentInput payment(UUID loan,UUID account,long total,Long principal,Long interest,Long fee,long loanVersion,Long txVersion){return new PaymentInput(loan,account,n(total),principal==null?null:n(principal),interest==null?null:n(interest),fee==null?null:n(fee),at,"Synthetic repayment",txVersion,loanVersion);}
    @Test void openingAndAdjustmentAreAuditableAsOfAnchorsNotBehavior()throws Exception{rollback((m,p,w,db)->{
        var a=account(m,AccountRole.SPENDING);var f=financial(m,p,w,db);
        var opening=f.balance(a.id(),new BalanceInput(TransactionType.INITIAL_BALANCE,n(1000),at.minusSeconds(10),"Synthetic opening",0L,null));
        p.save(null,entry(TransactionType.EXPENSE,a.id(),null,100,"Synthetic purchase",null,null));
        assertThat(f.calculated(a.id(),at.minusSeconds(11)).amount()).isZero();
        assertThat(f.calculated(a.id(),at).amount()).isEqualByComparingTo("900");
        var adjustment=f.balance(a.id(),new BalanceInput(TransactionType.BALANCE_ADJUSTMENT,n(850),at.plusSeconds(1),"Verified synthetic statement",1L,n(900)));
        assertThat(adjustment.amount()).isEqualByComparingTo("-50");
        assertThat((BigDecimal)f.detail(adjustment.id()).get("calculatedBalance")).isEqualByComparingTo("900");
        assertThat(p.balance(a.id()).amount()).isEqualByComparingTo("850");
        var history=p.accountDetail(a.id(),"2026-09");
        assertThat(history.inflow()).isZero();assertThat(history.outflow()).isEqualByComparingTo("100");
        assertThat(history.transactions()).hasSize(3).allSatisfy(t->assertThat(t.fromAccountId()==null?t.toAccountId():t.fromAccountId()).isEqualTo(a.id()));
        var k=(Map<?,?>)w.overview("2026-09-01","2026-09-30").get("kpis");
        assertThat((BigDecimal)k.get("income")).isZero();assertThat((BigDecimal)k.get("consumption")).isEqualByComparingTo("100");assertThat((BigDecimal)k.get("savings")).isZero();assertThat((BigDecimal)k.get("assets")).isEqualByComparingTo("850");
        assertThat(p.transactions(null,null,a.id(),null,TransactionType.BALANCE_ADJUSTMENT,null,false,50,0).items()).extracting(MoneyTransaction::id).containsExactly(adjustment.id());
        assertThatThrownBy(()->p.save(opening.id(),entry(TransactionType.INCOME,null,a.id(),100,null,null,0L))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->f.balance(a.id(),new BalanceInput(TransactionType.INITIAL_BALANCE,n(1),at,"Duplicate",2L,null))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->f.balance(a.id(),new BalanceInput(TransactionType.BALANCE_ADJUSTMENT,n(1),at.plusSeconds(2),"Stale",2L,n(900)))).isInstanceOf(OptimisticLockConflictException.class);
    });}
    @Test void aggregatesPreserveExactDecimalFacts()throws Exception{rollback((m,p,w,db)->{
        var a=account(m,AccountRole.INCOME_HUB);
        var fact=p.save(null,entry(TransactionType.INCOME,null,a.id(),1,null,null,null));
        var exact=new BigDecimal("9999999999999999.99");
        db.update("update money_transactions set amount=? where id=?",exact,fact.id());
        var overview=w.overview("2026-09-01","2026-09-30");
        assertThat((BigDecimal)((Map<?,?>)overview.get("kpis")).get("income")).isEqualByComparingTo(exact);
        assertThat((BigDecimal)((List<Map<String,Object>>)overview.get("trend")).getFirst().get("income")).isEqualByComparingTo(exact);
        var relation=((List<Map<String,Object>>)overview.get("relationships")).getFirst();
        assertThat((BigDecimal)relation.get("net")).isEqualByComparingTo(exact);
        var detail=w.flowDetail("2026-09-01","2026-09-30","INCOME",50,0);
        assertThat((BigDecimal)((Map<?,?>)detail.get("summary")).get("net")).isEqualByComparingTo(exact);
    });}
    @Test void confirmedSplitReducesOnlyPrincipalAndUnknownSplitStaysUnknown()throws Exception{rollback((m,p,w,db)->{
        var a=account(m,AccountRole.SPENDING);var f=financial(m,p,w,db);var loan=w.saveLoan(null,loanInput(a.id(),0,"ACTIVE",700));
        var known=f.payment(null,payment(loan.id(),a.id(),120,100L,15L,5L,1,null));
        var unresolved=f.payment(null,payment(loan.id(),a.id(),80,null,null,null,2,null));
        assertThat(w.loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("600");
        assertThat(f.detail(unresolved.id()).get("principal")).isNull();
        var k=(Map<?,?>)w.overview("2026-09-01","2026-09-30").get("kpis");
        assertThat((BigDecimal)k.get("consumption")).isEqualByComparingTo("20");assertThat((BigDecimal)k.get("savings")).isZero();assertThat((BigDecimal)k.get("loans")).isEqualByComparingTo("600");assertThat((BigDecimal)k.get("loanPrincipal")).isEqualByComparingTo("100");assertThat((BigDecimal)k.get("unresolvedLoanPayments")).isEqualByComparingTo("80");
        assertThat(p.balance(a.id()).amount()).isEqualByComparingTo("-200");
        assertThat((BigDecimal)((Map<?,?>)w.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("summary")).get("total")).isEqualByComparingTo("20");
        assertThat(f.history(loan.id())).hasSize(2).anySatisfy(row->{assertThat(row.get("id")).isEqualTo(unresolved.id());assertThat(row.get("unresolved")).isEqualTo(true);});
        f.payment(unresolved.id(),payment(loan.id(),a.id(),80,70L,10L,0L,3,0L));
        assertThat(w.loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("530");
        assertThat(p.corrections(unresolved.id())).hasSize(1);
        assertThatThrownBy(()->f.payment(null,payment(loan.id(),a.id(),100,90L,null,0L,4,null))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->f.payment(null,payment(loan.id(),a.id(),1000,1000L,0L,0L,4,null))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->w.saveLoan(loan.id(),loanInput(a.id(),4,"ACTIVE",999))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->w.deleteLoan(loan.id(),4L)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->p.save(known.id(),entry(TransactionType.EXPENSE,a.id(),null,120,null,null,0L))).isInstanceOf(InvalidRequestException.class);
    });}
    @Test void poolRelationsReconcileWithEvidenceAndRepeatedHopsDoNotInflateSavings()throws Exception{rollback((m,p,w,db)->{
        var hub=account(m,AccountRole.INCOME_HUB);var spend=account(m,AccountRole.SPENDING);var gate=account(m,AccountRole.SAVINGS_GATEWAY);var save=account(m,AccountRole.SAVINGS);
        p.save(null,entry(TransactionType.INCOME,null,hub.id(),1000,null,null,null));
        p.save(null,entry(TransactionType.TRANSFER,hub.id(),spend.id(),200,null,null,null));
        p.save(null,entry(TransactionType.TRANSFER,hub.id(),gate.id(),500,null,null,null));
        p.save(null,entry(TransactionType.TRANSFER,gate.id(),save.id(),500,null,null,null));
        p.save(null,entry(TransactionType.TRANSFER,save.id(),spend.id(),600,null,null,null));
        var expense=p.save(null,entry(TransactionType.EXPENSE,spend.id(),null,100,null,null,null));
        p.save(null,new MoneyProductService.Entry(TransactionType.REFUND,null,spend.id(),n(40),at.plusSeconds(1),null,null,null,false,expense.id(),null));
        var overview=w.overview("2026-09-01","2026-09-30");var k=(Map<?,?>)overview.get("kpis");
        assertThat((BigDecimal)k.get("income")).isEqualByComparingTo("1000");assertThat((BigDecimal)k.get("consumption")).isEqualByComparingTo("60");assertThat((BigDecimal)k.get("savings")).isEqualByComparingTo("-100");
        for(var pair:Map.of("INCOME","income","CONSUMPTION","consumption","SAVINGS","savings").entrySet()){
            var detail=w.flowDetail("2026-09-01","2026-09-30",pair.getKey(),200,0);var summary=(Map<?,?>)detail.get("summary");
            assertThat((BigDecimal)summary.get("net")).isEqualByComparingTo((BigDecimal)k.get(pair.getValue()));
            var rows=(List<Map<String,Object>>)detail.get("items");
            assertThat(rows.stream().map(r->(BigDecimal)r.get("contribution")).reduce(BigDecimal.ZERO,BigDecimal::add)).isEqualByComparingTo((BigDecimal)summary.get("net"));
        }
        assertThat(((List<?>)w.flowDetail("2026-09-01","2026-09-30","SAVINGS",200,0).get("items"))).hasSize(2);
        var trend=(List<Map<String,Object>>)overview.get("trend");assertThat(trend.stream().map(r->(BigDecimal)r.get("savings")).reduce(BigDecimal.ZERO,BigDecimal::add)).isEqualByComparingTo("-100");
    });}
    @Test void ownerIsolationAndLifecycleRemainIndependentOfOwnedAssets()throws Exception{rollback((m,p,w,db)->{
        var a=account(m,AccountRole.SPENDING);var f=financial(m,p,w,db);var loan=w.saveLoan(null,loanInput(a.id(),0,"ACTIVE",700));
        var tx=f.payment(null,payment(loan.id(),a.id(),100,100L,0L,0L,1,null));
        var otherId=UUID.randomUUID();var otherM=MoneyPostgresIntegrationTest.service(db,otherId);var mapper=JsonMapper.builder().build();var otherP=new MoneyProductService(db,()->otherId,otherM,mapper);var otherW=new MoneyWebService(db,()->otherId,otherM,otherP,mapper);var otherF=new MoneyFinancialService(db,()->otherId,otherM,otherP,otherW,mapper);
        assertThatThrownBy(()->otherF.detail(tx.id())).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->otherF.history(loan.id())).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->otherF.calculated(a.id(),at)).isInstanceOf(ResourceNotFoundException.class);
        assertThat(otherW.flowDetail("2026-09-01","2026-09-30","LOAN_PRINCIPAL",50,0).get("items")).isEqualTo(List.of());
        w.saveLoan(loan.id(),loanInput(a.id(),2,"PAUSED",600));
        var k=(Map<?,?>)w.overview("2026-09-01","2026-09-30").get("kpis");assertThat((BigDecimal)k.get("loans")).isZero();assertThat((BigDecimal)k.get("assets")).isEqualByComparingTo("-100");
    });}
    @Test void multiFiltersAndPairEvidenceRetainFullDatasetAndOwnerScope()throws Exception{rollback((m,p,w,db)->{
        var a=account(m,AccountRole.INCOME_HUB);var b=account(m,AccountRole.SAVINGS);var c=account(m,AccountRole.SPENDING);
        var t=p.save(null,entry(TransactionType.TRANSFER,a.id(),b.id(),50,null,null,null));
        p.save(null,entry(TransactionType.TRANSFER,b.id(),c.id(),20,null,null,null));
        assertThat(p.transactions(null,null,null,null,null,null,false,50,0,false,"none",null,null,null).total()).isZero();
        assertThat(p.transactions(null,null,null,null,null,null,false,50,0,false,a.id().toString(),"uncategorized","TRANSFER",null).items()).extracting(MoneyTransaction::id).containsExactly(t.id());
        var detail=w.flowDetail("2026-09-01","2026-09-30","SAVINGS",50,0,a.id()+":"+b.id());
        assertThat((List<?>)detail.get("items")).hasSize(1);assertThat(detail.get("total")).isEqualTo(1L);
        assertThat((BigDecimal)((Map<?,?>)detail.get("summary")).get("net")).isEqualByComparingTo("30");
        assertThat(p.transactions("2026-09-01","2026-09-30",null,null,null,null,false,50,0,false,null,null,null,"SAVINGS").total()).isEqualTo(2);
    });}
    @Test void expenseConfirmationPreservesRawEvidenceAndRejectsDuplicateCorrection()throws Exception{rollback((m,p,w,db)->{
        var a=account(m,AccountRole.SPENDING);var loan=w.saveLoan(null,loanInput(a.id(),0,"ACTIVE",700));var f=financial(m,p,w,db);
        var raw=m.ingest(Map.of("postedAt",at.toString(),"text","Synthetic repayment evidence")).notification();
        m.finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"SYNTHETIC");raw=m.notification(raw.id());
        var tx=p.reviewPost(new MoneyProductService.ReviewPost(entry(TransactionType.EXPENSE,a.id(),null,100,"Synthetic payment",null,null),List.of(raw.id()),List.of(raw.processingVersion())));
        var converted=f.payment(tx.id(),payment(loan.id(),a.id(),100,90L,10L,0L,1,tx.version()));
        assertThat(converted.id()).isEqualTo(tx.id());assertThat(converted.sources()).isEqualTo(tx.sources());
        assertThat(m.notification(raw.id()).rawPayload()).isEqualTo(raw.rawPayload());
        assertThat(p.corrections(tx.id())).hasSize(1);
        assertThatThrownBy(()->f.payment(tx.id(),payment(loan.id(),a.id(),100,90L,10L,0L,1,tx.version()))).isInstanceOf(OptimisticLockConflictException.class);
        assertThat(w.loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("610");
    });}
}
