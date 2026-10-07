import java.nio.file.*;
import java.sql.*;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;

/** QA only: exact registered operation IDs, expected disposable content, and absent source required. */
public class CalendarReceiptCleanup {
  public static void main(String[] args) throws Exception {
    Path file=Path.of(args[0]);
    if(!Files.exists(file)){System.out.println("QA_CALENDAR_RECEIPTS_REMOVED=0");return;}
    Set<UUID> keys=new HashSet<>();for(String line:Files.readAllLines(file))if(!line.isBlank())keys.add(UUID.fromString(line));
    UUID owner=UUID.fromString(System.getenv("APP_DEV_USER_ID"));
    Properties properties=new Properties();properties.setProperty("user",System.getenv("DEV_DB_USERNAME"));properties.setProperty("password",System.getenv("DEV_DB_PASSWORD"));
    properties.setProperty("ApplicationName","calendar-owned-receipt-cleanup");properties.setProperty("connectTimeout","15");properties.setProperty("socketTimeout","30");
    int removed=0;
    try(Connection db=DriverManager.getConnection(System.getenv("DEV_DB_URL"),properties)){
      db.setAutoCommit(false);
      try{
        try(PreparedStatement lock=db.prepareStatement("select id from auth.users where id=? for update")){lock.setObject(1,owner);lock.executeQuery().close();}
        for(UUID key:keys){
          try(PreparedStatement query=db.prepareStatement("select operation_kind,response_json from calendar_creation_operations where user_id=? and operation_id=? for update")){
            query.setObject(1,owner);query.setObject(2,key);
            try(ResultSet row=query.executeQuery()){
              if(!row.next())continue;
              var body=new ObjectMapper().readTree(row.getString(2));
              if(!row.getString(1).equals("ACTUAL:LIFE_TIME_ENTRY")||!body.path("date").asText().equals("2001-01-08")||!body.path("title").asText().startsWith("QA "))throw new IllegalStateException("QA_RECEIPT_OWNERSHIP_CONTENT_MISMATCH");
              UUID source=UUID.fromString(body.path("id").asText());
              try(PreparedStatement check=db.prepareStatement("select count(*) from life_time_entries where id=?")){check.setObject(1,source);try(ResultSet count=check.executeQuery()){count.next();if(count.getInt(1)!=0)throw new IllegalStateException("QA_CALENDAR_SOURCE_STILL_EXISTS");}}
            }
          }
          try(PreparedStatement delete=db.prepareStatement("delete from calendar_creation_operations where user_id=? and operation_id=?")){delete.setObject(1,owner);delete.setObject(2,key);removed+=delete.executeUpdate();}
        }
        db.commit();
      }catch(Exception failure){db.rollback();throw failure;}
    }
    System.out.println("QA_CALENDAR_RECEIPTS_REMOVED="+removed);
  }
}
