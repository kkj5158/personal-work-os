import java.sql.*;
import java.util.*;

/** Synthetic pending notification evidence, confined to the central-QA owned schema. */
class ReviewFixture {
 public static void main(String[] args)throws Exception {
  Properties p=new Properties();p.setProperty("user",System.getenv("DEV_DB_USERNAME"));p.setProperty("password",System.getenv("DEV_DB_PASSWORD"));p.setProperty("connectTimeout","15");p.setProperty("socketTimeout","30");
  try(var c=DriverManager.getConnection(System.getenv("DEV_DB_URL"),p)) {
   c.setAutoCommit(false);
   try(var s=c.createStatement();var r=s.executeQuery("select current_schema(),obj_description((select oid from pg_namespace where nspname=current_schema()),'pg_namespace')")) {
    r.next();if(!r.getString(1).matches("qa_money_web_[a-f0-9]{20}")||!"pos-central-qa-money-web-owned".equals(r.getString(2)))throw new IllegalStateException("OWNED_QA_SCHEMA_REQUIRED");
   }
   String sql="insert into money_raw_notifications(id,user_id,title,body,posted_at,raw_payload,dedupe_key,content_hash,state,processing_reason,processing_due_at) values(?,?,?,'합성 검증 원문',now(),cast(? as jsonb),?,?,'REVIEW_REQUIRED',?,null)";
   try(var insert=c.prepareStatement(sql)) {
    for(int i=0;i<53;i++) { UUID id=UUID.randomUUID();String title=i<52?"(광고) V2 review 합성 안내 "+i:"V2 review 출금 12,000원 계좌 미확인";
     insert.setObject(1,id);insert.setObject(2,UUID.fromString(System.getenv("APP_DEV_USER_ID")));insert.setString(3,title);insert.setString(4,"{\"synthetic\":true,\"title\":\""+title+"\",\"text\":\"합성 검증 원문\"}");insert.setString(5,"v2-review:"+id);insert.setString(6,id.toString().replace("-","")+"00000000000000000000000000000000");insert.setString(7,i<52?"UNRECOGNIZED_SHAPE":"ACCOUNT_RESOLUTION_REQUIRED");insert.executeUpdate();
    }
   }c.commit();System.out.println("QA_V2_REVIEW_SYNTHETIC_ROWS=53");
  }
 }
}
