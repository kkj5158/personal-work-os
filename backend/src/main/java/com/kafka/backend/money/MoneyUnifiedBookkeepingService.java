package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyService.require;

/** Commands mutate the existing fact, never a shadow ledger or a second cash posting. */
@Service
public class MoneyUnifiedBookkeepingService {
 private final JdbcTemplate db; private final CurrentUserProvider users; private final ObjectMapper json;
 private final MoneyService money; private final MoneyProductService product; private final MoneyWebService web;
 private final MoneyFinancialService financial; private final MoneyCommandService commands;
 public MoneyUnifiedBookkeepingService(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,MoneyService money,MoneyProductService product,MoneyWebService web,MoneyFinancialService financial,MoneyCommandService commands){this.db=db;this.users=users;this.json=json;this.money=money;this.product=product;this.web=web;this.financial=financial;this.commands=commands;}
 public record Edit(UUID requestId,Long expectedVersion,String action,String type,UUID otherId,Long otherVersion,UUID loanId,Long loanVersion,BigDecimal principal,BigDecimal interest,BigDecimal fee,UUID refundOf,UUID accountId,BigDecimal amount,Instant occurredAt,String reason,UUID undoId){}
 public record BulkItem(UUID id,Long version,UUID requestId){}
 public record Bulk(String type,List<BulkItem> items){}
 public record Admit(UUID requestId,Long expectedVersion){}
 private UUID owner(){return users.getCurrentUserId();}
 private Map<String,Object> fact(UUID id){var found=db.queryForList("select * from money_transactions where user_id=? and id=?",owner(),id);if(found.isEmpty())throw new ResourceNotFoundException("소유 거래를 찾을 수 없습니다.");return found.getFirst();}
 private void version(Map<String,Object> row,Long expected){MoneyMeaningService.version(((Number)row.get("version")).longValue(),expected);}
 private String state(UUID id){return fact(id).get("meaning_state").toString();}
 private void active(Map<String,Object> row){require(!Boolean.TRUE.equals(row.get("excluded"))&&row.get("merged_into")==null,"취소·연결된 원본 거래는 변경할 수 없습니다.");require("KRW".equals(row.get("currency")),"지원되지 않는 통화는 전용 금융 확인이 필요합니다.");}
 private void reason(String reason){MoneyService.text(reason,500,true,"정정 사유");}
 private List<Map<String,Object>> sources(UUID id){return db.queryForList("select raw_event_id,parse_attempt_id,relationship,evidence::text from money_transaction_sources where user_id=? and transaction_id=? order by raw_event_id",owner(),id);}
 private Map<String,Object> clean(Map<String,Object> row){var out=new LinkedHashMap<>(row);out.remove("user_id");out.replaceAll((k,v)->v instanceof Timestamp t?t.toInstant():v);return out;}
 private UUID audit(UUID id,String action,Object before,Object after){UUID key=UUID.randomUUID();db.update("insert into money_meaning_audit(id,user_id,subject_id,action,previous_value,next_value) values(?,?,?,?,cast(? as jsonb),cast(? as jsonb))",key,owner(),id,action,json.writeValueAsString(before),json.writeValueAsString(after));return key;}
 @Transactional(readOnly=true) public Map<String,Object> row(UUID id){var t=clean(fact(id));t.put("sources",sources(id));t.put("sourceCount",((List<?>)t.get("sources")).size());var books=db.queryForList(MoneyWebService.BOOK_BASE+"select * from effective where id=?",owner(),id);if(!books.isEmpty())t.put("book",web.decodeBook(clean(books.getFirst())));return t;}
 @Transactional(readOnly=true) public Map<String,Object> ledger(String from,String to,boolean unresolved,String search,String accountIds,int limit,int offset){return ledger(from,to,unresolved,search,accountIds,limit,offset,null,null,null,null);}
 @Transactional(readOnly=true) public Map<String,Object> ledger(String from,String to,boolean unresolved,String search,String accountIds,int limit,int offset,String categoryIds,String type,BigDecimal minAmount,BigDecimal maxAmount){
  MoneyService.page(limit,offset);MoneyService.text(search,200,false,"검색");var args=new ArrayList<Object>(List.of(owner()));String where=" from money_transactions t where t.user_id=? and t.merged_into is null and not t.excluded";
  if(unresolved)where+=" and t.meaning_state='UNRESOLVED'";
  else{var a=LocalDate.parse(from);var b=LocalDate.parse(to);require(!a.isAfter(b),"기간을 확인하세요.");where+=" and t.occurred_at>=? and t.occurred_at<?";args.add(Timestamp.from(a.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()));args.add(Timestamp.from(b.plusDays(1).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()));}
  if(search!=null&&!search.isBlank()){where+=" and position(lower(?) in lower(coalesce(t.title,'')||' '||coalesce(t.memo,'')||' '||coalesce(t.counterparty_text,'')))>0";args.add(search);}
  if(accountIds!=null){var ids=Arrays.stream(accountIds.split(",")).filter(s->!s.isBlank()).map(UUID::fromString).toArray(UUID[]::new);where+=" and (t.from_account_id=any(?) or t.to_account_id=any(?))";args.add(ids);args.add(ids);}
  if(categoryIds!=null){var ids=Arrays.stream(categoryIds.split(",")).filter(v->!v.isBlank()).map(UUID::fromString).toArray(UUID[]::new);where+=" and t.id in ("+MoneyWebService.BOOK_BASE+" select id from effective where \"categoryId\"=any(?))";args.add(owner());args.add(ids);}
  if(type!=null&&!type.isBlank()){require(Arrays.stream(TransactionType.values()).anyMatch(t->t.name().equals(type)),"금융 유형 필터를 확인하세요.");where+=" and t.type=?";args.add(type);}
  MoneyWebRevisionService.amountRange(minAmount,maxAmount);if(minAmount!=null){where+=" and t.amount>=?";args.add(minAmount);}if(maxAmount!=null){where+=" and t.amount<=?";args.add(maxAmount);}
  long count=db.queryForObject("select count(*)"+where,Long.class,args.toArray());args.add(limit);args.add(offset);
  var items=db.queryForList("select t.*"+where+" order by t.occurred_at desc,t.id limit ? offset ?",args.toArray()).stream().map(this::clean).toList();
  if(!items.isEmpty()){
   var ids=items.stream().map(i->(UUID)i.get("id")).toArray(UUID[]::new);var books=new HashMap<UUID,Map<String,Object>>();
   for(var b:db.queryForList(MoneyWebService.BOOK_BASE+"select * from effective where id=any(?)",owner(),ids))books.put((UUID)b.get("id"),web.decodeBook(clean(b)));
   var sourceMap=new HashMap<UUID,List<Map<String,Object>>>();for(var source:db.queryForList("select transaction_id,raw_event_id,parse_attempt_id,relationship,evidence::text from money_transaction_sources where user_id=? and transaction_id=any(?) order by raw_event_id",owner(),ids)){UUID key=(UUID)source.remove("transaction_id");sourceMap.computeIfAbsent(key,k->new ArrayList<>()).add(source);}
   for(var item:items){UUID key=(UUID)item.get("id");var links=sourceMap.getOrDefault(key,List.of());item.put("sources",links);item.put("sourceCount",links.size());if(books.containsKey(key))item.put("book",books.get(key));}
  }
  return Map.of("items",items,"total",count,"pending",pending());
 }
 @Transactional(readOnly=true) public Map<String,Object> pending(){return db.queryForMap("select count(*) as count,coalesce(sum(amount) filter(where from_account_id is not null),0) as outgoing,coalesce(sum(amount) filter(where to_account_id is not null),0) as incoming,(select count(*) from money_transactions where user_id=? and type='LOAN_PAYMENT' and principal is null and not excluded) as \"loanSplitPending\" from money_transactions where user_id=? and meaning_state='UNRESOLVED' and not excluded and merged_into is null",owner(),owner());}
 public Map<String,Object> outcome(UUID id){return commands.outcome(owner(),id);}
 @Transactional(readOnly=true) public Map<String,Object> candidates(UUID id,String kind,String search){
  var t=money.transaction(id);require(Set.of("REFUND","TRANSFER").contains(kind),"연결 종류를 확인하세요.");MoneyService.text(search,200,false,"연결 후보 검색");
  var args=new ArrayList<Object>(List.of(owner(),id,t.currency()));String where=" from money_transactions t where t.user_id=? and t.id<>? and t.currency=? and not t.excluded and t.merged_into is null";
  if(kind.equals("REFUND")){where+=" and t.type='EXPENSE' and t.meaning_state='CONFIRMED' and t.occurred_at<=? and t.amount-coalesce((select sum(r.amount) from money_transactions r where r.user_id=t.user_id and r.refund_of=t.id and not r.excluded and r.id<>?),0)>=?";args.add(Timestamp.from(t.occurredAt()));args.add(id);args.add(t.amount());}
  else{where+=" and t.amount=?";args.add(t.amount());if(t.fromAccountId()!=null){where+=" and t.from_account_id is null and t.to_account_id is not null and t.to_account_id<>? and t.type in ('INCOME','TRANSFER')";args.add(t.fromAccountId());}else{where+=" and t.to_account_id is null and t.from_account_id is not null and t.from_account_id<>? and t.type in ('EXPENSE','TRANSFER')";args.add(t.toAccountId());}}
  where+=" and position(lower(?) in lower(coalesce(t.title,'')||' '||coalesce(t.counterparty_text,'')))>0";args.add(search==null?"":search);
  return Map.of("items",db.queryForList("select t.id,t.version,t.title,t.counterparty_text as \"counterpartyText\",t.amount,t.occurred_at as \"occurredAt\",coalesce(t.from_account_id,t.to_account_id) as \"accountId\""+where+" order by t.occurred_at desc,t.id limit 50",args.toArray()).stream().map(this::clean).toList());
 }
 public Map<String,Object> edit(UUID id,Edit input){require(input!=null&&input.action()!=null,"변경 내용이 필요합니다.");return commands.execute(owner(),input.requestId(),"UNIFIED_"+input.action(),Arrays.asList(id,input),()->{
  var before=fact(id);version(before,input.expectedVersion());active(before);UUID undo=null;
  switch(input.action()){
   case "TYPE" -> type(id,input,before);
   case "CORRECT" -> correct(id,input,before);
   case "LINK_TRANSFER" -> link(id,input,before);
   case "UNLINK_TRANSFER" -> undo=unlink(id,before);
   case "UNDO_UNLINK" -> undoUnlink(id,input);
   case "ATTACH_SOURCE" -> attach(id,input,before);
   default -> throw new InvalidRequestException("지원하지 않는 금융 행동입니다.");
  }
  var result=new LinkedHashMap<String,Object>();result.put("row",row(id));if(undo!=null)result.put("undoId",undo);
  audit(id,"UNIFIED_"+input.action(),clean(before),result);return result;
 });}
 private void type(UUID id,Edit v,Map<String,Object> before){
  require(v.type()!=null,"금융 유형을 선택하세요.");TransactionType type;try{type=TransactionType.valueOf(v.type());}catch(IllegalArgumentException e){throw new InvalidRequestException("지원하지 않는 금융 유형입니다.");}
  var old=money.transaction(id);boolean out=old.fromAccountId()!=null&&old.toAccountId()==null,in=old.toAccountId()!=null&&old.fromAccountId()==null;
  require(out||in,"연결된 이체는 먼저 연결을 해제하세요.");
  require(out?Set.of(TransactionType.EXPENSE,TransactionType.TRANSFER,TransactionType.LOAN_PAYMENT).contains(type):Set.of(TransactionType.INCOME,TransactionType.REFUND,TransactionType.TRANSFER).contains(type),"입출금 방향에 맞는 유형을 선택하세요.");
  require(!Set.of(TransactionType.INITIAL_BALANCE,TransactionType.BALANCE_ADJUSTMENT,TransactionType.LOAN_RECEIPT).contains(old.type()),"전용 금융 정정이 필요합니다.");
  if(type==TransactionType.LOAN_PAYMENT){
   require(old.type()==TransactionType.EXPENSE||old.type()==TransactionType.LOAN_PAYMENT,"대출 상환으로 정정할 수 없는 거래입니다.");
   // Resolve semantic state in the same transaction before the existing financial service validates the split.
   db.update("update money_transactions set meaning_state='CONFIRMED' where user_id=? and id=?",owner(),id);
   financial.payment(id,new MoneyFinancialService.PaymentInput(v.loanId(),old.fromAccountId(),old.amount(),v.principal(),v.interest(),v.fee(),old.occurredAt(),old.memo(),v.expectedVersion(),v.loanVersion()));return;
  }
  require(old.type()!=TransactionType.LOAN_PAYMENT,"배분된 대출 상환은 전용 대출 정정을 사용하세요.");
  require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transactions where user_id=? and refund_of=? and not excluded)",Boolean.class,owner(),id))||type==TransactionType.EXPENSE,"연결된 환불을 먼저 해제하세요.");
  if(type==TransactionType.REFUND&&v.refundOf()!=null){var original=money.transaction(v.refundOf());if(v.otherVersion()!=null)MoneyMeaningService.version(original.version(),v.otherVersion());require(original.type()==TransactionType.EXPENSE&&state(original.id()).equals("CONFIRMED")&&!original.excluded()&&original.mergedInto()==null,"확정 소비 원거래가 필요합니다.");require(original.currency().equals(old.currency())&&!old.occurredAt().isBefore(original.occurredAt()),"환불 통화·발생일을 확인하세요.");BigDecimal refunded=db.queryForObject("select coalesce(sum(amount),0) from money_transactions where user_id=? and refund_of=? and not excluded and id<>?",BigDecimal.class,owner(),original.id(),id);require(refunded.add(old.amount()).compareTo(original.amount())<=0,"구매액을 초과하는 환불은 연결할 수 없습니다. 실제 입금은 보존됩니다.");}
  db.update("update money_transactions set type=?,meaning_state='CONFIRMED',refund_of=?,category_id=case when ? then category_id else null end,version=version+1 where user_id=? and id=?",type.name(),type==TransactionType.REFUND?v.refundOf():null,type==old.type()||type==TransactionType.EXPENSE&&old.type()==TransactionType.EXPENSE,owner(),id);
  if(type==TransactionType.EXPENSE){money.applyCategoryRule(id);money.applyMeaningRules(id);}
 }
 private void correct(UUID id,Edit v,Map<String,Object> before){
  reason(v.reason());var old=money.transaction(id);require(old.type()!=TransactionType.INITIAL_BALANCE&&old.type()!=TransactionType.BALANCE_ADJUSTMENT,"관측 잔액은 전용 점검 화면에서 관리하세요.");
  UUID current=old.fromAccountId()!=null?old.fromAccountId():old.toAccountId();UUID account=v.accountId()==null?current:v.accountId();
  require(old.fromAccountId()==null||old.toAccountId()==null,"연결 이체를 먼저 해제하세요.");require(!money.account(account).archived()||account.equals(current),"보관 계좌로 이동할 수 없습니다.");
  if(!old.sources().isEmpty()){
   // Parsed bank-owned claims must corroborate a corrected account; a reason alone cannot erase them.
   if(!account.equals(current))for(var s:old.sources()){require(s.parseAttemptId()!=null,"원본 은행 계좌 근거를 먼저 확인하세요.");var attempt=money.attempts(s.rawEventId()).stream().filter(a->a.id().equals(s.parseAttemptId())).findFirst().orElseThrow();var c=attempt.candidate();require(c!=null&&c.direction()!=null,"원본 은행 계좌 근거가 불충분합니다.");var resolved=new MoneyAccountResolver().resolve(money.accounts(),c.provider(),c.direction()==Direction.OUT?c.sourceAccountHint():c.destinationAccountHint());require(resolved.resolved()&&resolved.account().id().equals(account),"원본 은행 계좌 근거와 충돌합니다. 사실 검토가 필요합니다.");}
   if(v.amount()!=null&&v.amount().compareTo(old.amount())!=0||v.occurredAt()!=null&&!v.occurredAt().equals(old.occurredAt()))for(var source:old.sources()){
    require(source.parseAttemptId()!=null,"정정할 은행 원본 근거가 필요합니다.");var attempt=money.attempts(source.rawEventId()).stream().filter(a->a.id().equals(source.parseAttemptId())).findFirst().orElseThrow();var candidate=attempt.candidate();require(candidate!=null&&MoneyOrdinaryAdmission.domestic(candidate),"정정할 은행 원본 근거가 불충분합니다.");
    require(v.amount()==null||candidate.amount().compareTo(v.amount())==0,"정정 금액이 원본 은행 근거와 충돌합니다.");require(v.occurredAt()==null||candidate.occurredAt().equals(v.occurredAt()),"정정 시각이 원본 은행 근거와 충돌합니다.");
   }
  }
  BigDecimal amount=v.amount()==null?old.amount():v.amount();MoneyService.amount(amount);Instant at=v.occurredAt()==null?old.occurredAt():v.occurredAt();require(at!=null&&at.isBefore(Instant.now().plusSeconds(300)),"발생시각을 확인하세요.");
  require(old.type()!=TransactionType.LOAN_PAYMENT&&old.type()!=TransactionType.LOAN_RECEIPT,"대출 계좌·금액 정정은 대출 정정 서비스를 사용하세요.");
  if(old.type()==TransactionType.TRANSFER){db.update("update money_transactions set from_account_id=?,to_account_id=?,amount=?,occurred_at=?,version=version+1 where user_id=? and id=?",old.fromAccountId()==null?null:account,old.toAccountId()==null?null:account,amount,Timestamp.from(at),owner(),id);}else {
  var entry=new MoneyProductService.Entry(old.type(),old.fromAccountId()==null?null:account,old.toAccountId()==null?null:account,amount,at,old.counterpartyText(),old.categoryId(),old.memo(),false,old.refundOf(),old.version(),old.title());product.save(id,entry);}
  audit(id,"RECONCILIATION_RANGE_INVALIDATED",Map.of("account",current,"occurredAt",old.occurredAt()),Map.of("account",account,"occurredAt",at,"reason",v.reason()));
 }
 private void link(UUID id,Edit v,Map<String,Object> before){
  reason(v.reason());require(v.otherId()!=null&&!id.equals(v.otherId()),"실제 반대편 거래를 선택하세요.");var other=fact(v.otherId());version(other,v.otherVersion());active(other);
  var a=money.transaction(id);var b=money.transaction(v.otherId());
  require(a.amount().compareTo(b.amount())==0&&a.currency().equals(b.currency()),"양쪽 실제 금액·통화가 일치해야 합니다.");
  var out=a.fromAccountId()!=null&&a.toAccountId()==null?a:b;var in=a.toAccountId()!=null&&a.fromAccountId()==null?a:b;
  require(out.fromAccountId()!=null&&out.toAccountId()==null&&in.fromAccountId()==null&&in.toAccountId()!=null&&!out.id().equals(in.id())&&!out.fromAccountId().equals(in.toAccountId()),"다른 소유 계좌의 실제 출금·입금이 필요합니다.");
  require(Set.of(TransactionType.EXPENSE,TransactionType.TRANSFER).contains(out.type())&&Set.of(TransactionType.INCOME,TransactionType.TRANSFER).contains(in.type()),"대출·환불은 이체로 합칠 수 없습니다.");
  require(db.queryForObject("select count(*) from money_transactions where user_id=? and refund_of in (?,?) and not excluded",Integer.class,owner(),id,b.id())==0,"환불 연결을 먼저 확인하세요.");
  audit(id,"UNIFIED_LINK_SNAPSHOT",List.of(clean(before),clean(other)),Map.of("sourcesA",sources(id),"sourcesB",sources(b.id())));
  db.update("update money_transactions set type='TRANSFER',meaning_state='CONFIRMED',from_account_id=?,to_account_id=?,category_id=null,version=version+1 where user_id=? and id=?",out.fromAccountId(),in.toAccountId(),owner(),id);
  db.update("update money_transaction_sources set transaction_id=? where user_id=? and transaction_id=?",id,owner(),b.id());
  db.update("update money_transactions set excluded=true,merged_into=?,version=version+1 where user_id=? and id=?",id,owner(),b.id());
 }
 private UUID unlink(UUID id,Map<String,Object> before){
  var t=money.transaction(id);require(t.type()==TransactionType.TRANSFER&&t.fromAccountId()!=null&&t.toAccountId()!=null,"양쪽이 연결된 이체만 해제할 수 있습니다.");
  var merged=db.queryForList("select id from money_transactions where user_id=? and merged_into=?",UUID.class,owner(),id);require(merged.size()<=1,"연결 종속 거래가 여러 개입니다. 사실 검토가 필요합니다.");
  UUID second=merged.isEmpty()?UUID.randomUUID():merged.getFirst();var originalSources=sources(id);
  // Each original balance leg remains present once, with independent unresolved meaning.
  db.update("update money_transactions set type='EXPENSE',meaning_state='UNRESOLVED',to_account_id=null,category_id=null,version=version+1 where user_id=? and id=?",owner(),id);
  if(merged.isEmpty())db.update("insert into money_transactions(id,user_id,type,meaning_state,to_account_id,amount,currency,occurred_at,counterparty_text,manual) values(?,?,'INCOME','UNRESOLVED',?,?,?,?,?,?)",second,owner(),t.toAccountId(),t.amount(),t.currency(),Timestamp.from(t.occurredAt()),t.counterpartyText(),t.manual());
  else db.update("update money_transactions set type='INCOME',meaning_state='UNRESOLVED',from_account_id=null,to_account_id=?,excluded=false,merged_into=null,category_id=null,version=version+1 where user_id=? and id=?",t.toAccountId(),owner(),second);
  db.update("update money_transaction_sources s set transaction_id=? from money_parse_attempts p where s.user_id=? and s.transaction_id=? and p.id=s.parse_attempt_id and p.user_id=s.user_id and p.direction='IN'",second,owner(),id);
  return audit(id,"UNIFIED_UNLINK_UNDO",clean(before),Map.of("second",second,"firstVersion",fact(id).get("version"),"secondVersion",fact(second).get("version"),"sources",originalSources));
 }
 private void undoUnlink(UUID id,Edit v){
  require(v.undoId()!=null,"원래 연결 해제 이력이 필요합니다.");var events=db.queryForList("select previous_value::text,next_value::text from money_meaning_audit where user_id=? and subject_id=? and id=? and action='UNIFIED_UNLINK_UNDO'",owner(),id,v.undoId());require(events.size()==1,"소유한 연결 해제 이력이 필요합니다.");
  var before=json.readValue(events.getFirst().get("previous_value").toString(),Map.class);var after=json.readValue(events.getFirst().get("next_value").toString(),Map.class);UUID second=UUID.fromString(after.get("second").toString());version(fact(id),((Number)after.get("firstVersion")).longValue());version(fact(second),((Number)after.get("secondVersion")).longValue());
  require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transactions where user_id=? and refund_of in (?,?) and not excluded)",Boolean.class,owner(),id,second)),"새 환불이 연결되어 Undo할 수 없습니다.");active(fact(second));
  db.update("update money_transactions set type='TRANSFER',meaning_state='CONFIRMED',from_account_id=?,to_account_id=?,version=version+1 where user_id=? and id=?",UUID.fromString(before.get("from_account_id").toString()),UUID.fromString(before.get("to_account_id").toString()),owner(),id);
  db.update("update money_transaction_sources set transaction_id=? where user_id=? and transaction_id=?",id,owner(),second);
  db.update("update money_transactions set excluded=true,merged_into=?,version=version+1 where user_id=? and id=?",id,owner(),second);
 }
 private void attach(UUID id,Edit v,Map<String,Object> before){
  reason(v.reason());require(v.otherId()!=null,"원본 알림이 필요합니다.");require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transaction_sources where user_id=? and raw_event_id=?)",Boolean.class,owner(),v.otherId())),"이미 금융 사실에 연결된 알림입니다.");var raw=money.notification(v.otherId());MoneyMeaningService.version(raw.processingVersion(),v.otherVersion());var attempts=money.attempts(raw.id());require(!attempts.isEmpty(),"파싱 근거가 필요합니다.");var a=attempts.getLast();var c=a.candidate();var t=money.transaction(id);
  require(c!=null&&MoneyOrdinaryAdmission.domestic(c)&&c.amount().compareTo(t.amount())==0&&"KRW".equals(t.currency())&&c.occurredAt().equals(t.occurredAt()),"금액·발생시각이 검증된 동일 금융 사실이어야 합니다.");
  UUID account=c.direction()==Direction.OUT?t.fromAccountId():t.toAccountId();var resolved=new MoneyAccountResolver().resolve(money.accounts(),c.provider(),c.direction()==Direction.OUT?c.sourceAccountHint():c.destinationAccountHint());require(account!=null&&resolved.resolved()&&account.equals(resolved.account().id()),"같은 소유 계좌·방향의 원본 근거가 필요합니다.");
  // Explicit owner attestation is additional evidence; similarity is never an automatic match.
  db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,parse_attempt_id,relationship,evidence) values(?,?,?,?,'AUXILIARY',cast(? as jsonb))",id,owner(),raw.id(),a.id(),json.writeValueAsString(Map.of("rule","OWNER_CONFIRMED_SAME_FACT","reason",v.reason())));
  money.finishProcessing(raw.id(),ProcessingState.PROCESSED,"ATTACHED_EXISTING_FACT");db.update("update money_transactions set version=version+1 where user_id=? and id=?",owner(),id);
 }
 public Map<String,Object> admit(UUID rawId,Admit v){require(v!=null,"요청이 필요합니다.");return commands.execute(owner(),v.requestId(),"ADMIT_VERIFIED_CASH",Arrays.asList(rawId,v),()->{
  var raw=money.notification(rawId);MoneyMeaningService.version(raw.processingVersion(),v.expectedVersion());require(raw.state()!=ProcessingState.PROCESSED,"이미 처리된 원본입니다.");var attempts=money.attempts(rawId);require(!attempts.isEmpty(),"검증된 파싱 근거가 필요합니다.");var a=attempts.getLast();var c=a.candidate();require(c!=null&&MoneyOrdinaryAdmission.domestic(c)&&c.direction()!=null&&c.amount()!=null&&c.amount().signum()>0&&c.occurredAt()!=null&&c.postedAt()!=null&&c.timeSource()!=null&&"KRW".equals(MoneyOrdinaryAdmission.currency(c)),"현금 사실 검증이 불충분합니다.");
  var account=new MoneyAccountResolver().resolve(money.accounts(),c.provider(),c.direction()==Direction.OUT?c.sourceAccountHint():c.destinationAccountHint());require(account.resolved(),"소유 계좌 확인이 필요합니다.");
  require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transactions where user_id=? and amount=? and not excluded and (from_account_id=? or to_account_id=?) and occurred_at between ? and ?)",Boolean.class,owner(),c.amount(),account.account().id(),account.account().id(),Timestamp.from(c.occurredAt().minusSeconds(90)),Timestamp.from(c.occurredAt().plusSeconds(90)))),"기존 거래와 중복 가능성이 있습니다. 원본 연결을 확인하세요.");
  UUID id=money.recordReviewTransactionId(new TransactionInput(c.direction()==Direction.OUT?TransactionType.EXPENSE:TransactionType.INCOME,c.direction()==Direction.OUT?account.account().id():null,c.direction()==Direction.IN?account.account().id():null,c.amount(),"KRW",c.occurredAt(),c.counterpartyText(),List.of(new TransactionSource(rawId,a.id(),SourceRelationship.PRIMARY,Map.of("rule","VERIFIED_CASH_UNRESOLVED","direction",c.direction().name())))));
  db.update("update money_transactions set meaning_state='UNRESOLVED' where user_id=? and id=?",owner(),id);money.finishProcessing(rawId,ProcessingState.PROCESSED,"VERIFIED_CASH_UNRESOLVED");audit(id,"VERIFIED_CASH_ADMITTED",Map.of("rawId",rawId),row(id));return Map.of("row",row(id));
 });}
 private String eligibility(BulkItem i,String type){try{var t=fact(i.id());version(t,i.version());active(t);if(!"UNRESOLVED".equals(t.get("meaning_state")))return "유형이 이미 확정되었습니다.";if(!Set.of("EXPENSE","INCOME").contains(type))return "일괄 변경은 소비·수입 확정만 지원합니다.";if(type.equals("EXPENSE")?(t.get("from_account_id")==null||t.get("to_account_id")!=null):(t.get("to_account_id")==null||t.get("from_account_id")!=null))return "입출금 방향이 맞지 않습니다.";return "";}catch(ResourceNotFoundException|OptimisticLockConflictException|InvalidRequestException e){return e.getMessage();}}
 public Map<String,Object> bulk(Bulk v,boolean apply){require(v!=null&&v.items()!=null&&!v.items().isEmpty()&&v.items().size()<=100&&v.items().stream().allMatch(i->i!=null&&i.id()!=null)&&v.items().stream().map(BulkItem::id).distinct().count()==v.items().size(),"중복 없는 1~100개 거래를 선택하세요.");var rows=new ArrayList<Map<String,Object>>();for(var i:v.items()){if(apply&&i.requestId()!=null){var prior=outcome(i.requestId());if(!prior.get("status").equals("UNKNOWN")){rows.add(Map.of("id",i.id(),"eligible",true,"outcome",prior));continue;}}String excluded=eligibility(i,v.type());if(!excluded.isEmpty())rows.add(Map.of("id",i.id(),"eligible",false,"reason",excluded));else if(!apply)rows.add(Map.of("id",i.id(),"eligible",true));else rows.add(Map.of("id",i.id(),"eligible",true,"outcome",edit(i.id(),new Edit(i.requestId(),i.version(),"TYPE",v.type(),null,null,null,null,null,null,null,null,null,null,null,null,null))));}return Map.of("items",rows);}
}
