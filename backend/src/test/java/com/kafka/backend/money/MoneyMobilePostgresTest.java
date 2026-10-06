package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyMobileService.*;
import static org.assertj.core.api.Assertions.*;

/** V65 on an isolated synthetic schema inside a rolled-back transaction; shared DEV rows are never touched. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class MoneyMobilePostgresTest {
    interface Scenario {void run(JdbcTemplate db,MoneyService m,MoneyProductService p,MoneyWebService w,MoneyMobileService mobile) throws Exception;}
    static final List<String> MONEY_MIGRATIONS=List.of("V50__money_core_ledger.sql","V54__money_processing_schedule.sql","V55__money_v1_product.sql",
        "V56__money_bridge_credentials.sql","V58__money_web_v1_1.sql","V59__money_financial_core.sql","V60__money_bookkeeping_review_rules.sql",
        "V62__money_category_hierarchy.sql","V65__money_mobile_funds.sql","V69__money_ai_personalization.sql","V71__money_web_revision.sql","V73__money_integrated_revision.sql");
    final Instant at=Instant.parse("2026-09-15T01:00:00Z");
    void isolated(Scenario scenario)throws Exception{
        try(var c=MoneyPostgresIntegrationTest.connection()){c.setAutoCommit(false);try{
            var db=new JdbcTemplate(new SingleConnectionDataSource(c,true));
            String schema="qa_mobile_"+Integer.toUnsignedString(c.hashCode());
            db.execute("set local statement_timeout='30s'");
            db.execute("create schema "+schema);db.execute("set local search_path="+schema+",public");
            for(String name:MONEY_MIGRATIONS)db.execute(Files.readString(Path.of("src/main/resources/db/migration",name)));
            var owner=MoneyPostgresIntegrationTest.OWNER;
            var m=MoneyPostgresIntegrationTest.service(db,owner);
            var p=new MoneyProductService(db,()->owner,m,JsonMapper.builder().build());
            var w=new MoneyWebService(db,()->owner,m,p,JsonMapper.builder().build());
            scenario.run(db,m,p,w,new MoneyMobileService(db,()->owner,m,p));
        }finally{c.rollback();}}
    }
    MoneyAccount account(MoneyService m,AccountRole role){return m.createAccount(new AccountInput(role==AccountRole.CASH?"CASH":"IBK","Synthetic "+role+" "+UUID.randomUUID(),role,null,null));}
    MoneyProductService.Entry transfer(UUID from,UUID to,int amount,Instant when){return new MoneyProductService.Entry(TransactionType.TRANSFER,from,to,BigDecimal.valueOf(amount),when,null,null,null,false,null,null,"Synthetic transfer");}
    BigDecimal savings(MoneyWebService w){return (BigDecimal)((Map<?,?>)w.overview("2026-09-01","2026-09-30").get("kpis")).get("savings");}

    @Test void existingInsertPathsDeriveFundGroupFromRoleWithoutChangingOtherAxes()throws Exception{isolated((db,m,p,w,mobile)->{
        var spend=account(m,AccountRole.SPENDING);var hub=account(m,AccountRole.INCOME_HUB);
        var save=account(m,AccountRole.SAVINGS);var installment=account(m,AccountRole.PURPOSE_INSTALLMENT);var cash=account(m,AccountRole.CASH);
        var funds=mobile.funds();
        assertThat(funds.get(spend.id())).isEqualTo(new Fund("LIVING",null,0));
        assertThat(funds.get(hub.id()).fundGroup()).isEqualTo("OTHER");
        assertThat(funds.get(cash.id()).fundGroup()).isEqualTo("OTHER");
        assertThat(funds.get(save.id())).extracting(Fund::fundGroup,Fund::savingsSubtype).containsExactly("SAVINGS","SAVINGS_ACCOUNT");
        assertThat(funds.get(installment.id()).savingsSubtype()).isEqualTo("INSTALLMENT");
        // Mobile-created accounts default to 기타 regardless of role (105 §15).
        var created=mobile.create(new CreateInput(new AccountInput("KAKAO","Synthetic new",AccountRole.SAVINGS,null,"0001"),null,null));
        assertThat(created.fund().fundGroup()).isEqualTo("OTHER");
        assertThat(created.account().role()).isEqualTo(AccountRole.SAVINGS);
        assertThatThrownBy(()->mobile.create(new CreateInput(new AccountInput("KAKAO","Synthetic bad",AccountRole.SAVINGS,null,null),"SAVINGS",null)))
            .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->db.update("update money_accounts set savings_subtype='INSTALLMENT' where id=?",spend.id()))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    });}

    @Test void fundChangeIsVersionedAndLeavesRoleAndTrackingUntouched()throws Exception{isolated((db,m,p,w,mobile)->{
        var a=account(m,AccountRole.SPENDING);
        var meaning=new MoneyMeaningService(db,()->MoneyPostgresIntegrationTest.OWNER,JsonMapper.builder().build());
        meaning.saveTracking(new MoneyMeaningService.TrackingInput(List.of(a.id()),List.of(),0L));
        assertThatThrownBy(()->mobile.saveFund(a.id(),new FundInput("SAVINGS",null,a.version()))).isInstanceOf(InvalidRequestException.class);
        var moved=mobile.saveFund(a.id(),new FundInput("SAVINGS","INSTALLMENT",a.version()));
        assertThat(moved.fund()).extracting(Fund::fundGroup,Fund::savingsSubtype).containsExactly("SAVINGS","INSTALLMENT");
        assertThat(moved.account().version()).isEqualTo(a.version()+1);
        assertThat(moved.account().role()).isEqualTo(AccountRole.SPENDING);
        assertThat(meaning.tracking().toString()).contains(a.id().toString());
        assertThatThrownBy(()->mobile.saveFund(a.id(),new FundInput("OTHER",null,a.version()))).isInstanceOf(OptimisticLockConflictException.class);
        var back=mobile.saveFund(a.id(),new FundInput("OTHER","INSTALLMENT",moved.account().version()));
        assertThat(back.fund().savingsSubtype()).isNull(); // subtype only exists inside 저축·적금
        assertThatThrownBy(()->mobile.saveFund(a.id(),new FundInput("LOANS",null,back.account().version()))).isInstanceOf(InvalidRequestException.class);
        var outsider=new MoneyMobileService(db,UUID::randomUUID,m,p);
        assertThatThrownBy(()->outsider.saveFund(a.id(),new FundInput("OTHER",null,back.account().version()))).isInstanceOf(RuntimeException.class);
    });}

    @Test void netSavingsFollowsFundGroupBoundaryAndInternalHopsAreZero()throws Exception{isolated((db,m,p,w,mobile)->{
        var hub=account(m,AccountRole.INCOME_HUB);var box=account(m,AccountRole.SPENDING);var s1=account(m,AccountRole.SAVINGS);var s2=account(m,AccountRole.PURPOSE_INSTALLMENT);
        p.save(null,transfer(hub.id(),box.id(),500,at));
        assertThat(savings(w)).isZero(); // role SPENDING → 생활비 area, not savings
        mobile.saveFund(box.id(),new FundInput("SAVINGS","SAVINGS_ACCOUNT",box.version()));
        assertThat(savings(w)).isEqualByComparingTo("500"); // same fact, owner moved the account into 저축·적금
        p.save(null,transfer(box.id(),s1.id(),500,at.plusSeconds(60)));
        p.save(null,transfer(s1.id(),s2.id(),500,at.plusSeconds(120)));
        assertThat(savings(w)).isEqualByComparingTo("500"); // savings → savings hops never inflate
        p.save(null,transfer(s2.id(),hub.id(),200,Instant.parse("2026-09-22T01:00:00Z")));
        var trend=mobile.savingsTrend("2026-09-01","2026-09-30","month");
        assertThat(trend.inflow()).isEqualByComparingTo("500");assertThat(trend.outflow()).isEqualByComparingTo("200");assertThat(trend.net()).isEqualByComparingTo("300");
        assertThat(trend.buckets()).singleElement().satisfies(b->{assertThat(b.period()).isEqualTo("2026-09");assertThat(b.count()).isEqualTo(2);});
        var weekly=mobile.savingsTrend("2026-09-01","2026-09-30","week");
        assertThat(weekly.buckets()).hasSize(5).first().satisfies(b->assertThat(b.start()).isEqualTo(LocalDate.of(2026,9,28)));
        assertThat(weekly.buckets().stream().map(SavingsBucket::net).reduce(BigDecimal.ZERO,BigDecimal::add)).isEqualByComparingTo("300");
        assertThat(weekly.buckets().getLast().start()).isEqualTo(LocalDate.of(2026,9,1)); // clipped to the requested start
        assertThat(savings(w)).isEqualByComparingTo(trend.net());
        assertThatThrownBy(()->mobile.savingsTrend("2026-09-01","2026-09-30","day")).isInstanceOf(InvalidRequestException.class);
    });}

    @Test void fundTotalsSettingsAndOrderStayOwnerConsistent()throws Exception{isolated((db,m,p,w,mobile)->{
        var a=account(m,AccountRole.SPENDING);var b=account(m,AccountRole.SPENDING);var s=account(m,AccountRole.SAVINGS);var archived=account(m,AccountRole.SPENDING);
        p.save(null,new MoneyProductService.Entry(TransactionType.INCOME,null,a.id(),BigDecimal.valueOf(1000),at,"Synthetic payer",null,null,false,null,null,null));
        p.save(null,new MoneyProductService.Entry(TransactionType.INCOME,null,s.id(),BigDecimal.valueOf(300),at,"Synthetic payer",null,null,false,null,null,null));
        p.save(null,new MoneyProductService.Entry(TransactionType.INCOME,null,archived.id(),BigDecimal.valueOf(77),at,"Synthetic payer",null,null,false,null,null,null));
        m.archiveAccount(archived.id(),new ArchiveAccount(archived.version(),true));
        w.saveLoan(null,new MoneyWebTypes.LoanInput("Synthetic loan","Synthetic lender","PERSONAL",BigDecimal.valueOf(1000),BigDecimal.valueOf(600),null,BigDecimal.valueOf(30),25,LocalDate.of(2026,10,25),a.id(),null,null,"ACTIVE",null,null));
        var funds=mobile.overview();
        assertThat(funds.groups().get("LIVING").amount()).isEqualByComparingTo("1000");
        assertThat(funds.groups().get("LIVING").count()).isEqualTo(2); // archived account excluded
        assertThat(funds.groups().get("SAVINGS").amount()).isEqualByComparingTo("300");
        assertThat(funds.loans().amount()).isEqualByComparingTo("600");assertThat(funds.loans().nextDueDate()).isEqualTo(LocalDate.of(2026,10,25));
        assertThat(funds.settings()).isEqualTo(new Settings(true,0));
        var saved=mobile.saveSettings(new SettingsInput(false,0L));
        assertThat(saved).isEqualTo(new Settings(false,1));
        assertThatThrownBy(()->mobile.saveSettings(new SettingsInput(true,0L))).isInstanceOf(OptimisticLockConflictException.class);
        assertThatThrownBy(()->mobile.order(new OrderInput("LIVING",List.of(a.id())))).isInstanceOf(InvalidRequestException.class);
        mobile.order(new OrderInput("LIVING",List.of(b.id(),a.id())));
        var ordered=mobile.overview().accounts().stream().filter(x->x.fund().fundGroup().equals("LIVING")&&!x.account().archived()).map(x->x.account().id()).toList();
        assertThat(ordered).containsExactly(b.id(),a.id());
        assertThatThrownBy(()->mobile.saveFund(archived.id(),new FundInput("OTHER",null,mobile.fundAccount(archived.id()).account().version()))).isInstanceOf(InvalidRequestException.class);
    });}
}
