package com.kafka.backend.money;
import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.function.Supplier;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import static com.kafka.backend.money.MoneyService.*;

/** Durable exact-request outcomes. Failed bundles roll back before their NOT_APPLIED outcome is recorded. */
@Service
public class MoneyCommandService {
 private final JdbcTemplate db;private final ObjectMapper json;private final TransactionTemplate tx;
 public MoneyCommandService(JdbcTemplate db,ObjectMapper json,PlatformTransactionManager manager){this.db=db;this.json=json;this.tx=new TransactionTemplate(manager);this.tx.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_NESTED);}
 public String fingerprint(Object value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsString(value).getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 private void lock(UUID owner){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner);}
 public Map<String,Object> outcome(UUID owner,UUID id){var rows=db.queryForList("select command,status,result::text from money_command_outcomes where user_id=? and request_id=?",owner,id);if(rows.isEmpty())return Map.of("requestId",id,"status","UNKNOWN");var row=rows.getFirst();return Map.of("requestId",id,"command",row.get("command"),"status",row.get("status"),"result",json.readValue(row.get("result").toString(),Map.class));}
 private Map<String,Object> replay(UUID owner,UUID id,String command,String hash){var rows=db.queryForList("select command,request_hash from money_command_outcomes where user_id=? and request_id=?",owner,id);if(rows.isEmpty())return null;require(command.equals(rows.getFirst().get("command"))&&hash.equals(rows.getFirst().get("request_hash")),"요청 식별자가 다른 변경에 사용되었습니다.");return outcome(owner,id);}
 public Map<String,Object> execute(UUID owner,UUID id,String command,Object request,Supplier<Map<String,Object>> operation){
  require(id!=null,"변경 요청 식별자가 필요합니다.");String hash=fingerprint(request);
  try{return tx.execute(status->{lock(owner);var old=replay(owner,id,command,hash);if(old!=null)return old;var result=operation.get();record(owner,id,command,hash,"APPLIED",result);return outcome(owner,id);});}
  catch(OptimisticLockConflictException|InvalidRequestException|ResourceNotFoundException error){
   return tx.execute(status->{lock(owner);var old=replay(owner,id,command,hash);if(old!=null)return old;record(owner,id,command,hash,"NOT_APPLIED",Map.of("message",error.getMessage(),"reason",error instanceof OptimisticLockConflictException?"VERSION_CONFLICT":"INELIGIBLE"));return outcome(owner,id);});
  }
 }
 private void record(UUID owner,UUID id,String command,String hash,String status,Object result){db.update("insert into money_command_outcomes(user_id,request_id,command,request_hash,status,result) values(?,?,?,?,?,cast(? as jsonb))",owner,id,command,hash,status,json.writeValueAsString(result));}
}
