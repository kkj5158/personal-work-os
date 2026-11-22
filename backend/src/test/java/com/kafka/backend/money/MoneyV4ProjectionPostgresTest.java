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
            assertThat(metrics.consumption()).isEqualByComparingTo("150");
            assertThat(metrics.totalExpense()).isEqualByComparingTo("190");
            assertThat(metrics.loanRepayment()).isEqualByComparingTo("40");
            assertThat(metrics.unqualifiedIncomeCount()).isEqualTo(1);
            assertThat(metrics.savingsIn()).isEqualByComparingTo("200");
            assertThat(metrics.savingsOut()).isEqualByComparingTo("90");
            assertThat(metrics.savingsNet()).isEqualByComparingTo("110");
            assertThat(metrics.savingsMovement()).isEqualByComparingTo("290");
            assertThat(reads.summary(day,day,"USD",null).actualIncome()).isEqualByComparingTo("0");
            assertThat(reads.summary(day,day,"KRW",inactive.id().toString()).actualIncome()).isEqualByComparingTo("0");
            for(var bucket:List.of("I","E","L","SI","SO")){
                var page=reads.items(day,day,"KRW",bucket,null,null,null,null,10,0);
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
