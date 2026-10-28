import java.nio.file.*;
import java.sql.*;
import java.math.*;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.*;
import org.springframework.jdbc.datasource.*;
import tools.jackson.databind.json.JsonMapper;
import com.kafka.backend.money.*;
import static com.kafka.backend.money.MoneyTypes.*;
/** Used exclusively by money-unified-owned.mjs with its new loopback database. */
class UnifiedBookkeepingSeed {
 public static void main(String[] args)throws Exception{
  String url=System.getenv("DEV_DB_URL");if(!url.startsWith("jdbc:postgresql://127.0.0.1:55442/")||!url.contains("currentSchema=qa_money_web_"))throw new IllegalStateException("OWNED_SYNTHETIC_DATABASE_REQUIRED");
  var db=new JdbcTemplate(new DriverManagerDataSource(url,System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD")));UUID owner=UUID.fromString(System.getenv("APP_DEV_USER_ID"));var json=JsonMapper.builder().build();var m=new MoneyService(db,()->owner,json);var p=new MoneyProductService(db,()->owner,m,json);var w=new MoneyWebService(db,()->owner,m,p,json);
  var a=m.createAccount(new AccountInput("IBK","합성 생활비",AccountRole.SPENDING,"975-******-01-014",null));var b=m.createAccount(new AccountInput("SHINHAN","합성 저축",AccountRole.SAVINGS,null,"6017"));
  db.execute(Files.readString(Path.of("src/main/resources/db/migration/V47__pos_system_order.sql")));
  db.execute(Files.readString(Path.of("src/main/resources/db/migration/V102__morning_voice_gateway.sql")));
  if(db.queryForObject("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=current_schema() and c.relname like 'morning_voice_%' and c.relkind='r' and c.relrowsecurity",Integer.class)!=3)throw new IllegalStateException("VOICE_RLS_REHEARSAL_FAILED");
  var cats=p.initializeCategories();var category=cats.stream().filter(c->"EXPENSE".equals(c.kind())).findFirst().orElseThrow();var otherCategory=cats.stream().filter(c->"EXPENSE".equals(c.kind())&&!c.id().equals(category.id())).findFirst().orElseThrow();
  new MoneyMeaningService(db,()->owner,json).saveTracking(new MoneyMeaningService.TrackingInput(List.of(a.id()),List.of(a.id(),b.id()),0L));
  var loan=w.saveLoan(null,new MoneyWebTypes.LoanInput("합성 테스트 대출","합성 은행","PERSONAL",new BigDecimal("2000000"),new BigDecimal("2000000"),null,null,null,null,a.id(),null,null,"ACTIVE",null,0L));
  var ids=new LinkedHashMap<String,Object>();ids.put("account",a.id());ids.put("saving",b.id());ids.put("loan",loan.id());ids.put("category",category.id());ids.put("otherCategory",otherCategory.id());
  var rows=new ArrayList<UUID>();Instant at=Instant.parse("2026-10-12T01:00:00Z");
  for(int i=0;i<17;i++){boolean out=i<14;int amount=i==2?500000:10000+i*100;var t=p.save(null,new MoneyProductService.Entry(out?TransactionType.EXPENSE:TransactionType.INCOME,out?a.id():null,out?null:b.id(),BigDecimal.valueOf(amount),at.plusSeconds(i*600),"합성 거래 "+i,null,null,false,null,null,"합성 거래 "+i));if(i!=13)db.update("update money_transactions set meaning_state='UNRESOLVED' where id=?",t.id());rows.add(t.id());}
  // Exact independent opposite leg for the partial-transfer journey.
  var counterpart=p.save(null,new MoneyProductService.Entry(TransactionType.INCOME,null,b.id(),new BigDecimal("10100"),at.plusSeconds(600),"합성 이체 입금",null,null,false,null,null,"합성 이체 입금"));db.update("update money_transactions set meaning_state='UNRESOLVED' where id=?",counterpart.id());ids.put("transferIn",counterpart.id());
  var refund=p.save(null,new MoneyProductService.Entry(TransactionType.REFUND,null,a.id(),new BigDecimal("3000"),at.plusSeconds(20000),"합성 환불",null,null,false,null,null,"합성 환불"));ids.put("refund",refund.id());

  var b2=m.createAccount(new AccountInput("SHINHAN","합성 저축 B",AccountRole.SAVINGS,null,"6018"));
  var a2=m.createAccount(new AccountInput("IBK","합성 생활비 B",AccountRole.SPENDING,null,"0115"));
  var savingsIds=new ArrayList<UUID>();
  UUID[][] pairs={{a.id(),b.id()},{b.id(),a.id()},{b.id(),b2.id()},{a.id(),a2.id()}};
  int[] amounts={300000,50000,200000,100000};
  for(int i=0;i<4;i++)savingsIds.add(p.save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,pairs[i][0],pairs[i][1],BigDecimal.valueOf(amounts[i]),at.plusSeconds(40000+i),"합성 경계 "+i,null,null,false,null,null,"합성 경계 "+i)).id());
  ids.put("savingsRows",savingsIds);ids.put("saving2",b2.id());ids.put("living2",a2.id());
  for(var state:List.of("PAUSED","INACTIVE"))w.saveLoan(null,new MoneyWebTypes.LoanInput("합성 "+state,"합성 은행","PERSONAL",null,BigDecimal.valueOf(1000000),null,null,null,null,a.id(),null,null,state,null,0L));
  ids.put("rows",rows);Files.writeString(Path.of(System.getenv("UNIFIED_SEED")),json.writeValueAsString(ids));System.out.println("SYNTHETIC_UNIFIED_LEDGER_SEEDED");
 }
}
