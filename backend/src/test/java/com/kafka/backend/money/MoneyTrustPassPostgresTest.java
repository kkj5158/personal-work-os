package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.VerifiedMoneyFixtures.*;
import static org.assertj.core.api.Assertions.*;

/** Trust-pass regressions. Synthetic data only, inside one rolled-back transaction in the isolated MONEY schema. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
@EnabledIfEnvironmentVariable(named="APP_DEV_USER_ID",matches=".+")
class MoneyTrustPassPostgresTest {
    record Ctx(UUID owner,JdbcTemplate db,MoneyService money,MoneyProductService product,MoneyWebService web,MoneyReviewService review,
               MoneyFinancialService financial,MoneyProcessingService pipeline,MoneyBatch2PostgresTest.MutableClock clock){}
    interface Check{void run(Ctx c);}
    void rollback(Check check)throws Exception{
        try(var connection=MoneyPostgresIntegrationTest.connection()){
            var ds=new SingleConnectionDataSource(connection,true);var manager=new DataSourceTransactionManager(ds);var db=new JdbcTemplate(ds);
            var json=JsonMapper.builder().build();var clock=new MoneyBatch2PostgresTest.MutableClock();
            // A rolled-back synthetic owner isolates this suite from other runs sharing the owner advisory lock.
            final UUID OWNER=UUID.randomUUID();
            var money=MoneyPostgresIntegrationTest.service(db,OWNER);var product=new MoneyProductService(db,()->OWNER,money,json);
            var web=new MoneyWebService(db,()->OWNER,money,product,json);var meaning=new MoneyMeaningService(db,()->OWNER,json);
            var ctx=new Ctx(OWNER,db,money,product,web,new MoneyReviewService(db,()->OWNER,web,product,meaning,json),
                new MoneyFinancialService(db,()->OWNER,money,product,web,json),new MoneyProcessingService(db,json,manager,clock),clock);
            new TransactionTemplate(manager).execute(status->{try{
                db.execute("set local statement_timeout='30s'");db.execute("set local lock_timeout='30s'");
                db.update("insert into auth.users(id) values(?)",OWNER);check.run(ctx);return null;
            }finally{status.setRollbackOnly();}});
        }
    }
    static Map<String,Object> capture(String pkg,String title,String text,Instant postedAt){
        var p=new LinkedHashMap<String,Object>();p.put("sourcePackage",pkg);p.put("title",title);p.put("text",text);
        p.put("postedAt",postedAt.toString());p.put("idempotencyKey",UUID.randomUUID().toString());return p;
    }
    static Instant kst(String time){return LocalDateTime.parse("2026-09-24T"+time).atZone(ZoneId.of("Asia/Seoul")).toInstant();}
    static final String IBK="com.ibk.android.ionebank";
    static String ibk(String d,String amount,String cp,String minute,String balance){return "["+d+"] "+amount+"원 "+cp+" 975-******-01-014 09/24 "+minute+" / 잔액 "+balance+"원";}
    void seed(MoneyService money){for(var a:accounts())money.createAccount(new AccountInput(a.provider(),a.displayName(),a.role(),a.maskedReference(),a.suffix()));}
    MoneyAccount named(MoneyService money,String provider,String name){return money.accounts().stream().filter(a->a.provider().equals(provider)&&a.displayName().equals(name)).findFirst().orElseThrow();}
    @SuppressWarnings("unchecked") static List<Map<String,Object>> items(Map<String,Object> queue){return (List<Map<String,Object>>)queue.get("items");}
    static Map<String,Object> item(Map<String,Object> queue,UUID id){return items(queue).stream().filter(r->id.equals(r.get("id"))).findFirst().orElse(null);}
    static BigDecimal kpi(MoneyWebService web,String key){return (BigDecimal)((Map<?,?>)web.overview("2026-09-24","2026-09-24").get("kpis")).get(key);}
    MoneyProductService.Reconciliation rec(Ctx c,UUID account){return c.product().reconciliation().stream().filter(r->r.accountId().equals(account)).findFirst().orElseThrow();}

    @Test void nonFinancialNotificationsAreIgnoredButRestorableAndUnknownFormatsLeaveTheDecisionQueue()throws Exception{rollback(c->{
        var at=Instant.parse("2026-09-24T01:00:00Z");
        var ad=c.money().ingest(capture(IBK,"(광고) 가을 특판","최대 5,000원 혜택을 확인하세요",at)).notification();
        var otp=c.money().ingest(capture(IBK,"인증번호","[IBK] 인증번호 482913 타인에게 알려주지 마세요",at.plusSeconds(1))).notification();
        var unknown=c.money().ingest(capture(IBK,"승인","[승인] 12,000원 <MERCHANT> 일시불",at.plusSeconds(2))).notification();
        c.pipeline().runOwner(c.owner());
        for(var raw:List.of(ad,otp)){var n=c.money().notification(raw.id());
            assertThat(n.state()).isEqualTo(ProcessingState.PROCESSED);assertThat(n.processingReason()).isEqualTo(MoneyProcessingService.IGNORED_NON_FINANCIAL);}
        assertThat(c.money().notification(unknown.id()).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);
        var decision=c.review().queue("DECISION",null,null,null,null,null,null,200,0);
        assertThat(items(decision)).extracting(r->r.get("id")).doesNotContain(ad.id(),otp.id(),unknown.id());
        var format=item(c.review().queue("FORMAT",null,null,null,null,null,null,200,0),unknown.id());
        assertThat(format).isNotNull();assertThat(format.get("lane")).isEqualTo("FORMAT");assertThat(format.get("noiseSuspected")).isEqualTo(false);
        assertThat(items(c.review().ignored(50,0))).extracting(r->r.get("id")).contains(ad.id(),otp.id());
        c.product().restoreNotification(ad.id(),c.money().notification(ad.id()).processingVersion());
        assertThat(c.money().notification(ad.id()).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);
        c.review().ignore(new MoneyReviewService.RawSelections(List.of(new MoneyReviewService.RawSelection(unknown.id(),c.money().notification(unknown.id()).processingVersion()))));
        assertThat(c.money().notification(unknown.id()).processingReason()).isEqualTo("USER_IGNORED_NON_FINANCIAL");
        assertThat(c.db().queryForObject("select count(*) from money_transaction_sources where user_id=? and raw_event_id in (?,?,?)",Integer.class,c.owner(),ad.id(),otp.id(),unknown.id())).isZero();
        assertThat(c.money().notification(otp.id()).text()).contains("인증번호");
    });}

    @Test void unprovenOwnedTransferSidesAreSuggestedAsOnePairAndCannotBePostedAsExpensePlusIncome()throws Exception{rollback(c->{
        seed(c.money());var gateway=named(c.money(),"KAKAO","입출금통장");var spending=named(c.money(),"IBK","생활비");
        // 40s apart and without shared counterparty evidence: automatic matching must stay conservative.
        var out=c.money().ingest(payload(side("KAKAO",Direction.OUT,10000,"17:10:00.000","입출금통장(8557)","다른표기"))).notification();
        var in=c.money().ingest(payload(side("IBK",Direction.IN,10000,"17:10:40.000",null,"<c.owner()>"))).notification();
        assertThat(c.pipeline().runOwner(c.owner())).isZero();c.clock().now=c.clock().now.plusSeconds(180);assertThat(c.pipeline().runOwner(c.owner())).isZero();
        for(var raw:List.of(out,in))assertThat(c.money().notification(raw.id()).processingReason()).isEqualTo("UNMATCHED_OR_EXTERNAL_UNPROVEN");
        var queue=c.review().queue("DECISION",null,null,null,null,null,null,200,0);
        assertThat(item(queue,out.id()).get("transferPartnerId")).isEqualTo(in.id());assertThat(item(queue,in.id()).get("transferPartnerId")).isEqualTo(out.id());
        var versions=List.of(c.money().notification(out.id()).processingVersion(),c.money().notification(in.id()).processingVersion());
        var at=c.money().notification(out.id()).postedAt();
        assertThatThrownBy(()->c.product().reviewPost(new MoneyProductService.ReviewPost(new MoneyProductService.Entry(TransactionType.EXPENSE,gateway.id(),null,new BigDecimal("10000"),at,null,null,null,false,null,null,"잘못된 분리"),List.of(out.id(),in.id()),versions)))
            .isInstanceOf(InvalidRequestException.class);
        var transfer=c.product().reviewPost(new MoneyProductService.ReviewPost(new MoneyProductService.Entry(TransactionType.TRANSFER,gateway.id(),spending.id(),new BigDecimal("10000"),at,null,null,null,false,null,null,"내 계좌 이체"),List.of(out.id(),in.id()),versions));
        assertThat(transfer.type()).isEqualTo(TransactionType.TRANSFER);assertThat(transfer.sources()).hasSize(2);
        assertThat(kpi(c.web(),"income")).isZero();assertThat(kpi(c.web(),"consumption")).isZero();
        assertThat(items(c.review().queue(null,null,null,null,null,null,null,200,0))).extracting(r->r.get("id")).doesNotContain(out.id(),in.id());
        // The confirmed sources keep their parse attempts, so bank balances remain reconciliation evidence.
        assertThat(c.db().queryForObject("select count(*) from money_transaction_sources where user_id=? and transaction_id=? and parse_attempt_id is not null",Integer.class,c.owner(),transfer.id())).isEqualTo(2);
    });}

    @Test void postedExpenseIncomePairsAreSuggestedOnlyWhenUniqueAndCanBeLinkedOrDismissed()throws Exception{rollback(c->{
        var a=c.money().createAccount(new AccountInput("IBK","Synthetic spending",AccountRole.SPENDING,null,null));
        var b=c.money().createAccount(new AccountInput("SHINHAN","Synthetic hub",AccountRole.INCOME_HUB,null,null));
        var t=Instant.parse("2026-09-24T02:00:00Z");
        java.util.function.BiFunction<Integer,Instant,MoneyTransaction> expense=(amount,at)->c.product().save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,a.id(),null,BigDecimal.valueOf(amount),at,"Synthetic",null,null,false,null,null,"Synthetic out"));
        java.util.function.BiFunction<Integer,Instant,MoneyTransaction> income=(amount,at)->c.product().save(null,new MoneyProductService.Entry(TransactionType.INCOME,null,b.id(),BigDecimal.valueOf(amount),at,"Synthetic",null,null,false,null,null,"Synthetic in"));
        var e=expense.apply(5000,t);var i=income.apply(5000,t.plusSeconds(60));
        var e2=expense.apply(7000,t.plusSeconds(3600));var i2=income.apply(7000,t.plusSeconds(3620));
        var e3=expense.apply(8000,t.plusSeconds(7200));var i3a=income.apply(8000,t.plusSeconds(7210));var i3b=income.apply(8000,t.plusSeconds(7220));
        var e4=expense.apply(9000,t.plusSeconds(10800));var i4=income.apply(9000,t.plusSeconds(10800+660));
        var queue=c.review().queue("DECISION",null,null,null,null,null,null,200,0);
        assertThat(item(queue,e.id()).get("reason")).isEqualTo("POSSIBLE_INTERNAL_TRANSFER");assertThat(item(queue,e.id()).get("transferPartnerId")).isEqualTo(i.id());
        assertThat(item(queue,i.id()).get("transferPartnerId")).isEqualTo(e.id());
        for(var ambiguous:List.of(e3,i3a,i3b,e4,i4))assertThat(item(queue,ambiguous.id()).get("reason")).as("ambiguous or outside window").isEqualTo("CATEGORY_UNCONFIRMED");
        assertThat(kpi(c.web(),"income")).isEqualByComparingTo("37000");assertThat(kpi(c.web(),"consumption")).isEqualByComparingTo("29000");
        c.product().link(e.id(),new MoneyProductService.Pair(i.id(),e.version(),i.version()));
        assertThat(kpi(c.web(),"income")).isEqualByComparingTo("32000");assertThat(kpi(c.web(),"consumption")).isEqualByComparingTo("24000");
        c.review().dismissPair(new MoneyReviewService.PairDismissal(e2.id(),i2.id()));
        queue=c.review().queue("DECISION",null,null,null,null,null,null,200,0);
        assertThat(item(queue,e.id())).isNull();assertThat(item(queue,e2.id()).get("reason")).isEqualTo("CATEGORY_UNCONFIRMED");
        assertThat(c.money().transaction(e2.id()).type()).isEqualTo(TransactionType.EXPENSE);
    });}

    @Test void reconciliationUsesPerAccountObservationTimeAndAcceptingTheBankBalanceIsAnAuditedAdjustment()throws Exception{rollback(c->{
        seed(c.money());var account=named(c.money(),"IBK","생활비");
        // Same provider minute: the ledger time of the second event precedes the first notification. Observation time must order them.
        c.money().ingest(capture(IBK,"입출금",ibk("입금","100,000","급여 회사","10:00","100,000"),kst("10:00:05")));
        c.money().ingest(capture(IBK,"입출금",ibk("출금","30,000","카드결제 가게","10:00","70,000"),kst("10:00:40")));
        c.pipeline().runOwner(c.owner());c.clock().now=c.clock().now.plusSeconds(180);assertThat(c.pipeline().runOwner(c.owner())).isEqualTo(2);
        var matched=rec(c,account.id());
        assertThat(matched.status()).isEqualTo("MATCHED");assertThat(matched.ledgerBalance()).isEqualByComparingTo("70000");assertThat(matched.basis()).isEqualTo("FIRST_NOTIFICATION");
        // The bank reports a lower balance than the ledger explains: a fact is missing.
        c.money().ingest(capture(IBK,"입출금",ibk("출금","5,000","카드결제 편의점","10:05","60,000"),kst("10:05:00")));
        int posted=c.pipeline().runOwner(c.owner());c.clock().now=c.clock().now.plusSeconds(180);posted+=c.pipeline().runOwner(c.owner());assertThat(posted).isEqualTo(1);
        var mismatch=rec(c,account.id());
        assertThat(mismatch.status()).isEqualTo("MISMATCH");assertThat(mismatch.ledgerBalance()).isEqualByComparingTo("65000");assertThat(mismatch.difference()).isEqualByComparingTo("-5000");
        assertThat(c.product().balanceIssues()).extracting(r->r.get("accountId")).contains(account.id());
        long version=c.money().account(account.id()).version();
        assertThatThrownBy(()->c.financial().acceptObserved(account.id(),new MoneyFinancialService.ReconcileInput(mismatch.observedAt(),mismatch.observedBalance(),new BigDecimal("64000"),"Stale",version)))
            .isInstanceOf(OptimisticLockConflictException.class);
        var adjustment=c.financial().acceptObserved(account.id(),new MoneyFinancialService.ReconcileInput(mismatch.observedAt(),mismatch.observedBalance(),mismatch.ledgerBalance(),"Synthetic statement check",version));
        assertThat(adjustment.type()).isEqualTo(TransactionType.BALANCE_ADJUSTMENT);assertThat(adjustment.amount()).isEqualByComparingTo("-5000");
        var detail=c.financial().detail(adjustment.id());
        assertThat((BigDecimal)detail.get("calculatedBalance")).isEqualByComparingTo("65000");assertThat((BigDecimal)detail.get("verifiedBalance")).isEqualByComparingTo("60000");
        assertThat(rec(c,account.id()).status()).isEqualTo("ANCHORED");assertThat(c.product().balance(account.id()).amount()).isEqualByComparingTo("60000");
        // Reconciliation never fabricates behaviour: the adjustment is neither income nor consumption.
        assertThat(kpi(c.web(),"income")).isEqualByComparingTo("100000");assertThat(kpi(c.web(),"consumption")).isEqualByComparingTo("35000");
        assertThatThrownBy(()->c.financial().acceptObserved(account.id(),new MoneyFinancialService.ReconcileInput(mismatch.observedAt(),mismatch.observedBalance(),mismatch.ledgerBalance(),"Again",version+1)))
            .isInstanceOf(InvalidRequestException.class);
    });}

    @Test void openingBalanceCanBeRemovedAndReplacedWithoutTouchingAccountOrHistory()throws Exception{rollback(c->{
        var a=c.money().createAccount(new AccountInput("IBK","Synthetic opening",AccountRole.SPENDING,null,null));
        var at=Instant.parse("2026-09-24T03:00:00Z");
        c.financial().balance(a.id(),new MoneyFinancialService.BalanceInput(TransactionType.INITIAL_BALANCE,new BigDecimal("1000"),at.minusSeconds(10),"Synthetic opening",0L,null));
        var spend=c.product().save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,a.id(),null,new BigDecimal("100"),at,"Synthetic",null,null,false,null,null,"Synthetic spend"));
        assertThat(c.product().balance(a.id()).amount()).isEqualByComparingTo("900");assertThat(rec(c,a.id()).hasInitialBalance()).isTrue();
        assertThatThrownBy(()->c.financial().removeOpening(a.id(),new MoneyFinancialService.OpeningRemoval(0L))).isInstanceOf(OptimisticLockConflictException.class);
        c.financial().removeOpening(a.id(),new MoneyFinancialService.OpeningRemoval(1L));
        assertThat(c.product().balance(a.id()).amount()).isEqualByComparingTo("-100");assertThat(rec(c,a.id()).hasInitialBalance()).isFalse();
        assertThat(c.money().transaction(spend.id()).excluded()).isFalse();assertThat(c.money().account(a.id()).archived()).isFalse();
        assertThat(c.db().queryForObject("select count(*) from money_meaning_audit where user_id=? and subject_id=? and action='INITIAL_BALANCE_REMOVED'",Integer.class,c.owner(),a.id())).isEqualTo(1);
        assertThatThrownBy(()->c.financial().removeOpening(a.id(),new MoneyFinancialService.OpeningRemoval(2L))).isInstanceOf(InvalidRequestException.class);
        c.financial().balance(a.id(),new MoneyFinancialService.BalanceInput(TransactionType.INITIAL_BALANCE,new BigDecimal("500"),at.minusSeconds(10),"Synthetic again",2L,null));
        c.financial().replaceOpening(a.id(),new MoneyFinancialService.BalanceInput(TransactionType.INITIAL_BALANCE,new BigDecimal("2000"),at.minusSeconds(10),"Synthetic corrected",3L,null));
        assertThat(c.product().balance(a.id()).amount()).isEqualByComparingTo("1900");
        assertThat(c.db().queryForObject("select count(*) from money_balance_checkpoints where user_id=? and account_id=?",Integer.class,c.owner(),a.id())).isEqualTo(1);
        assertThat(c.db().queryForObject("select count(*) from money_meaning_audit where user_id=? and subject_id=? and action='INITIAL_BALANCE_REPLACED'",Integer.class,c.owner(),a.id())).isEqualTo(1);
        assertThat(kpi(c.web(),"income")).isZero();assertThat(kpi(c.web(),"consumption")).isEqualByComparingTo("100");
    });}

    @Test void archivedAccountHistoryStaysEditableButCannotReceiveNewFacts()throws Exception{rollback(c->{
        var a=c.money().createAccount(new AccountInput("IBK","Synthetic closed",AccountRole.SPENDING,null,null));
        var b=c.money().createAccount(new AccountInput("IBK","Synthetic other",AccountRole.SPENDING,null,null));
        var at=Instant.parse("2026-09-24T04:00:00Z");
        var old=c.product().save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,a.id(),null,new BigDecimal("100"),at,"Synthetic",null,null,false,null,null,"Before closing"));
        c.money().archiveAccount(a.id(),new ArchiveAccount(0L,true));c.money().archiveAccount(b.id(),new ArchiveAccount(0L,true));
        var edited=c.product().save(old.id(),new MoneyProductService.Entry(TransactionType.EXPENSE,a.id(),null,new BigDecimal("100"),at,"Synthetic",null,"Memo after archive",false,null,old.version(),"Before closing"));
        assertThat(edited.memo()).isEqualTo("Memo after archive");assertThat(edited.fromAccountId()).isEqualTo(a.id());
        assertThatThrownBy(()->c.product().save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,a.id(),null,new BigDecimal("1"),at,null,null,null,false,null,null,"New"))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->c.product().save(old.id(),new MoneyProductService.Entry(TransactionType.EXPENSE,b.id(),null,new BigDecimal("100"),at,null,null,null,false,null,edited.version(),"Moved"))).isInstanceOf(InvalidRequestException.class);
    });}
}
