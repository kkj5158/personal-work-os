package com.kafka.backend.money;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import java.math.BigDecimal;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Real PostgreSQL history/ownership/KST query, in a rolled-back owned schema. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class MoneyInstallmentReadPostgresTest {
 @Test void canonicalTransfersReconcileThroughHistoryKstPaginationAndSearch() throws Exception {
  try(var c=MoneyPostgresIntegrationTest.connection()) {c.setAutoCommit(false);try {
   var db=new JdbcTemplate(new SingleConnectionDataSource(c,true));
   String schema="qa_installment_"+UUID.randomUUID().toString().replace("-","");
   db.execute("create schema "+schema);db.execute("set local search_path="+schema+",public");
   db.execute("create table money_accounts(id uuid,user_id uuid,display_name text,provider text,role text,archived boolean default false,version bigint default 0,fund_group text,savings_subtype text,updated_at timestamptz,include_in_statistics boolean default true,primary key(id,user_id))");
   UUID owner=UUID.fromString("27f164d1-5bce-46a2-b167-64a71b9b953e"),ordinary=UUID.randomUUID(),gateway=UUID.randomUUID(),installment=UUID.randomUUID(),archived=UUID.randomUUID(),future=UUID.randomUUID(),excluded=UUID.randomUUID(),missing=UUID.randomUUID(),foreign=UUID.randomUUID();
   UUID corrected=UUID.fromString("81410418-e3d6-48bd-a610-30ebac0d3bd7");
   for(var id:List.of(ordinary,gateway,installment,archived,future,excluded,missing,foreign,corrected)) {
    String group=id.equals(ordinary)?"LIVING":"SAVINGS",subtype=id.equals(ordinary)?null:List.of(gateway,future,corrected).contains(id)?"SAVINGS_ACCOUNT":"INSTALLMENT";
    db.update("insert into money_accounts(id,user_id,display_name,provider,fund_group,savings_subtype,version,archived,include_in_statistics) values(?,?,?,?,?,?,?,?,?)",id,id.equals(foreign)?UUID.randomUUID():owner,id.equals(corrected)?"청년 미래 적금 ":id.toString(),"SHINHAN",group,subtype,id.equals(corrected)?1:0,id.equals(archived),!id.equals(excluded));
   }
   db.execute(Files.readString(Path.of("src/main/resources/db/migration/V80__money_account_fund_group_history.sql")));
   db.execute("create table money_transactions(id uuid primary key,user_id uuid,type text,meaning_state text default 'CONFIRMED',amount numeric,currency text default 'KRW',occurred_at timestamptz,from_account_id uuid,to_account_id uuid,title text,memo text,counterparty_text text,excluded boolean default false,merged_into uuid,version bigint default 0)");
   String insert="insert into money_transactions(id,user_id,type,amount,occurred_at,from_account_id,to_account_id,title) values(?,?,?, ?,cast(? as timestamptz),?,?,?)";
   var add=new Object(){UUID row(String type,int amount,String at,UUID from,UUID to,String title){var id=UUID.randomUUID();db.update(insert,id,owner,type,amount,at,from,to,title);return id;}};
   add.row("TRANSFER",100,"2026-10-31T15:00:00Z",ordinary,installment,"start");
   add.row("TRANSFER",60,"2026-11-10T00:00:00Z",gateway,archived,"archived gateway");
   add.row("TRANSFER",30,"2026-11-30T14:59:59.999999Z",ordinary,corrected,"corrected baseline");
   add.row("TRANSFER",999,"2026-10-31T14:59:59.999999Z",ordinary,installment,"previous month");
   add.row("TRANSFER",999,"2026-11-30T15:00:00Z",ordinary,installment,"next month");
   add.row("TRANSFER",999,"2026-11-10T00:00:00Z",installment,archived,"internal");
   add.row("TRANSFER",999,"2026-11-10T00:00:00Z",installment,ordinary,"withdrawal");
   add.row("TRANSFER",999,"2026-11-10T00:00:00Z",ordinary,gateway,"parking");
   add.row("INITIAL_BALANCE",41000,"2026-11-10T00:00:00Z",null,installment,"initial");
   for(var type:List.of("BALANCE_ADJUSTMENT","INCOME","EXPENSE","LOAN_PAYMENT"))add.row(type,999,"2026-11-10T00:00:00Z",ordinary,installment,type);
   var pending=add.row("TRANSFER",999,"2026-11-10T00:00:00Z",ordinary,installment,"pending");db.update("update money_transactions set meaning_state='UNRESOLVED' where id=?",pending);
   var hidden=add.row("TRANSFER",999,"2026-11-10T00:00:00Z",ordinary,installment,"excluded");db.update("update money_transactions set excluded=true where id=?",hidden);
   var duplicate=add.row("TRANSFER",999,"2026-11-10T00:00:00Z",ordinary,installment,"merged duplicate");db.update("update money_transactions set merged_into=? where id=?",pending,duplicate);
   add.row("TRANSFER",999,"2026-11-10T00:00:00Z",ordinary,excluded,"statistics off");
   // A later account edit must not turn earlier gateway parking into payments.
   add.row("TRANSFER",999,"2026-11-10T00:00:00Z",ordinary,future,"before subtype edit");
   db.update("insert into money_account_fund_group_history values(?,?,'SAVINGS','INSTALLMENT','2026-11-20',now(),1)",owner,future);
   add.row("TRANSFER",20,"2026-11-21T00:00:00Z",ordinary,future,"after subtype edit");
   long rowsBefore=db.queryForObject("select count(*) from money_transactions",Long.class);
   String historyBefore=db.queryForObject("select savings_subtype from money_account_fund_group_history where account_id=?",String.class,corrected);
   db.execute(Files.readString(Path.of("src/main/resources/db/migration/V112__money_installment_subtype_correction.sql")));
   assertThat(db.queryForObject("select savings_subtype from money_accounts where id=?",String.class,corrected)).isEqualTo("INSTALLMENT");
   assertThat(db.queryForObject("select savings_subtype from money_account_fund_group_history where account_id=? and effective_at='-infinity'",String.class,corrected)).isEqualTo(historyBefore);
   assertThat(db.queryForObject("select count(*) from money_transactions",Long.class)).isEqualTo(rowsBefore);
   var service=new MoneyInstallmentReadService(db,()->owner);
   var all=service.read("2026-11-01","2026-11-30",null,null,200,0,null);
   assertThat(all.totals().amount()).isEqualByComparingTo("210");assertThat(all.total()).isEqualTo(4);
   assertThat(all.items().stream().map(MoneySavingsReadService.Transfer::amount).reduce(BigDecimal.ZERO,BigDecimal::add)).isEqualByComparingTo(all.totals().amount());
   assertThat(all.totals().composition().stream().map(MoneySavingsReadService.Slice::amount).reduce(BigDecimal.ZERO,BigDecimal::add)).isEqualByComparingTo(all.totals().amount());
   for(var slice:all.totals().composition()) {
    var detail=service.read("2026-11-01","2026-11-30",slice.accountId(),null,200,0,null);
    assertThat(detail.filteredAmount()).isEqualByComparingTo(slice.amount());assertThat(detail.total()).isEqualTo((int)slice.count());assertThat(detail.totals()).isEqualTo(all.totals());
   }
   var searched=service.read("2026-11-01","2026-11-30",archived,"gateway",1,0,null);
   assertThat(searched.total()).isEqualTo(1);assertThat(searched.items()).hasSize(1);
   assertThat(service.read("2026-11-01","2026-11-30",null,null,1,1,null).items()).containsExactly(all.items().get(1));
   assertThatThrownBy(()->service.read("2026-11-01","2026-11-30",foreign,null,50,0,null)).hasMessageContaining("소유 계좌");
   assertThat(new MoneyInstallmentReadService(db,UUID::randomUUID).read("2026-11-01","2026-11-30",null,null,50,0,null).total()).isZero();
   db.update("delete from money_account_fund_group_history where account_id=?",missing);
   add.row("TRANSFER",1,"2026-11-10T00:00:00Z",missing,installment,"unknown source history");
   add.row("TRANSFER",1,"2026-11-10T00:00:00Z",ordinary,foreign,"cross owner destination");
   var unknown=service.read("2026-11-01","2026-11-30",null,null,50,0,null);
   assertThat(unknown.totals().amount()).isNull();assertThat(unknown.totals().unknownHistoryCount()).isEqualTo(2);
  } finally {c.rollback();}}
 }
}
