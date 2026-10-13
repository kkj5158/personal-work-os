package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import java.math.BigDecimal;
import java.sql.Timestamp;
import static com.kafka.backend.money.MoneyService.require;

/** Registration lifecycle for an existing canonical ledger fact. Provenance is never deleted or reposted. */
@Service
public class MoneyRegistrationService {
 private final JdbcTemplate db;private final CurrentUserProvider users;private final ObjectMapper json;private final MoneyService money;private final MoneyCommandService commands;
 public MoneyRegistrationService(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,MoneyService money,MoneyCommandService commands){this.db=db;this.users=users;this.json=json;this.money=money;this.commands=commands;}
 public record Change(UUID requestId,Long expectedVersion,UUID cancellationId,Long expectedLoanVersion){}
 private UUID owner(){return users.getCurrentUserId();}
 private Map<String,Object> object(Object value){return json.readValue(value.toString(),Map.class);}
 private Map<String,Object> fact(UUID id){var rows=db.queryForList("select * from money_transactions where user_id=? and id=? for update",owner(),id);if(rows.isEmpty())throw new ResourceNotFoundException("소유 거래를 찾을 수 없습니다.");return rows.getFirst();}
 private void guard(Map<String,Object> row,boolean restore){
  require(row.get("merged_into")==null,"연결된 이체의 원래 행은 개별 취소·복원할 수 없습니다. 대표 이체를 선택하세요.");
  require(!Set.of("INITIAL_BALANCE","BALANCE_ADJUSTMENT").contains(row.get("type")),"잔액 기준 거래는 전용 잔액 정정에서 처리하세요.");
  UUID id=(UUID)row.get("id");
  if(!restore)require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transactions where user_id=? and refund_of=? and not excluded)",Boolean.class,owner(),id)),"연결된 활성 환불을 먼저 취소하세요.");
  if(restore&&row.get("refund_of")!=null){
   var original=fact((UUID)row.get("refund_of"));require("EXPENSE".equals(original.get("type"))&&!Boolean.TRUE.equals(original.get("excluded")),"원래 지출을 먼저 복원하세요.");
   require(Objects.equals(original.get("currency"),row.get("currency")),"환불과 원래 지출의 통화가 다릅니다.");
   BigDecimal refunded=db.queryForObject("select coalesce(sum(amount),0) from money_transactions where user_id=? and refund_of=? and not excluded",BigDecimal.class,owner(),row.get("refund_of"));
   require(refunded.add((BigDecimal)row.get("amount")).compareTo((BigDecimal)original.get("amount"))<=0,"복원할 환불이 원래 지출의 남은 금액을 초과합니다.");
  }
  // One TRANSFER fact owns both account directions. Merged source legs stay excluded throughout.
  if("TRANSFER".equals(row.get("type")))require(row.get("from_account_id")!=null&&row.get("to_account_id")!=null&&!row.get("from_account_id").equals(row.get("to_account_id")),"이체 양쪽 계좌가 필요합니다.");
 }
 public Map<String,Object> change(UUID id,Change input,boolean restore){
  require(input!=null&&input.expectedVersion()!=null,"거래 버전과 원래 요청 ID가 필요합니다.");
  return commands.execute(owner(),input.requestId(),restore?"RESTORE_REGISTRATION":"CANCEL_REGISTRATION",Arrays.asList(id,input),()->{
   var row=fact(id);MoneyMeaningService.version(((Number)row.get("version")).longValue(),input.expectedVersion());
   require(Boolean.TRUE.equals(row.get("excluded"))==restore,restore?"현재 취소된 거래만 복원할 수 있습니다.":"이미 제외된 거래는 새로 취소할 수 없습니다.");
   guard(row,restore);
   UUID cancellationId;
   if(restore){
    require(input.cancellationId()!=null,"원래 등록 취소 이력이 필요합니다.");var events=db.queryForList("select payload::text from money_ai_events where user_id=? and subject_id=? and id=? and kind='REGISTRATION_CANCELLED'",owner(),id,input.cancellationId());require(events.size()==1,"소유한 원래 취소 이력을 확인해 주세요.");
    var event=object(events.getFirst().get("payload"));require(((Number)event.get("cancelledVersion")).longValue()==input.expectedVersion(),"취소 이후 금융 거래가 변경되었습니다. 기존 취소 이력으로 복원할 수 없습니다.");
    require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_ai_events where user_id=? and subject_id=? and kind='REGISTRATION_RESTORED' and payload->>'cancellationId'=?)",Boolean.class,owner(),id,input.cancellationId().toString())),"이미 복원된 취소 이력입니다.");cancellationId=input.cancellationId();
   }else cancellationId=UUID.randomUUID();
   var evidence=new LinkedHashMap<String,Object>();evidence.put("transaction",money.transaction(id));evidence.put("cancellationId",cancellationId);evidence.put("beforeVersion",row.get("version"));evidence.put("cancelledVersion",input.expectedVersion()+1);evidence.put("requestId",input.requestId());if(!restore)try{var product=new MoneyProductService(db,users,money,json);evidence.put("book",new MoneyWebService(db,users,money,product,json).bookkeepingRow(id));}catch(ResourceNotFoundException ignored){/* Transfers and non-Bookkeeping facts retain the canonical transaction snapshot. */}
   if(row.get("loan_id")!=null){
    var loans=db.queryForList("select id,version,status,remaining_principal from money_loans where user_id=? and id=? for update",owner(),row.get("loan_id"));require(loans.size()==1,"대출 소유권을 확인해 주세요.");var loan=loans.getFirst();require(input.expectedLoanVersion()!=null,"대출 잔액 버전 확인이 필요합니다.");MoneyMeaningService.version(((Number)loan.get("version")).longValue(),input.expectedLoanVersion());
    var principal=row.get("principal")==null?BigDecimal.ZERO:(BigDecimal)row.get("principal");var remaining=((BigDecimal)loan.get("remaining_principal")).add(restore?principal.negate():principal);
    require(remaining.signum()>=0,"복원 원금이 대출 잔여 원금을 초과합니다.");require(!"INACTIVE".equals(loan.get("status"))&&(!"COMPLETED".equals(loan.get("status"))||remaining.signum()==0),"대출 상태를 전용 화면에서 먼저 확인하세요.");
    evidence.put("loanBefore",loan);db.update("update money_loans set remaining_principal=?,version=version+1,updated_at=now() where user_id=? and id=?",remaining,owner(),loan.get("id"));
   }
   db.update("update money_transactions set excluded=?,version=version+1 where user_id=? and id=?",!restore,owner(),id);
   // Retain original Review completion and classification decisions against the new fact version.
   db.update("update money_review_decisions set transaction_version=? where user_id=? and transaction_id=? and transaction_version=?",input.expectedVersion()+1,owner(),id,input.expectedVersion());
   db.update("update money_classification_jobs set status='PROTECTED',result=cast(? as jsonb),updated_at=now() where user_id=? and transaction_id=?",json.writeValueAsString(Map.of("reason",restore?"REGISTRATION_RESTORED_EXPLICIT_AI_ONLY":"REGISTRATION_CANCELLED")),owner(),id);
   UUID eventId=restore?UUID.randomUUID():cancellationId;
   db.update("insert into money_ai_events(id,user_id,subject_id,kind,payload) values(?,?,?,?,cast(? as jsonb))",eventId,owner(),id,restore?"REGISTRATION_RESTORED":"REGISTRATION_CANCELLED",json.writeValueAsString(evidence));
   return Map.of("transaction",money.transaction(id),"eventId",eventId,"cancellationId",cancellationId,"active",restore);
  });
 }
 @Transactional(readOnly=true) public Map<String,Object> history(UUID id){money.transaction(id);var rows=db.queryForList("select id,kind,payload::text,created_at as \"createdAt\" from money_ai_events where user_id=? and subject_id=? and kind in ('REGISTRATION_CANCELLED','REGISTRATION_RESTORED') order by created_at,id",owner(),id);rows.forEach(r->{r.put("payload",object(r.get("payload")));r.replaceAll((k,v)->v instanceof Timestamp t?t.toInstant():v);});return Map.of("items",rows);}
 @Transactional(readOnly=true) public Map<String,Object> context(UUID id){money.transaction(id);var rows=db.queryForList("select t.version,t.loan_id as \"loanId\",l.version as \"loanVersion\" from money_transactions t left join money_loans l on l.user_id=t.user_id and l.id=t.loan_id where t.user_id=? and t.id=?",owner(),id);return rows.getFirst();}
 @Transactional(readOnly=true) public Map<String,Object> cancelled(String search,String from,String to,UUID accountId,UUID categoryId,int offset){
  MoneyService.page(50,offset);MoneyService.text(search,200,false,"검색");var args=new ArrayList<Object>(List.of(owner()));String where=" from money_ai_events e join money_transactions t on t.user_id=e.user_id and t.id=e.subject_id left join money_bookkeeping_overrides b on b.user_id=t.user_id and b.transaction_id=t.id and b.slot=0 where e.user_id=? and e.kind='REGISTRATION_CANCELLED' and t.excluded and not exists(select 1 from money_ai_events r where r.user_id=e.user_id and r.subject_id=e.subject_id and r.kind='REGISTRATION_RESTORED' and r.payload->>'cancellationId'=e.id::text)";
  if(search!=null&&!search.isBlank()){where+=" and position(lower(?) in lower(coalesce(t.title,'')||' '||coalesce(t.memo,'')||' '||coalesce(t.counterparty_text,'')||' '||coalesce(b.overrides->>'title','')||' '||coalesce(b.overrides->>'memo','')))>0";args.add(search);}
  var zone=java.time.ZoneId.of("Asia/Seoul");
  if(from!=null){where+=" and t.occurred_at>=?";args.add(Timestamp.from(java.time.LocalDate.parse(from).atStartOfDay(zone).toInstant()));}
  if(to!=null){where+=" and t.occurred_at<?";args.add(Timestamp.from(java.time.LocalDate.parse(to).plusDays(1).atStartOfDay(zone).toInstant()));}
  if(accountId!=null){where+=" and (t.from_account_id=? or t.to_account_id=?)";args.add(accountId);args.add(accountId);}
  if(categoryId!=null){where+=" and case when jsonb_exists(e.payload,'book') then (e.payload->'book'->>'categoryId')::uuid when jsonb_exists(b.overrides,'categoryId') then (b.overrides->>'categoryId')::uuid else t.category_id end=?";args.add(categoryId);}
  long total=db.queryForObject("select count(*)"+where,Long.class,args.toArray());args.add(offset);
  var rows=db.queryForList("select t.id,e.id as \"cancellationId\",t.version,t.type,t.amount,t.currency,t.occurred_at as \"occurredAt\",coalesce(e.payload->'book'->>'title',b.overrides->>'title',t.title,t.counterparty_text) title,case when jsonb_exists(e.payload,'book') then e.payload->'book'->>'memo' when jsonb_exists(b.overrides,'memo') then b.overrides->>'memo' else t.memo end memo,t.from_account_id as \"fromAccountId\",t.to_account_id as \"toAccountId\",case when jsonb_exists(e.payload,'book') then (e.payload->'book'->>'categoryId')::uuid when jsonb_exists(b.overrides,'categoryId') then (b.overrides->>'categoryId')::uuid else t.category_id end as \"categoryId\",e.created_at as \"cancelledAt\",e.payload::text as evidence"+where+" order by e.created_at desc,e.id limit 50 offset ?",args.toArray());
  rows.forEach(r->{r.put("evidence",object(r.get("evidence")));r.replaceAll((k,v)->v instanceof Timestamp t?t.toInstant():v);});return Map.of("items",rows,"total",total);
 }
}
