import com.kafka.backend.money.IbkNotificationParserV1;
import com.kafka.backend.money.MoneyTypes.*;
import tools.jackson.databind.json.JsonMapper;
import java.sql.*;
import java.time.Instant;
import java.util.*;

/** Synthetic fixture only. Refuses shared hosts, unmarked schemas and populated seed targets. */
class ReviewSimplificationFixture {
 static final JsonMapper JSON=JsonMapper.builder().build();
 static final String PREFIX="money-review-simplification:";
 static UUID owner;
 static UUID id(String key){return UUID.nameUUIDFromBytes((PREFIX+owner+":"+key).getBytes(java.nio.charset.StandardCharsets.UTF_8));}
 static long count(Connection c,String table)throws Exception{try(var q=c.prepareStatement("select count(*) from "+table+" where user_id=?")){q.setObject(1,owner);try(var r=q.executeQuery()){r.next();return r.getLong(1);}}}
 static void guard(Connection c,String url)throws Exception {
  if(url==null||!url.matches("jdbc:postgresql://127\\.0\\.0\\.1:5544[0-9]/[A-Za-z0-9_]+(?:\\?.*)?"))throw new IllegalStateException("OWNED_LOOPBACK_PG_URL_REQUIRED");
  try(var s=c.createStatement();var r=s.executeQuery("select current_schema(),obj_description((select oid from pg_namespace where nspname=current_schema()),'pg_namespace'),inet_server_addr()::text,inet_server_port()")) {
   r.next();if(!r.getString(1).matches("qa_money_web_[a-f0-9]{20}")||!"pos-central-qa-money-web-owned".equals(r.getString(2))||!"127.0.0.1".equals(r.getString(3))||r.getInt(4)<55440||r.getInt(4)>55449)throw new IllegalStateException("OWNED_LOOPBACK_MARKED_MONEY_SCHEMA_REQUIRED");
  }
 }
 static UUID raw(Connection c,String key,String title,String body,String reason,boolean parsed,String hint)throws Exception {
  UUID raw=id(key);Instant at=Instant.parse("2026-10-13T01:00:05Z");String source=parsed?"com.ibk.android.ionebank":"qa.synthetic.information";
  var payload=new LinkedHashMap<String,Object>();payload.put("synthetic",true);payload.put("fixture",PREFIX);payload.put("fixtureKey",key);payload.put("sourcePackage",source);payload.put("title",title);payload.put("text",body);payload.put("postedAt",at.toString());payload.put("idempotencyKey",PREFIX+raw);if(key.contains("foreign"))payload.put("currency","USD");
  String sql="insert into money_raw_notifications(id,user_id,source_package,title,body,posted_at,raw_payload,dedupe_key,content_hash,state,processing_reason,processing_due_at) values(?,?,?,?,?,?,cast(? as jsonb),?,?,'REVIEW_REQUIRED',?,null)";
  try(var s=c.prepareStatement(sql)) {s.setObject(1,raw);s.setObject(2,owner);s.setString(3,source);s.setString(4,title);s.setString(5,body);s.setTimestamp(6,Timestamp.from(at));s.setString(7,JSON.writeValueAsString(payload));s.setString(8,PREFIX+raw);s.setString(9,raw.toString().replace("-","")+"00000000000000000000000000000000");s.setString(10,reason);s.executeUpdate();}
  if(parsed) {
   var notification=new MoneyRawNotification(raw,source,"qa:"+key,"owned-loopback",title,body,null,at,at,payload,PREFIX+raw,ProcessingState.REVIEW_REQUIRED,0,reason);
   var parser=new IbkNotificationParserV1();var candidate=parser.parse(notification);
   if(candidate.parseStatus()!=ParseStatus.PARSED)throw new IllegalStateException("ACTUAL_IBK_FIXTURE_PARSE_FAILED:"+key);
   String candidateJson=JSON.writeValueAsString(candidate);
   try(var s=c.prepareStatement("insert into money_parse_attempts(id,user_id,raw_event_id,parser_key,parser_version,status,provider,direction,amount,candidate,created_at) values(?,?,?,?,?,'PARSED',?,?,?,cast(? as jsonb),now()-interval '3 minutes')")) {
    s.setObject(1,id("parse:"+key));s.setObject(2,owner);s.setObject(3,raw);s.setString(4,parser.key());s.setString(5,parser.version());s.setString(6,candidate.provider());s.setString(7,candidate.direction().name());s.setBigDecimal(8,candidate.amount());s.setString(9,candidateJson);s.executeUpdate();
   }
  }
  return raw;
 }
 static String expense(int amount,String merchant,String mask){return "[출금] "+String.format(Locale.ROOT,"%,d",amount)+"원 주식회사 "+merchant+" "+mask+" 10/13 10:00 / 잔액 50,000원";}
 static Map<String,Object> seed(Connection c)throws Exception {
  if(count(c,"money_raw_notifications")!=0||count(c,"money_transactions")!=0||count(c,"money_accounts")!=0)throw new IllegalStateException("EMPTY_OWNED_MONEY_SEED_TARGET_REQUIRED");
  String mask="975-******-01-014";UUID account=id("account");
  try(var s=c.prepareStatement("insert into money_accounts(id,user_id,provider,display_name,role,masked_reference,suffix) values(?,?,'IBK','검증용 생활비','SPENDING',?,null)")){s.setObject(1,account);s.setObject(2,owner);s.setString(3,mask);s.executeUpdate();}
  var ids=new LinkedHashMap<String,Object>();ids.put("account",account);
  for(String key:List.of("direct-move","api-move","api-replay-move","bulk-move-a","bulk-move-b"))ids.put(key,raw(c,key,"입출금내역 알림",expense(5800+ids.size()*100,"검증 상점 "+key,mask),"UNMATCHED_OR_EXTERNAL_UNPROVEN",true,mask));
  ids.put("blocked-owned",raw(c,"blocked-owned","입출금내역 알림",expense(12500,"검증 상점 미확인","975-******-01-999"),"ACCOUNT_RESOLUTION_REQUIRED",true,null));
  ids.put("foreign",raw(c,"foreign","입출금내역 알림",expense(13700,"검증 해외 거래",mask),"UNMATCHED_OR_EXTERNAL_UNPROVEN",true,mask));
  for(String key:List.of("direct-defer","direct-nontransaction","response-loss","api-defer","api-nontransaction","api-partial-a","api-partial-b","api-filter-late"))ids.put(key,raw(c,key,"(광고) 검증 안내 "+key,"검증용 이벤트 안내입니다.","UNRECOGNIZED_SHAPE",false,null));
  var bulk=new ArrayList<UUID>();for(int i=0;i<52;i++)bulk.add(raw(c,"bulk-"+i,"(광고) 검증 일괄 안내 "+String.format("%02d",i),"검증용 이벤트 안내입니다.","UNRECOGNIZED_SHAPE",false,null));ids.put("bulk-notices",bulk);
  return Map.of("dataBoundary","OWNED_LOOPBACK_SYNTHETIC","ids",ids,"baseline",snapshot(c));
 }
 static Map<String,Object> snapshot(Connection c)throws Exception {
  var counts=new LinkedHashMap<String,Object>();for(String table:List.of("money_accounts","money_raw_notifications","money_parse_attempts","money_transactions","money_transaction_sources","money_ai_events","money_ai_lookups","money_recommendation_usage"))counts.put(table,count(c,table));
  var raws=new ArrayList<Map<String,Object>>();
  try(var s=c.prepareStatement("select id,state,processing_version,review_deferred,processing_reason,md5(raw_payload::text) payload_hash,md5(coalesce(title,'')||'|'||coalesce(body,'')) text_hash,coalesce((raw_payload->>'synthetic')::boolean,false) synthetic,raw_payload->>'fixture' fixture from money_raw_notifications where user_id=? order by id")){s.setObject(1,owner);try(var r=s.executeQuery()){while(r.next()){if(!r.getBoolean("synthetic")||!PREFIX.equals(r.getString("fixture")))throw new IllegalStateException("NON_FIXTURE_DATA_IN_OWNED_SCHEMA");var row=new LinkedHashMap<String,Object>();for(String key:List.of("id","state","processing_version","review_deferred","processing_reason","payload_hash","text_hash"))row.put(key,r.getObject(key));raws.add(row);}}}
  var ledger=new ArrayList<Map<String,Object>>();try(var s=c.prepareStatement("select t.id,t.type,t.amount,t.currency,t.category_id,t.from_account_id,t.to_account_id,s.raw_event_id from money_transactions t left join money_transaction_sources s on s.user_id=t.user_id and s.transaction_id=t.id where t.user_id=? order by t.id,s.raw_event_id")){s.setObject(1,owner);try(var r=s.executeQuery()){while(r.next()){var row=new LinkedHashMap<String,Object>();for(String key:List.of("id","type","amount","currency","category_id","from_account_id","to_account_id","raw_event_id"))row.put(key,r.getObject(key));ledger.add(row);}}}
  return Map.of("dataBoundary","OWNED_LOOPBACK_SYNTHETIC","counts",counts,"rawEvidence",raws,"ledger",ledger);
 }
 public static void main(String[] args)throws Exception {
  if(args.length==0||!Set.of("seed","snapshot","bump").contains(args[0]))throw new IllegalArgumentException("Use seed, snapshot, or bump <fixture UUID>");
  String url=System.getenv("DEV_DB_URL");if(url==null||!url.matches("jdbc:postgresql://127\\.0\\.0\\.1:5544[0-9]/[A-Za-z0-9_]+(?:\\?.*)?"))throw new IllegalStateException("OWNED_LOOPBACK_PG_URL_REQUIRED");
  owner=UUID.fromString(System.getenv("APP_DEV_USER_ID"));var props=new Properties();props.setProperty("user",System.getenv("DEV_DB_USERNAME"));props.setProperty("password",System.getenv("DEV_DB_PASSWORD"));props.setProperty("connectTimeout","15");props.setProperty("socketTimeout","30");
  try(var c=DriverManager.getConnection(url,props)) {c.setAutoCommit(false);c.setReadOnly(args[0].equals("snapshot"));guard(c,url);try(var s=c.createStatement()){s.execute("set local statement_timeout='30s'");s.execute("set local lock_timeout='5s'");}
   Object result;
   if(args[0].equals("seed"))result=seed(c);
   else if(args[0].equals("snapshot"))result=snapshot(c);
   else {if(args.length!=2)throw new IllegalArgumentException("bump requires exact synthetic UUID");UUID target=UUID.fromString(args[1]);try(var s=c.prepareStatement("update money_raw_notifications set processing_version=processing_version+1 where user_id=? and id=? and raw_payload->>'fixture'=? and raw_payload->>'synthetic'='true' and state='REVIEW_REQUIRED'")){s.setObject(1,owner);s.setObject(2,target);s.setString(3,PREFIX);if(s.executeUpdate()!=1)throw new IllegalStateException("EXACT_PENDING_SYNTHETIC_ROW_REQUIRED");}result=Map.of("bumped",target,"dataBoundary","OWNED_LOOPBACK_SYNTHETIC");}
   c.commit();System.out.println(JSON.writeValueAsString(result));
  }
 }
}
