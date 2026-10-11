package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.nio.file.*;
import java.sql.Timestamp;
import java.time.Instant;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;

/** Root Integration/QA runs this isolated schema test; it never applies shared migrations. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class MoneyAccountHistoryPostgresTest {
 @Test void baselineAndChangesPreservePastClassificationAndUnrelatedMetadata()throws Exception{
  new MoneyMobilePostgresTest().isolated((db,m,p,w,mobile)->{
   var account=m.createAccount(new AccountInput("IBK","Synthetic temporal",AccountRole.SPENDING,null,"0001","🌿",null,null));
   if(db.queryForObject("select to_regclass('money_account_fund_group_history')::text",String.class)==null)
    db.execute(Files.readString(Path.of("src/main/resources/db/migration/V80__money_account_fund_group_history.sql")));
   var before=Instant.now().minusSeconds(1);
   var changed=mobile.saveFund(account.id(),new MoneyMobileService.FundInput("SAVINGS","INSTALLMENT",account.version()));
   var owner=MoneyPostgresIntegrationTest.OWNER;
   assertThat(db.queryForObject("select fund_group from money_account_fund_group_history where user_id=? and account_id=? and effective_at<=? order by effective_at desc limit 1",String.class,owner,account.id(),Timestamp.from(before))).isEqualTo("LIVING");
   assertThat(db.queryForObject("select fund_group from money_account_fund_group_history where user_id=? and account_id=? order by effective_at desc limit 1",String.class,owner,account.id())).isEqualTo("SAVINGS");
   assertThat(changed.account().role()).isEqualTo(AccountRole.SPENDING);assertThat(changed.account().emoji()).isEqualTo("🌿");
   var service=new MoneyAccountManagementService(db,()->owner,m);
   assertThat(service.history(account.id())).hasSize(2);
   assertThat(service.history(account.id()).getFirst().effectiveAt()).isNotNull();
   assertThat(service.eligibility(account.id()).allowed()).isFalse();
   var created=mobile.create(new MoneyMobileService.CreateInput(new AccountInput("IBK","Synthetic initial fund",AccountRole.SPENDING,null,"0002"),"SAVINGS","INSTALLMENT"));
   assertThat(service.history(created.account().id())).singleElement().satisfies(row->{assertThat(row.fundGroup()).isEqualTo("SAVINGS");assertThat(row.effectiveAt()).isNull();});
  });
 }
}
