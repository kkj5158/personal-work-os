package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.money.MoneyService.*;

/** No dependency on posting, checkpoint, or financial adjustment services. */
@Service
@Transactional
public class MoneyBalanceObservationService {
 private final JdbcTemplate db; private final CurrentUserProvider users; private final MoneyService money; private final JsonMapper json;
 public MoneyBalanceObservationService(JdbcTemplate db,CurrentUserProvider users,MoneyService money,JsonMapper json){this.db=db;this.users=users;this.money=money;this.json=json;}
 public record Input(BigDecimal amount,Instant observedAt,String note,Long expectedVersion,String reason){}
 public record StateInput(Long expectedVersion,String reason){}
 public record Observation(UUID id,UUID accountId,BigDecimal amount,Instant observedAt,String origin,String status,String note,long version,Instant createdAt,Instant updatedAt){}
 private UUID owner(){return users.getCurrentUserId();}
 private static void version(long actual,Long expected){if(expected==null||actual!=expected)throw new OptimisticLockConflictException("확인 기록 또는 표 설정이 변경되었습니다. 입력을 유지하고 최신 버전을 확인하세요.");}
 private void lock(UUID account){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner());require(!money.account(account).archived(),"보관 계좌는 먼저 복원하세요.");}
 private Observation row(java.sql.ResultSet r,int n)throws java.sql.SQLException{return new Observation(r.getObject("id",UUID.class),r.getObject("account_id",UUID.class),r.getBigDecimal("amount"),r.getTimestamp("observed_at").toInstant(),r.getString("origin"),r.getString("status"),r.getString("note"),r.getLong("version"),r.getTimestamp("created_at").toInstant(),r.getTimestamp("updated_at").toInstant());}
 private Observation get(UUID account,UUID id){return db.query("select * from money_balance_observations where user_id=? and account_id=? and id=?",this::row,owner(),account,id).stream().findFirst().orElseThrow(()->new ResourceNotFoundException("Observation not found"));}
 @Transactional(readOnly=true) public List<Observation> history(UUID account){money.account(account);return db.query("select * from money_balance_observations where user_id=? and account_id=? order by observed_at desc,created_at desc,id",this::row,owner(),account);}
 @Transactional(readOnly=true) public List<Map<String,Object>> revisions(UUID account,UUID id){money.account(account);get(account,id);return db.queryForList("select revision,action,reason,old_value::text as \"oldValue\",new_value::text as \"newValue\",recorded_at as \"recordedAt\" from money_balance_observation_revisions where user_id=? and observation_id=? order by revision desc",owner(),id);}
 private void validate(Input v){require(v!=null&&v.amount()!=null&&v.amount().abs().compareTo(new BigDecimal("100000000000000000"))<0&&v.amount().stripTrailingZeros().scale()<=2,"잔액은 소수 둘째 자리까지 입력하세요.");require(v.observedAt()!=null&&!v.observedAt().isAfter(Instant.now()),"미래 확인 시각은 저장할 수 없습니다.");text(v.note(),500,false,"메모");text(v.reason(),500,false,"변경 사유");}
 private void audit(Observation old,Observation saved,String action,String reason){db.update("insert into money_balance_observation_revisions(id,observation_id,user_id,revision,action,reason,old_value,new_value,actor_id) values(?,?,?,?,?,?,?::jsonb,?::jsonb,?)",UUID.randomUUID(),saved.id(),owner(),saved.version(),action,reason,old==null?null:json.writeValueAsString(old),json.writeValueAsString(saved),owner());}
 public Observation create(UUID account,Input v){lock(account);validate(v);UUID id=UUID.randomUUID();db.update("insert into money_balance_observations(id,user_id,account_id,amount,observed_at,note) values(?,?,?,?,?,?)",id,owner(),account,v.amount(),Timestamp.from(v.observedAt()),v.note());var saved=get(account,id);audit(null,saved,"CREATE",v.reason());return saved;}
 public Observation edit(UUID account,UUID id,Input v){lock(account);validate(v);var old=get(account,id);version(old.version(),v.expectedVersion());require(old.status().equals("ACTIVE"),"취소한 확인 기록을 먼저 복원하세요.");db.update("update money_balance_observations set amount=?,observed_at=?,note=?,version=version+1,updated_at=now() where user_id=? and id=? and version=?",v.amount(),Timestamp.from(v.observedAt()),v.note(),owner(),id,old.version());var saved=get(account,id);audit(old,saved,"EDIT",v.reason());return saved;}
 public Observation state(UUID account,UUID id,StateInput v,boolean cancel){lock(account);require(v!=null,"버전을 확인하세요.");text(v.reason(),500,false,"변경 사유");var old=get(account,id);version(old.version(),v.expectedVersion());require(old.status().equals(cancel?"ACTIVE":"CANCELLED"),"확인 기록 상태가 변경되었습니다.");db.update("update money_balance_observations set status=?,version=version+1,updated_at=now() where user_id=? and id=? and version=?",cancel?"CANCELLED":"ACTIVE",owner(),id,old.version());var saved=get(account,id);audit(old,saved,cancel?"CANCEL":"RESTORE",v.reason());return saved;}
 public record Preferences(List<String> hiddenColumns,long version){}
 public record PreferenceInput(List<String> hiddenColumns,Long expectedVersion){}
 @Transactional(readOnly=true) public Preferences preferences(){return db.query("select hidden_columns::text,version from money_account_table_preferences where user_id=?",(r,n)->new Preferences(Arrays.asList(json.readValue(r.getString(1),String[].class)),r.getLong(2)),owner()).stream().findFirst().orElse(new Preferences(List.of(),0));}
 public Preferences preferences(PreferenceInput v){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner());require(v!=null&&v.hiddenColumns()!=null&&v.hiddenColumns().size()<=11&&Set.of("group","role","current","observed","difference","status","assets","income","expense","representative").containsAll(v.hiddenColumns()),"표 열을 확인하세요.");version(preferences().version(),v.expectedVersion());db.update("insert into money_account_table_preferences(user_id,hidden_columns,version) values(?,?::jsonb,1) on conflict(user_id) do update set hidden_columns=excluded.hidden_columns,version=money_account_table_preferences.version+1,updated_at=now()",owner(),json.writeValueAsString(v.hiddenColumns()));return preferences();}
}
