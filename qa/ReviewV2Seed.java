import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.math.*;
import org.springframework.jdbc.core.*;
import org.springframework.jdbc.datasource.*;
import tools.jackson.databind.json.JsonMapper;
import com.kafka.backend.money.*;
import static com.kafka.backend.money.MoneyTypes.*;

/** Used only by the existing run-owned loopback UI lifecycle. No shared credentials or database. */
class ReviewV2Seed {
 public static void main(String[] args)throws Exception{
  String url=System.getenv("DEV_DB_URL");if(!url.startsWith("jdbc:postgresql://127.0.0.1:55442/")||!url.contains("currentSchema=qa_money_web_"))throw new IllegalStateException("OWNED_SYNTHETIC_DATABASE_REQUIRED");
  var db=new JdbcTemplate(new DriverManagerDataSource(url,System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD")));UUID owner=UUID.fromString(System.getenv("APP_DEV_USER_ID"));var json=JsonMapper.builder().build();var money=new MoneyService(db,()->owner,json);
  var other=money.createAccount(new AccountInput("IBK","합성 이체 상대",AccountRole.SPENDING,"975-******-01-015",null));
  var ids=new LinkedHashMap<String,Object>();ids.put("other",other.id());
  String[] names={"일반 합성카페","대출상환","환불","합성내계좌","합성내계좌","미확정 합성인물"};
  int[] amounts={5800,6000,3000,12000,12000,7777};boolean[] out={true,true,false,true,false,true};
  for(int i=0;i<names.length;i++){
   String ref=i==4?"975-******-01-015":"975-******-01-014";int minute=i==4?3:i;
   var raw=money.ingest(Map.of("sourcePackage","com.ibk.android.ionebank","title","합성 QA 은행 알림","text","["+(out[i]?"출금":"입금")+"] "+amounts[i]+"원 "+names[i]+" "+ref+" 11/15 08:"+String.format("%02d",minute)+" / 잔액 50000원","postedAt","2026-11-14T23:"+String.format("%02d",minute)+":00Z","notificationKey","synthetic-review-"+i,"currency","KRW")).notification();
   money.process(raw.id(),new IbkNotificationParserV1());db.update("update money_raw_notifications set state='REVIEW_REQUIRED',processing_reason='OWNER_DECISION',processing_due_at=null,review_deferred=?,processing_version=processing_version+1 where id=?",i==4,raw.id());ids.put("raw"+i,raw.id());
  }
  var failed=money.ingest(Map.of("sourcePackage","com.ibk.android.ionebank","text","합성: 파싱 실패 금융 사실 직접 확인","postedAt","2026-11-15T00:00:00Z","currency","KRW")).notification();db.update("update money_raw_notifications set state='FAILED',processing_reason='PARSER_ERROR',processing_due_at=null where id=?",failed.id());ids.put("failed",failed.id());
  Path file=Path.of(System.getenv("UNIFIED_SEED"));var prior=json.readValue(Files.readString(file),Map.class);prior.put("reviewV2",ids);Files.writeString(file,json.writeValueAsString(prior));System.out.println("SYNTHETIC_REVIEW_V2_SEEDED");
 }
}
