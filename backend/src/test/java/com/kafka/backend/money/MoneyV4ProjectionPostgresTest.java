package com.kafka.backend.money;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import tools.jackson.databind.json.JsonMapper;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/.+")
class MoneyV4ProjectionPostgresTest {
    private final MoneyUnifiedBookkeepingPostgresTest fixture=new MoneyUnifiedBookkeepingPostgresTest();

    @Test void historicalPreviewIsReversibleAndApprovalBindsTheReviewedValues(){
        fixture.check(e->{
            var db=e.db();var owner=MoneyPostgresIntegrationTest.OWNER;var mapper=JsonMapper.builder().build();
            var meaning=new MoneyMeaningService(db,()->owner,mapper);
            var history=new MoneyTrackingHistoryService(db,()->owner,meaning,new MoneyV4ReadService(new NamedParameterJdbcTemplate(db),()->owner),
                new MoneyStatisticalAccountService(db,()->owner,e.product(),meaning),
                new MoneyCommandService(db,mapper,new org.springframework.jdbc.datasource.DataSourceTransactionManager(db.getDataSource())));
            var account=fixture.account(e,AccountRole.SPENDING);
            var day=LocalDate.parse("2026-09-26");var prior=Timestamp.from(MoneyUnifiedBookkeepingPostgresTest.AT.minusSeconds(86400));
            db.update("update money_accounts set created_at=? where id=?",prior,account.id());
            db.update("update money_statistical_membership_history set effective_at=? where user_id=? and account_id=?",prior,owner,account.id());
            fixture.tx(e,account.id(),true,90,false);
            var change=new MoneyTrackingHistoryService.Change(account.id(),"EXPENSE",true,day,day,0L,java.time.Instant.now());
            var reviewed=history.preview(change);
            assertThat(((Number)meaning.tracking().get("version")).longValue()).isZero();
            var before=(MoneyTrackingHistoryService.MonthImpact)((List<?>)reviewed.get("before")).getFirst();
            var after=(MoneyTrackingHistoryService.MonthImpact)((List<?>)reviewed.get("after")).getFirst();
            assertThat(before.flows().consumption()).isEqualByComparingTo("0");
            assertThat(after.flows().consumption()).isEqualByComparingTo("90");
            fixture.tx(e,account.id(),true,10,false);
            assertThat(history.preview(change).get("fingerprint")).isNotEqualTo(reviewed.get("fingerprint"));
            var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(db.getDataSource()));
            tx.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_NESTED);
            assertThatThrownBy(()->tx.execute(status->history.apply(new MoneyTrackingHistoryService.Approval(change,(String)reviewed.get("fingerprint")))))
                .isInstanceOf(com.kafka.backend.common.OptimisticLockConflictException.class);
            var latest=history.preview(change);
            assertThat(history.apply(new MoneyTrackingHistoryService.Approval(change,(String)latest.get("fingerprint"))).get("applied")).isEqualTo(true);
            assertThat(meaning.tracking().get("expense")).isEqualTo(List.of());
        });
    }

    @Test void crossMonthRefundsUseOriginalSelectionAndLegacyWritesRetainStock(){
        fixture.check(e->{
            var owner=MoneyPostgresIntegrationTest.OWNER;
            var db=e.db();var tracking=new MoneyMeaningService(db,()->owner,JsonMapper.builder().build());
            var payer=fixture.account(e,AccountRole.SPENDING);var receiver=fixture.account(e,AccountRole.SPENDING);
            var savings=fixture.account(e,AccountRole.SAVINGS);
            db.update("update money_accounts set fund_group='SAVINGS',savings_subtype='SAVINGS_ACCOUNT' where id=?",savings.id());
            var expense=new ArrayList<UUID>();expense.add(payer.id());
            for(int n=0;n<5;n++)expense.add(fixture.account(e,AccountRole.SPENDING).id());
            long version=((Number)tracking.tracking().get("version")).longValue();
            tracking.saveTracking(new MoneyMeaningService.TrackingInput(expense,List.of(receiver.id()),version,List.of(savings.id()),List.of()));
            var october=java.time.Instant.parse("2026-10-15T04:00:00Z");
            db.update("update money_tracking_selections set effective_at=? where user_id=? and version=?",Timestamp.from(october.minusSeconds(1)),owner,version+1);
            var latest=tracking.saveTracking(new MoneyMeaningService.TrackingInput(List.of(),List.of(receiver.id()),version+1));
            assertThat(latest.get("savings")).isEqualTo(List.of(savings.id()));
            assertThatThrownBy(()->tracking.saveTracking(new MoneyMeaningService.TrackingInput(List.of(),List.of(),version+1)))
                .isInstanceOf(com.kafka.backend.common.OptimisticLockConflictException.class);
            var purchase=e.product().save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,payer.id(),null,new BigDecimal("100000"),october,"합성 구매",null,null,false,null,null));
            var nov5=java.time.Instant.parse("2026-11-05T02:00:00Z");var nov22=java.time.Instant.parse("2026-11-22T01:00:00Z");
            var partial=e.product().save(null,new MoneyProductService.Entry(TransactionType.REFUND,null,receiver.id(),new BigDecimal("30000"),nov5,null,null,null,false,purchase.id(),null));
            e.product().save(null,new MoneyProductService.Entry(TransactionType.REFUND,null,receiver.id(),new BigDecimal("20000"),nov22,null,null,null,false,purchase.id(),null));
            var pending=e.product().save(null,new MoneyProductService.Entry(TransactionType.REFUND,null,receiver.id(),new BigDecimal("40000"),nov22,null,null,null,false,null,null));
            var reads=new MoneyV4ReadService(new NamedParameterJdbcTemplate(db),()->owner);
            var from=LocalDate.parse("2026-11-01");var to=LocalDate.parse("2026-11-30");
            assertThat(reads.summary(from.minusMonths(1),from.minusDays(1),"KRW",null).consumption()).isEqualByComparingTo("100000");
            var metrics=reads.summary(from,to,"KRW",payer.id().toString());
            assertThat(metrics.consumption()).isEqualByComparingTo("-50000");
            assertThat(metrics.totalExpense()).isEqualByComparingTo("-50000");
            assertThat(reads.summary(from,to,"KRW",receiver.id().toString()).consumption()).isEqualByComparingTo("0");
            assertThat(reads.summary(from,to,"KRW",null).actualIncome()).isEqualByComparingTo("0");
            assertThat(e.money().transaction(partial.id()).amount()).isEqualByComparingTo("30000");
            e.product().save(pending.id(),new MoneyProductService.Entry(TransactionType.REFUND,null,receiver.id(),pending.amount(),nov22,null,null,null,false,purchase.id(),pending.version()));
            assertThat(reads.summary(from,to,"KRW",null).consumption()).isEqualByComparingTo("-90000");
            assertThatThrownBy(()->e.product().save(null,new MoneyProductService.Entry(TransactionType.REFUND,null,receiver.id(),new BigDecimal("10001"),nov22,null,null,null,false,purchase.id(),null)))
                .isInstanceOf(com.kafka.backend.common.InvalidRequestException.class);
        });
    }

    @Test void refundSupportPendingDebtAndSavingsShareTheSameScopedCashRows() {
        fixture.check(e -> {
            var day=LocalDate.parse("2026-09-26");
            var time=MoneyUnifiedBookkeepingPostgresTest.AT;
            var payer=fixture.account(e,AccountRole.SPENDING);
            var savings=fixture.account(e,AccountRole.SAVINGS);
            var inactive=fixture.account(e,AccountRole.SPENDING);
            var owner=MoneyPostgresIntegrationTest.OWNER;
            var db=e.db();
            var reads=new MoneyV4ReadService(new NamedParameterJdbcTemplate(db),()->owner);
            var cats=e.product().initializeCategories();
            var salary=cats.stream().filter(c->c.name().equals("급여")).findFirst().orElseThrow();
            var family=cats.stream().filter(c->c.name().equals("용돈")).findFirst().orElseThrow();
            db.update("insert into money_v4_income_categories values(?,?,'FAMILY_SUPPORT')",owner,family.id());
            new MoneyMeaningService(db,()->owner,JsonMapper.builder().build())
                .saveTracking(new MoneyMeaningService.TrackingInput(List.of(payer.id()),List.of(payer.id()),0L));
            db.update("update money_tracking_selections set effective_at=? where user_id=?",Timestamp.from(time.minusSeconds(86400)),owner);
            var earned=fixture.tx(e,payer.id(),false,1000,false);
            var support=fixture.tx(e,payer.id(),false,300,false);
            var misc=fixture.tx(e,payer.id(),false,125,false);
            var other=fixture.tx(e,inactive.id(),false,250,false);
            db.update("update money_transactions set category_id=? where id in (?,?)",salary.id(),earned.id(),other.id());
            db.update("update money_transactions set category_id=? where id=?",family.id(),support.id());
            var purchase=fixture.tx(e,payer.id(),true,150,false);
            var refundId=UUID.randomUUID();
            db.update("insert into money_transactions(id,user_id,type,to_account_id,amount,occurred_at,refund_of) values(?,?,'REFUND',?,50,?,?)",
               refundId,owner,payer.id(),Timestamp.from(time),purchase.id());
            var repayment=fixture.tx(e,payer.id(),true,40,true);
            new MoneyOwnerFinancialDecision(db,owner).save(repayment.id(),UUID.randomUUID(),"LOAN_PAYMENT","LOAN_SPLIT_PENDING");
            for(var account:List.of(payer,savings)){
                db.update("insert into money_account_fund_group_history(user_id,account_id,fund_group,savings_subtype,effective_at,account_version) values(?,?,?,?,?,0)",
                    owner,account.id(),account==savings?"SAVINGS":"LIVING",account==savings?"SAVINGS_ACCOUNT":null,Timestamp.from(time.minusSeconds(86400)));
            }
            for(boolean deposit:List.of(true,false)){
                var from=deposit?payer:savings;
                var to=deposit?savings:payer;
                e.product().save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,from.id(),to.id(),new BigDecimal(deposit?"200":"90"),time,null,null,null,false,null,null));
            }
            var refund=e.web().v4Book(refundId,true);
            assertThat(refund.get("type")).isEqualTo("INCOME");
            assertThat(refund.get("financialType")).isEqualTo("REFUND");
            assertThat(e.web().bookkeepingRow(refundId).get("type")).isEqualTo("REFUND");
            assertThat(reads.savingsBalance("KRW").recordedBalance()).isNull();
            var before=db.queryForList("select id,version,type,amount,from_account_id,to_account_id,refund_of,principal from money_transactions where user_id=? order by id",owner);
            var metrics=reads.summary(day,day,"KRW",null);
            assertThat(metrics.actualIncome()).isEqualByComparingTo("1000");
            assertThat(metrics.consumption()).isEqualByComparingTo("100");
            assertThat(metrics.totalExpense()).isEqualByComparingTo("140");
            assertThat(metrics.loanRepayment()).isEqualByComparingTo("40");
            assertThat(metrics.unqualifiedIncomeCount()).isEqualTo(1);
            assertThat(metrics.savingsIn()).isEqualByComparingTo("200");
            assertThat(metrics.savingsOut()).isEqualByComparingTo("90");
            assertThat(metrics.savingsNet()).isEqualByComparingTo("110");
            assertThat(metrics.savingsMovement()).isEqualByComparingTo("290");
            assertThat(reads.summary(day,day,"USD",null).actualIncome()).isEqualByComparingTo("0");
            assertThat(reads.summary(day,day,"KRW",inactive.id().toString()).actualIncome()).isEqualByComparingTo("0");
            assertThat(reads.chartPreference()).isEqualTo(new MoneyV4ReadService.ChartPreference(false,0));
            var hidden = reads.incomeComposition(day,day,"KRW",null);
            assertThat(hidden.chartIncome()).isEqualByComparingTo("1000");
            assertThat(hidden.familySupport()).isEqualByComparingTo("300");
            assertThat(hidden.composition()).extracting(MoneyV4ReadService.Slice::bucket).containsExactly("I");
            var update = new MoneyV4ReadService.ChartPreferenceChange(true,0L);
            assertThat(reads.updateChartPreference(update)).isEqualTo(new MoneyV4ReadService.ChartPreference(true,1));
            assertThat(reads.updateChartPreference(update).version()).isEqualTo(1);
            var visible = reads.incomeComposition(day,day,"KRW",payer.id().toString());
            assertThat(visible.chartIncome()).isEqualByComparingTo("1300");
            assertThat(visible.actualIncome()).isEqualByComparingTo("1000");
            assertThat(reads.summary(day,day,"KRW",null)).isEqualTo(metrics);
            var familyItems = reads.items(day,day,"KRW","FAMILY_SUPPORT",null,"direct:"+family.id(),null,null,10,0);
            assertThat(familyItems.total()).isEqualTo(1);
            assertThat(familyItems.items().getFirst().get("id")).isEqualTo(support.id());
            assertThatThrownBy(()->reads.updateChartPreference(new MoneyV4ReadService.ChartPreferenceChange(false,0L)))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(reads.updateChartPreference(new MoneyV4ReadService.ChartPreferenceChange(false,1L)).version()).isEqualTo(2);
            for(var bucket:List.of("I","E","L","SI","SO")){
                var page=reads.items(day,day,"KRW",bucket,null,null,null,null,10,0);
                if(bucket.equals("E")){assertThat(page.total()).isEqualTo(2);assertThat(page.filteredAmount()).isEqualByComparingTo("100");continue;}
                assertThat(page.total()).isEqualTo(1);
                assertThat((BigDecimal)page.items().getFirst().get("amount")).isEqualByComparingTo(page.filteredAmount());
            }
            var entry=e.web().bookkeepingRow(earned.id());
            e.web().saveBookkeeping(earned.id(),new MoneyWebTypes.BookkeepingEdit(
                ((Number)entry.get("version")).longValue(),earned.version(),Map.of("amount",99,"occurredAt","2026-10-12T00:00:00Z"),0L));
            var book=e.web().bookkeeping(day.toString(),day.toString(),"INCOME",null,50,0,false,null,null,null,null,"ALL",null,"KRW",false,true,true);
            assertThat(((List<?>)book.get("items"))).hasSize(1);
            assertThat((BigDecimal)((Map<?,?>)book.get("summary")).get("total")).isEqualByComparingTo("1000");
            assertThat(db.queryForList("select id,version,type,amount,from_account_id,to_account_id,refund_of,principal from money_transactions where user_id=? order by id",owner)).isEqualTo(before);
        });
    }
}
