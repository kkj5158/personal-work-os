package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.nio.file.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import tools.jackson.databind.json.JsonMapper;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;

/** Reuses the existing committed synthetic fixture, independent connections and owned cleanup. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class MoneyMobileCommandPostgresTest {
    UUID owner=UUID.randomUUID(),account,category;String schema;
    JdbcTemplate root,db;com.zaxxer.hikari.HikariDataSource pool;
    MoneyService money;MoneyProductService product;MoneyWebService web;MoneyCommandService commands;
    JsonMapper json=JsonMapper.builder().build();
    @BeforeEach void create() throws Exception {
        root=new JdbcTemplate(new DriverManagerDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD")));
        schema="qa_mobile_command_"+UUID.randomUUID().toString().replace("-","");
        root.execute("create schema "+schema);root.execute("comment on schema "+schema+" is 'owned-mobile-command-qa'");
        String url=System.getenv("DEV_DB_URL")+(System.getenv("DEV_DB_URL").contains("?")?"&":"?")+"currentSchema="+schema+",public";
        pool=new com.zaxxer.hikari.HikariDataSource();pool.setJdbcUrl(url);pool.setUsername(System.getenv("DEV_DB_USERNAME"));pool.setPassword(System.getenv("DEV_DB_PASSWORD"));pool.setMaximumPoolSize(2);pool.setMinimumIdle(0);pool.setPoolName(schema);db=new JdbcTemplate(pool);
        db.execute("create table qa_fixture_users(id uuid primary key)");db.update("insert into qa_fixture_users values(?)",owner);
        for(String migration:MoneyMobilePostgresTest.MONEY_MIGRATIONS)db.execute(Files.readString(Path.of("src/main/resources/db/migration",migration)).replace("REFERENCES auth.users","REFERENCES "+schema+".qa_fixture_users"));
        commands=new MoneyCommandService(db,json,new DataSourceTransactionManager(pool));money=new MoneyService(db,()->owner,json);product=new MoneyProductService(db,()->owner,money,json);web=new MoneyWebService(db,()->owner,money,product,json);
        account=money.createAccount(new AccountInput("IBK","합성 생활비",AccountRole.SPENDING,null,null)).id();
        db.update("insert into money_tracking_settings(user_id) values(?)",owner);db.update("insert into money_tracking_accounts(user_id,kind,slot,account_id) values(?,'EXPENSE',1,?)",owner,account);
        category=product.saveCategory(null,new MoneyProductService.CategoryInput("합성 식사","#123456",false,null,"EXPENSE",null,0)).id();
        Files.writeString(Path.of("build/mobile-command-fixtures.txt"),"CREATED "+schema+"\n",StandardOpenOption.CREATE,StandardOpenOption.APPEND);
    }
    @AfterEach void cleanup() throws Exception {
        if(schema==null)return;if(pool!=null)pool.close();
        assertThat(root.queryForObject("select obj_description(oid,'pg_namespace') from pg_namespace where nspname=?",String.class,schema)).isEqualTo("owned-mobile-command-qa");
        root.execute("drop schema "+schema+" cascade");assertThat(root.queryForObject("select count(*) from pg_namespace where nspname=?",Long.class,schema)).isZero();
        Files.writeString(Path.of("build/mobile-command-fixtures.txt"),"CLEANED "+schema+"\n",StandardOpenOption.CREATE,StandardOpenOption.APPEND);
    }
    UUID expense(String title) { return product.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,account,null,new BigDecimal("1000"),Instant.parse("2026-09-15T01:00:00Z"),"합성 카페",null,"합성 메모",false,null,null,title)).id(); }
    MoneyReviewService review() { return new MoneyReviewService(db,()->owner,web,product,new MoneyMeaningService(db,()->owner,json),json); }
    MoneyAiService ai() { return new MoneyAiService(db,()->owner,json,review(),web,product,money,new MoneyMeaningService(db,()->owner,json)); }
    MoneyMobileCommandService mobile() { return new MoneyMobileCommandService(()->owner,commands,product,web,ai()); }
    MoneyProductService.Entry entry(TransactionType type,UUID from,UUID to) {
        return new MoneyProductService.Entry(type,from,to,new BigDecimal("1250.25"),Instant.parse("2026-10-11T00:00:00Z"),
            type==TransactionType.TRANSFER?null:"합성 입력",null,"합성 메모",false,null,null,"합성 모바일 입력");
    }
    @Test void exactReplayCreatesOneFactAndIndependentInclusionDoesNotAlterFinancialFact() {
        UUID request=UUID.randomUUID(); var input=new MoneyMobileCommandService.QuickEntry(request,entry(TransactionType.EXPENSE,account,null),false);
        var first=mobile().create(input); assertThat(first).containsEntry("status","APPLIED");
        assertThat(mobile().create(input)).isEqualTo(first); assertThat(mobile().outcome(request)).isEqualTo(first);
        assertThat(db.queryForObject("select count(*) from money_transactions",Long.class)).isEqualTo(1L);
        UUID id=UUID.fromString(((Map<?,?>)first.get("result")).get("transactionId").toString());
        assertThat(web.bookkeepingRow(id)).containsEntry("excluded",true);
        assertThat(money.transaction(id).excluded()).isFalse(); assertThat(money.transaction(id).amount()).isEqualByComparingTo("1250.25");
        var fact=money.transaction(id);
        assertThatThrownBy(()->mobile().create(new MoneyMobileCommandService.QuickEntry(request,entry(TransactionType.INCOME,null,account),true))).isInstanceOf(RuntimeException.class);
        assertThat(money.transaction(id)).isEqualTo(fact);
    }
    @Test void invalidTransferIsDurablyNotAppliedAndOwnerCannotReadOrReplayAnotherOutcome() {
        UUID request=UUID.randomUUID();var input=new MoneyMobileCommandService.QuickEntry(request,entry(TransactionType.TRANSFER,account,account),true);
        assertThat(mobile().create(input)).containsEntry("status","NOT_APPLIED"); assertThat(db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();
        UUID other=UUID.randomUUID();db.update("insert into qa_fixture_users values(?)",other);
        var otherMoney=new MoneyService(db,()->other,json);var otherProduct=new MoneyProductService(db,()->other,otherMoney,json);
        var otherWeb=new MoneyWebService(db,()->other,otherMoney,otherProduct,json);
        var otherMeaning=new MoneyMeaningService(db,()->other,json);
        var otherReview=new MoneyReviewService(db,()->other,otherWeb,otherProduct,otherMeaning,json);
        var outsider=new MoneyMobileCommandService(()->other,commands,otherProduct,otherWeb,new MoneyAiService(db,()->other,json,otherReview,otherWeb,otherProduct,otherMoney,otherMeaning));
        assertThat(outsider.outcome(request)).containsEntry("status","UNKNOWN");
        assertThat(outsider.create(input)).containsEntry("status","NOT_APPLIED");
        assertThat(db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();
    }
    @Test void ownedTransferIsOneMovementAndUnlinkedRefundStaysFinancialReview() {
        UUID second=money.createAccount(new AccountInput("IBK","합성 저축",AccountRole.SAVINGS,null,null)).id();
        assertThat(mobile().create(new MoneyMobileCommandService.QuickEntry(UUID.randomUUID(),entry(TransactionType.TRANSFER,account,second),true))).containsEntry("status","APPLIED");
        assertThat(db.queryForObject("select count(*) from money_transactions where type='TRANSFER'",Long.class)).isEqualTo(1);
        assertThat(mobile().create(new MoneyMobileCommandService.QuickEntry(UUID.randomUUID(),entry(TransactionType.REFUND,null,account),true))).containsEntry("status","APPLIED");
        assertThat(((List<Map<String,Object>>)review().queue(null,null,null,null,null,null,50,0).get("items"))).anyMatch(r->"REFUND_LINK_REQUIRED".equals(r.get("reason")));
    }
    @Test void meaningCommandReplaysWithoutChangingFactAndRecordsConflict() {
        UUID id=expense("합성 의미 변경");var fact=money.transaction(id);var old=web.bookkeepingRow(id);
        var input=new MoneyMobileCommandService.BookMeaning(UUID.randomUUID(),id,new MoneyWebTypes.BookkeepingEdit(0L,0L,Map.of("title","수정 제목"),0L));
        assertThat(mobile().book(input)).containsEntry("status","APPLIED");
        assertThat(mobile().book(input)).containsEntry("status","APPLIED");assertThat(money.transaction(id)).isEqualTo(fact);
        assertThat(web.bookkeepingRow(id)).containsEntry("title","수정 제목").containsEntry("version",1L);
        var stale=new MoneyMobileCommandService.BookMeaning(UUID.randomUUID(),id,new MoneyWebTypes.BookkeepingEdit(0L,0L,Map.of("title","오래된 제목"),0L));
        assertThat(mobile().book(stale)).containsEntry("status","NOT_APPLIED");
        assertThat(((Map<?,?>)mobile().outcome(stale.requestId()).get("result")).get("reason")).isEqualTo("VERSION_CONFLICT");
        assertThat(web.bookkeepingRow(id)).containsEntry("title","수정 제목");
    }
    @Test void deferredRawAndUndoAreDurableAndCategoryOnlyCannotCompleteReview() {
        UUID raw=UUID.randomUUID();db.update("insert into money_raw_notifications(id,user_id,posted_at,raw_payload,dedupe_key,content_hash,state,processing_reason) values(?,?,now(),'{}',?,?,'REVIEW_REQUIRED','UNRECOGNIZED_SHAPE')",raw,owner,raw.toString(),raw.toString());
        var decision=new MoneyAiService.Decision(raw,"RAW","DEFER",null,null,null,0L,Map.of(),null);
        var input=new MoneyMobileCommandService.ReviewDecision(UUID.randomUUID(),decision);var response=mobile().decide(input);
        assertThat(response).containsEntry("status","APPLIED");assertThat(mobile().decide(input)).isEqualTo(response);
        assertThat(ai().workbench("DEFERRED",null,null,null,50,0)).containsEntry("total",1L);
        UUID event=UUID.fromString(((Map<?,?>)response.get("result")).get("eventId").toString());
        var undo=new MoneyMobileCommandService.Undo(UUID.randomUUID(),event);assertThat(mobile().undo(undo)).containsEntry("status","APPLIED");assertThat(mobile().undo(undo)).containsEntry("status","APPLIED");
        assertThat(ai().workbench("PENDING",null,null,null,50,0)).containsEntry("total",1L);
        UUID tx=expense("분류만 미정");var confirm=new MoneyMobileCommandService.ReviewDecision(UUID.randomUUID(),new MoneyAiService.Decision(tx,"TRANSACTION","CONFIRM",0L,0L,0L,0L,Map.of("categoryId",category.toString()),null));
        assertThat(mobile().decide(confirm)).containsEntry("status","NOT_APPLIED");
        assertThat(web.bookkeepingRow(tx).get("categoryId")).isNull();
    }
}
