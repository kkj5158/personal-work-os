import java.sql.*;import java.util.*;
class MeaningPerfSeed {
 public static void main(String[]args)throws Exception {
  Properties p=new Properties();p.setProperty("user",System.getenv("DEV_DB_USERNAME"));p.setProperty("password",System.getenv("DEV_DB_PASSWORD"));p.setProperty("socketTimeout","30");
  try(var c=DriverManager.getConnection(System.getenv("DEV_DB_URL"),p)){
   if(!c.getSchema().matches("qa_money_web_[a-f0-9]{20}"))throw new IllegalStateException("OWNED_SCHEMA_REQUIRED");c.setAutoCommit(false);
   UUID owner=UUID.fromString(System.getenv("APP_DEV_USER_ID"));var ids=new ArrayList<UUID>();UUID category=UUID.randomUUID();
   try(var s=c.prepareStatement("insert into money_categories(id,user_id,name,color) values(?,?,'Audit food','#ef8655')")){s.setObject(1,category);s.setObject(2,owner);s.executeUpdate();}
   for(int i=0;i<8;i++){UUID id=UUID.randomUUID();ids.add(id);try(var s=c.prepareStatement("insert into money_accounts(id,user_id,provider,display_name,role) values(?,?,'IBK',?,?)")){s.setObject(1,id);s.setObject(2,owner);s.setString(3,"Audit account "+i);s.setString(4,i==0?"INCOME_HUB":i<4?"SPENDING":"SAVINGS");s.executeUpdate();}}
   try(var s=c.prepareStatement("insert into money_transactions(id,user_id,type,from_account_id,to_account_id,amount,occurred_at,counterparty_text,title,category_id) values(?,?,?,?,?,?,date_trunc('day',now())-cast(? as interval),?,?,?)")){
    for(int i=0;i<2000;i++){String type=i%5==0?"INCOME":i%5==1?"TRANSFER":"EXPENSE";s.setObject(1,UUID.randomUUID());s.setObject(2,owner);s.setString(3,type);s.setObject(4,type.equals("INCOME")?null:ids.get(1+i%3));s.setObject(5,type.equals("EXPENSE")?null:type.equals("INCOME")?ids.get(0):ids.get(4+i%4));s.setInt(6,1000+i%100*100);s.setString(7,(i<400?i%20:21+i%340)+" days "+(i%120)+" seconds");s.setString(8,"Synthetic merchant "+i%30);s.setString(9,String.format("Audit %04d",i));s.setObject(10,i<20&&type.equals("EXPENSE")?null:category);s.addBatch();}s.executeBatch();}
   try(var s=c.prepareStatement("insert into money_raw_notifications(id,user_id,title,body,posted_at,raw_payload,dedupe_key,content_hash,state,source_package) values(?,? ,?,'Synthetic audit evidence',now(),'{}',?,?,'REVIEW_REQUIRED','audit.synthetic')")){for(int i=0;i<8;i++){s.setObject(1,UUID.randomUUID());s.setObject(2,owner);s.setString(3,"Audit review "+i);s.setString(4,"audit-"+i);s.setString(5,String.format("%064d",i));s.addBatch();}s.executeBatch();}
   try(var s=c.prepareStatement("insert into money_loans(id,user_id,name,lender,type,remaining_principal) values(?,? ,?,'Synthetic lender','PERSONAL',100000)")){for(int i=0;i<10;i++){s.setObject(1,UUID.randomUUID());s.setObject(2,owner);s.setString(3,"Audit loan "+i);s.addBatch();}s.executeBatch();}
   try(var s=c.prepareStatement("insert into money_category_rules(id,user_id,merchant,category_id) values(?,?,'synthetic merchant 1',?)")){s.setObject(1,UUID.randomUUID());s.setObject(2,owner);s.setObject(3,category);s.executeUpdate();}
   boolean phase3;try(var s=c.createStatement();var r=s.executeQuery("select to_regclass(current_schema()||'.money_tracking_settings') is not null")){r.next();phase3=r.getBoolean(1);}
   if(phase3){
    try(var s=c.prepareStatement("insert into money_tracking_settings(user_id,version) values(?,1)")){s.setObject(1,owner);s.executeUpdate();}
    try(var s=c.prepareStatement("insert into money_tracking_accounts(user_id,kind,slot,account_id) values(?,?,?,?)")){for(int i=0;i<4;i++){s.setObject(1,owner);s.setString(2,i==0?"INCOME":"EXPENSE");s.setInt(3,i==0?1:i);s.setObject(4,ids.get(i));s.addBatch();}s.executeBatch();}
   }
   try(var s=c.createStatement()){for(String table:List.of("money_accounts","money_transactions","money_categories","money_raw_notifications","money_loans"))s.execute("analyze "+table);}c.commit();System.out.println("AUDIT_SYNTHETIC_SEED accounts=8 transactions=2000 loans=10 review=8");
  }
 }
}
