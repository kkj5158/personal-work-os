package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyService.require;
import static com.kafka.backend.money.MoneyTypes.*;

/** Source-bounded pre-opening replay and cash-neutral Review completion. Ordinary reconciliation stays capped at 50. */
public final class MoneyRemainingCloseoutService {
 static final String POLICY="money-pre-opening-closeout-v1";
 static final ZoneId SEOUL=ZoneId.of("Asia/Seoul");
 static final Set<String> ACTIONS=Set.of("HISTORY_CASH","HISTORY_TRANSFER","HISTORY_DELAYED_TRANSFER","HISTORY_COMPLETE_TRANSFER","LINK_EXISTING_TRANSFER","LINK_UNTRACKED_TRANSFER","LINK_SOURCE","REPAIR_SOURCE_LINK","BANK_INTERNAL_PAIR","UNDO");
 public record Operation(String action,UUID rowId,UUID pairedRowId,UUID transactionId,Long expectedVersion,UUID otherTransactionId,Long otherVersion,UUID rawId,Long rawVersion,UUID pairedRawId,Long pairedRawVersion,UUID checkpointId,String reason){}
 public record Plan(List<UUID> statementIds,List<Operation> operations){}
 private final CurrentUserProvider users;private final JdbcTemplate db;private final ObjectMapper json;
 private final MoneyService money;private final MoneyProductService product;private final MoneyCommandService commands;
 private final MoneyUnifiedBookkeepingService unified;private final MoneyStatementReconciliationService recon;
 private final TransactionTemplate tx,dry;
 MoneyRemainingCloseoutService(CurrentUserProvider users,JdbcTemplate db,ObjectMapper json,MoneyService money,MoneyProductService product,MoneyCommandService commands,MoneyUnifiedBookkeepingService unified,MoneyStatementReconciliationService recon,PlatformTransactionManager manager){
  this.users=users;this.db=db;this.json=json;this.money=money;this.product=product;this.commands=commands;this.unified=unified;this.recon=recon;tx=new TransactionTemplate(manager);dry=new TransactionTemplate(manager);dry.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_NESTED);
 }
 private UUID owner(){return users.getCurrentUserId();}
 private void lock(){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner());}
 private Map<String,Object> one(List<Map<String,Object>> rows){require(rows.size()==1,"EXACT_OWNED_CLOSEOUT_RECORD_REQUIRED");return rows.getFirst();}
 private static Instant at(Object value){return value instanceof Timestamp t?t.toInstant():Instant.parse(value.toString());}
 private static BigDecimal number(Object value){return new BigDecimal(value.toString());}
 private static UUID uuid(Object value){return UUID.fromString(value.toString());}
 private static boolean out(Map<String,Object> r){return "OUT".equals(r.get("direction"));}
 private static boolean day(Map<String,Object> r){return "DAY".equals(r.get("time_precision"));}
 private static Instant end(Map<String,Object> r){return day(r)?MoneyOccurrencePrecision.endOfDay(at(r.get("occurred_at"))):at(r.get("occurred_at"));}
 private static LocalDate date(Map<String,Object> r){return at(r.get("occurred_at")).atZone(SEOUL).toLocalDate();}
 private static long version(Object v){return ((Number)v).longValue();}
 private static UUID child(UUID request,UUID row){return UUID.nameUUIDFromBytes((request+":"+row).getBytes(java.nio.charset.StandardCharsets.UTF_8));}
 private record Context(Map<UUID,Map<String,Object>> rows,Map<UUID,Instant> openings,Map<UUID,String> sourceHashes,Set<UUID> synchronousRows,String from,String to){}
 private Context context(Plan plan){
  require(plan!=null&&plan.statementIds()!=null&&!plan.statementIds().isEmpty()&&plan.statementIds().size()<=5&&new HashSet<>(plan.statementIds()).size()==plan.statementIds().size(),"EXACT_ONE_TO_FIVE_SOURCE_STATEMENTS_REQUIRED");
  require(plan.operations()!=null&&!plan.operations().isEmpty()&&plan.operations().size()<=400,"BOUNDED_CLOSEOUT_MAX_400_BANK_ROWS");
  var sourceHashes=new TreeMap<UUID,String>();LocalDate first=null,last=null;
  for(UUID id:plan.statementIds()){
   var st=recon.statement(id);require("OWNER_ATTESTED_NATIVE_REPLAY".equals(st.get("verification"))||"BANK_PDF_TABLE".equals(st.get("verification")),"PREVIOUSLY_ATTESTED_OR_VERIFIED_SOURCE_REQUIRED");
   require("KRW".equals(st.get("currency")),"CLOSEOUT_KRW_ONLY");sourceHashes.put(id,Objects.toString(st.get("original_source_hash"),st.get("fingerprint").toString()));
   LocalDate a=LocalDate.parse(st.get("date_from").toString()),b=LocalDate.parse(st.get("date_to").toString());if(first==null||a.isBefore(first))first=a;if(last==null||b.isAfter(last))last=b;
  }
  var rows=new LinkedHashMap<UUID,Map<String,Object>>();for(var r:db.queryForList("select r.*,s.currency from money_statement_rows r join money_bank_statements s on s.user_id=r.user_id and s.id=r.statement_id where r.user_id=? and r.statement_id=any(?) order by r.statement_id,r.row_number",owner(),plan.statementIds().toArray(UUID[]::new)))rows.put((UUID)r.get("id"),r);
  require(rows.size()<=10000,"CLOSEOUT_SOURCE_GRAPH_LIMIT");var claimed=new HashSet<UUID>();long reviews=0;
  for(var op:plan.operations()){
   require(op!=null&&ACTIONS.contains(Objects.toString(op.action(),""))&&op.rowId()!=null&&rows.containsKey(op.rowId())&&claimed.add(op.rowId()),"EXACT_UNIQUE_OWNED_CLOSEOUT_ROWS_REQUIRED");
   if(op.pairedRowId()!=null)require(rows.containsKey(op.pairedRowId())&&claimed.add(op.pairedRowId()),"EXACT_UNIQUE_PAIRED_BANK_ROW_REQUIRED");
   MoneyService.text(op.reason(),500,true,"Bank closeout evidence reason");if(!op.action().startsWith("HISTORY_")&&!op.action().equals("UNDO"))reviews++;
  }
  require(plan.operations().stream().noneMatch(op->op.action().equals("UNDO"))||(plan.operations().size()<=50&&plan.operations().stream().allMatch(op->op.action().equals("UNDO"))),"UNDO_REQUIRES_SEPARATE_MAX_50_RECEIPTS");
  require(plan.operations().stream().filter(op->op.action().equals("HISTORY_DELAYED_TRANSFER")).count()<=1,"AT_MOST_ONE_EXPLICIT_DELAYED_PAIR_PER_CLOSEOUT");
  require(claimed.size()<=400&&reviews<=8,"CLOSEOUT_400_ROWS_AND_EIGHT_REVIEW_ACTIONS_MAX");
  var openings=new HashMap<UUID,Instant>();for(var o:product.notificationObservations())openings.merge((UUID)o.get("accountId"),(Instant)o.get("at"),(a,b)->a.isBefore(b)?a:b);
  for(var cp:db.queryForList("select account_id,min(verified_at) as at from money_balance_checkpoints where user_id=? group by account_id",owner()))openings.merge((UUID)cp.get("account_id"),at(cp.get("at")),(a,b)->a.isBefore(b)?a:b);
  var synchronous=new HashSet<UUID>();for(var op:plan.operations())if(op.action().equals("HISTORY_TRANSFER")){synchronous.add(op.rowId());if(op.pairedRowId()!=null)synchronous.add(op.pairedRowId());}
  return new Context(rows,openings,sourceHashes,synchronous,first.toString(),last.toString());
 }
 private String snapshot(){
  var values=new ArrayList<Object>();for(String table:List.of("money_transactions","money_accounts","money_loans","money_balance_checkpoints","money_raw_notifications","money_parse_attempts","money_transaction_sources","money_statement_effects","money_review_decisions","money_bookkeeping_overrides","money_classification_state","money_bank_internal_events","money_overdraft_facilities","money_meaning_audit")){
   values.add(db.queryForObject("select md5(coalesce(string_agg(value,'' order by value),'')) from(select md5((to_jsonb(t)-'processing_due_at'-'processing_claimed_at'-'processing_lease_until')::text) value from "+table+" t where user_id=?) s",String.class,owner()));
  }return commands.fingerprint(values);
 }
 private void historical(Map<String,Object> r,Context c){
  Instant opening=c.openings().get((UUID)r.get("account_id"));require(opening!=null&&end(r).isBefore(opening),"HISTORY_MUST_PRECEDE_EARLIEST_KNOWN_OPENING");
  require(number(r.get("amount")).signum()>0&&!money.account((UUID)r.get("account_id")).archived(),"POSITIVE_ACTIVE_ACCOUNT_BANK_CASH_REQUIRED");
  require(!r.get("description").toString().matches(".*대출사용금액.*"),"FACILITY_INTERNAL_LEGS_REQUIRE_BANK_INTERNAL_PAIR");
 }
 private void unclaimed(Map<String,Object> r){
  require(db.queryForObject("select count(*) from money_statement_effects where user_id=? and account_id=? and cash_key=?",Long.class,owner(),r.get("account_id"),r.get("cash_key"))==0,"BANK_ROW_ALREADY_HAS_CANONICAL_CASH");
  require(db.queryForObject("select count(*) from money_bank_internal_events where user_id=? and active and (bank_row_a=? or bank_row_b=?)",Long.class,owner(),r.get("id"),r.get("id"))==0,"BANK_ROW_ALREADY_HAS_INTERNAL_EVENT");
  Instant lower=at(r.get("occurred_at")),upper=end(r);if(!day(r)){lower=lower.minusSeconds(90);upper=upper.plusSeconds(90);}
  require(db.queryForObject("select count(*) from money_transactions where user_id=? and not excluded and merged_into is null and currency='KRW' and amount=? and "+(out(r)?"from_account_id":"to_account_id")+"=? and occurred_at between ? and ?",Long.class,owner(),r.get("amount"),r.get("account_id"),Timestamp.from(lower),Timestamp.from(upper))==0,"EXISTING_CASH_REQUIRES_LINK_NOT_HISTORY_INSERT");
 }
 private boolean opposite(Map<String,Object> a,Map<String,Object> b){
  if(a.get("account_id").equals(b.get("account_id"))||a.get("direction").equals(b.get("direction"))||number(a.get("amount")).compareTo(number(b.get("amount")))!=0)return false;
  return day(a)||day(b)?date(a).equals(date(b)):Duration.between(at(a.get("occurred_at")),at(b.get("occurred_at"))).abs().compareTo(Duration.ofSeconds(2))<=0;
 }
 private void pair(Map<String,Object> a,Map<String,Object> b,Context c){pair(a,b,c,2);}
 private void pair(Map<String,Object> a,Map<String,Object> b,Context c,int window){
  require(b!=null&&pairedWithin(a,b,window)&&!(day(a)&&day(b)),"PAIRED_BANK_CASH_REQUIRES_OPPOSITE_UNIQUE_SOURCE_AND_KNOWN_SECOND");
  for(var side:List.of(a,b)){
   long matches=c.rows().values().stream().filter(x->(window==2||!c.synchronousRows().contains(x.get("id")))&&pairedWithin(side,x,window)).count();
   // Exact synchronous pairs reserve their two independent bank rows before the single reviewed delayed pair.
   // Day-only targets require one timed counterpart; timed pairs ignore day-only candidates.
   if(!day(side))matches=c.rows().values().stream().filter(x->!day(x)&&(window==2||!c.synchronousRows().contains(x.get("id")))&&pairedWithin(side,x,window)).count();
   if(day(a)||day(b)){if(!day(side))matches=c.rows().values().stream().filter(x->(window==2||!c.synchronousRows().contains(x.get("id")))&&pairedWithin(side,x,window)).count();}
   require(matches==1,"AMBIGUOUS_BANK_PAIR_REMAINS_UNSETTLED");
  }
 }
 private boolean pairedWithin(Map<String,Object> a,Map<String,Object> b,int seconds){return !a.get("account_id").equals(b.get("account_id"))&&!a.get("direction").equals(b.get("direction"))&&number(a.get("amount")).compareTo(number(b.get("amount")))==0&&(day(a)||day(b)?date(a).equals(date(b)):Duration.between(at(a.get("occurred_at")),at(b.get("occurred_at"))).abs().compareTo(Duration.ofSeconds(seconds))<=0);}
 private MoneyTypes.MoneyTransaction cash(Operation op,Map<String,Object> r){
  var t=money.transaction(op.transactionId());MoneyMeaningService.version(t.version(),op.expectedVersion());
  require(!t.excluded()&&t.mergedInto()==null&&t.amount().compareTo(number(r.get("amount")))==0&&"KRW".equals(t.currency())&&r.get("account_id").equals(out(r)?t.fromAccountId():t.toAccountId()),"EXISTING_BANK_SIDE_IDENTITY_MISMATCH");
  require(day(r)?t.occurredAt().atZone(SEOUL).toLocalDate().equals(date(r)):Duration.between(t.occurredAt(),at(r.get("occurred_at"))).abs().compareTo(Duration.ofSeconds(90))<=0,"EXISTING_BANK_TIME_MISMATCH");return t;
 }
 private void raw(Operation op,Map<String,Object> r,boolean apply){
  require(op.rawId()!=null&&op.rawVersion()!=null,"EXACT_RAW_AND_VERSION_REQUIRED");recon.closeoutSource(op.rawId(),op.rawVersion(),r,apply);
 }
 private List<Map<String,Object>> sourceState(UUID...ids){return db.queryForList("select id,state,processing_version,review_deferred,processing_reason from money_raw_notifications where user_id=? and id=any(?) order by id",owner(),ids);}
 private void validate(Operation op,Context c){
  var r=c.rows().get(op.rowId());var b=op.pairedRowId()==null?null:c.rows().get(op.pairedRowId());
  switch(op.action()){
   case "HISTORY_CASH"->{historical(r,c);unclaimed(r);}
   case "HISTORY_TRANSFER"->{historical(r,c);historical(Objects.requireNonNull(b),c);unclaimed(r);unclaimed(b);pair(r,b,c);}
   case "HISTORY_DELAYED_TRANSFER"->{historical(r,c);historical(Objects.requireNonNull(b),c);require(!day(r)&&!day(b),"DELAYED_PAIR_REQUIRES_TWO_KNOWN_BANK_SECONDS");unclaimed(r);unclaimed(b);pair(r,b,c,600);}
   case "HISTORY_COMPLETE_TRANSFER"->{historical(r,c);historical(Objects.requireNonNull(b),c);unclaimed(r);pair(r,b,c);var t=money.transaction(op.transactionId());MoneyMeaningService.version(t.version(),op.expectedVersion());require(!t.excluded()&&t.mergedInto()==null&&Set.of(TransactionType.EXPENSE,TransactionType.INCOME,TransactionType.TRANSFER).contains(t.type())&&t.amount().compareTo(number(r.get("amount")))==0,"EXACT_EXISTING_OPPOSITE_CASH_REQUIRED");require(out(r)?t.fromAccountId()==null&&b.get("account_id").equals(t.toAccountId()):t.toAccountId()==null&&b.get("account_id").equals(t.fromAccountId()),"OPPOSITE_BANK_ENDPOINT_MISMATCH");require(db.queryForObject("select count(*) from money_statement_effects e join money_statement_rows witness on witness.user_id=e.user_id and witness.id=e.row_id where e.user_id=? and e.transaction_id=? and witness.account_id=? and witness.direction=? and witness.amount=? and witness.occurred_at=? and witness.time_precision=?",Long.class,owner(),t.id(),b.get("account_id"),b.get("direction"),b.get("amount"),b.get("occurred_at"),b.get("time_precision"))>=1,"EXISTING_OPPOSITE_STATEMENT_CLAIM_REQUIRED");}
   case "LINK_SOURCE","REPAIR_SOURCE_LINK"->{cash(op,r);raw(op,r,false);require(db.queryForObject("select count(*) from money_transaction_sources where user_id=? and raw_event_id=?",Long.class,owner(),op.rawId())==0,"SOURCE_ALREADY_HAS_CASH_CLAIM");}
   case "LINK_EXISTING_TRANSFER","LINK_UNTRACKED_TRANSFER"->{var a=cash(op,r);var other=money.transaction(op.otherTransactionId());MoneyMeaningService.version(other.version(),op.otherVersion());require(!other.excluded()&&other.mergedInto()==null&&!a.id().equals(other.id())&&a.amount().compareTo(other.amount())==0&&a.currency().equals(other.currency())&&Duration.between(a.occurredAt(),other.occurredAt()).abs().compareTo(Duration.ofSeconds(90))<=0,"EXACT_OPPOSITE_EXISTING_FACT_REQUIRED");require(out(r)?a.fromAccountId()!=null&&a.toAccountId()==null&&other.fromAccountId()==null&&other.toAccountId()!=null: a.fromAccountId()==null&&a.toAccountId()!=null&&other.fromAccountId()!=null&&other.toAccountId()==null,"EXISTING_TRANSFER_LEG_SHAPE_REQUIRED");if(b!=null){require(opposite(r,b),"PAIRED_STATEMENT_EVIDENCE_REQUIRED");UUID expected=out(b)?other.fromAccountId():other.toAccountId();require(b.get("account_id").equals(expected)&&other.amount().compareTo(number(b.get("amount")))==0,"OTHER_BANK_FACT_MISMATCH");}else if(op.action().equals("LINK_UNTRACKED_TRANSFER"))untrackedProof(a,other);else require(sourceOwns(other)&&sourceOwns(a),"TWO_OWNED_ORIGINAL_BANK_NOTIFICATIONS_REQUIRED");}
   case "BANK_INTERNAL_PAIR"->internal(op,c,false,null);
   case "UNDO"->undo(op,c,false,null);
   default->throw new InvalidRequestException("UNSUPPORTED_REMAINING_CLOSEOUT_ACTION");
  }
 }
 private void untrackedProof(MoneyTypes.MoneyTransaction debit,MoneyTypes.MoneyTransaction credit){
  require(debit.fromAccountId()!=null&&debit.toAccountId()==null&&credit.fromAccountId()==null&&credit.toAccountId()!=null&&sourceOwns(debit)&&money.account(credit.toAccountId()).archived(),"UNTRACKED_TRANSFER_REQUIRES_OWNED_DEBIT_AND_INCORRECT_ARCHIVED_CREDIT");
  require(debit.sources().size()==1&&credit.sources().size()==1,"TWO_EXACT_ORIGINAL_UNTRACKED_TRANSFER_SOURCES_REQUIRED");
  var outgoing=money.attempts(debit.sources().getFirst().rawEventId()).stream().filter(p->p.id().equals(debit.sources().getFirst().parseAttemptId())).findFirst().orElseThrow().candidate();
  var incoming=money.attempts(credit.sources().getFirst().rawEventId()).stream().filter(p->p.id().equals(credit.sources().getFirst().parseAttemptId())).findFirst().orElseThrow().candidate();
  require(outgoing!=null&&incoming!=null&&MoneyOrdinaryAdmission.domestic(outgoing)&&MoneyOrdinaryAdmission.domestic(incoming)&&incoming.direction()==Direction.IN&&outgoing.direction()==Direction.OUT&&incoming.amount().compareTo(credit.amount())==0&&outgoing.amount().compareTo(debit.amount())==0&&Objects.equals(outgoing.provider(),incoming.provider())&&incoming.destinationAccountHint()!=null&&incoming.destinationAccountHint().equals(outgoing.destinationAccountHint()),"TWO_BANK_NOTIFICATIONS_MUST_IDENTIFY_SAME_UNTRACKED_DESTINATION");
  var hint=BankParserSupport.PRODUCT.matcher(incoming.destinationAccountHint());require(hint.matches(),"EXACT_BANK_PRODUCT_AND_SUFFIX_REQUIRED");
  require(money.accounts().stream().noneMatch(a->a.provider().equals(incoming.provider())&&Objects.equals(a.suffix(),hint.group(2))),"EXISTING_REGISTERED_DESTINATION_REQUIRES_NORMAL_OWNED_ACCOUNT_LINK");
  require(db.queryForObject("select count(*)from money_statement_effects where user_id=? and transaction_id=?",Long.class,owner(),credit.id())==0,"INDEPENDENT_BANK_CLAIM_BLOCKS_UNTRACKED_CORRECTION");
 }
 private boolean sourceOwns(MoneyTypes.MoneyTransaction t){
  if(t.sources().isEmpty())return false;
  for(var s:t.sources()){
   if(s.parseAttemptId()==null)return false;var attempt=money.attempts(s.rawEventId()).stream().filter(p->p.id().equals(s.parseAttemptId())).findFirst().orElseThrow();var p=attempt.candidate();
   if(p==null||p.direction()==null||p.amount()==null||p.amount().compareTo(t.amount())!=0)return false;
   var resolved=new MoneyAccountResolver().resolve(money.accounts(),p.provider(),p.direction()==Direction.OUT?p.sourceAccountHint():p.destinationAccountHint());
   if(!resolved.resolved()||!resolved.account().id().equals(p.direction()==Direction.OUT?t.fromAccountId():t.toAccountId()))return false;
  }return true;
 }
 private void effect(Map<String,Object> r,UUID transaction){
  var old=db.queryForList("select transaction_id from money_statement_effects where user_id=? and account_id=? and cash_key=?",owner(),r.get("account_id"),r.get("cash_key"));
  if(old.isEmpty())db.update("insert into money_statement_effects(user_id,account_id,cash_key,transaction_id,row_id) values(?,?,?,?,?)",owner(),r.get("account_id"),r.get("cash_key"),transaction,r.get("id"));else require(old.getFirst().get("transaction_id").equals(transaction),"STATEMENT_EFFECT_CONFLICT");
 }
 private UUID change(UUID request,Operation op,UUID subject,Object before,Object after){
  UUID id=UUID.randomUUID();db.update("insert into money_reconciliation_changes(id,user_id,request_id,row_id,subject_id,action,before_value,after_value)values(?,?,?,?,?,?,cast(? as jsonb),cast(? as jsonb))",id,owner(),request,op.rowId(),subject,"CLOSEOUT_"+op.action(),json.writeValueAsString(before),json.writeValueAsString(after));return id;
 }
 private Object apply(Operation op,Context c,UUID request){
  var r=c.rows().get(op.rowId());var b=op.pairedRowId()==null?null:c.rows().get(op.pairedRowId());
  if(op.action().equals("UNDO"))return undo(op,c,true,request);
  if(op.action().equals("BANK_INTERNAL_PAIR"))return internal(op,c,true,request);
  UUID transaction;Object before=Map.of();
  switch(op.action()){
   case "HISTORY_CASH"->transaction=money.recordHistoricalStatementCash(op.rowId());
   case "HISTORY_TRANSFER","HISTORY_DELAYED_TRANSFER"->transaction=money.recordHistoricalStatementTransfer(op.rowId(),op.pairedRowId());
   case "HISTORY_COMPLETE_TRANSFER"->{var t=money.transaction(op.transactionId());before=t;transaction=t.id();MoneyStatementProtection.unchanged(db,owner(),t,t.amount(),t.occurredAt(),out(r)?(UUID)r.get("account_id"):t.fromAccountId(),out(r)?t.toAccountId():(UUID)r.get("account_id"));db.update("update money_transactions set type='TRANSFER',meaning_state='CONFIRMED',from_account_id=?,to_account_id=?,category_id=null,version=version+1 where user_id=? and id=?",out(r)?r.get("account_id"):t.fromAccountId(),out(r)?t.toAccountId():r.get("account_id"),owner(),transaction);effect(r,transaction);effect(b,transaction);MoneyStatementClock.link(db,json,owner(),transaction,r,request);MoneyStatementClock.link(db,json,owner(),transaction,b,request);}
   case "LINK_EXISTING_TRANSFER","LINK_UNTRACKED_TRANSFER"->{var a=money.transaction(op.transactionId());var other=money.transaction(op.otherTransactionId());before=Map.of("first",a,"second",other);var result=unified.edit(a.id(),new MoneyUnifiedBookkeepingService.Edit(child(request,op.rowId()),a.version(),"LINK_TRANSFER",null,other.id(),other.version(),null,null,null,null,null,null,null,null,null,op.reason(),null));require("APPLIED".equals(result.get("status")),"CANONICAL_EXISTING_TRANSFER_LINK_REJECTED");transaction=a.id();if(op.action().equals("LINK_UNTRACKED_TRANSFER"))db.update("update money_transactions set to_account_id=null,transfer_destination_status='UNTRACKED_OWNED' where user_id=? and id=?",owner(),transaction);effect(r,transaction);MoneyStatementClock.link(db,json,owner(),transaction,r,request);if(b!=null){effect(b,transaction);MoneyStatementClock.link(db,json,owner(),transaction,b,request);}}
   case "LINK_SOURCE","REPAIR_SOURCE_LINK"->{var t=money.transaction(op.transactionId());before=Map.of("transaction",t,"sources",sourceState(op.rawId()));raw(op,r,true);transaction=t.id();var attempt=money.attempts(op.rawId()).getLast();db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,parse_attempt_id,relationship,evidence)values(?,?,?,?,'AUXILIARY',cast(? as jsonb))",transaction,owner(),op.rawId(),attempt.id(),json.writeValueAsString(Map.of("sourceKind","SOURCE_STATEMENT_CORROBORATED_NOTIFICATION","rowId",op.rowId(),"requestId",request)));db.update("update money_raw_notifications set state='PROCESSED',review_deferred=false,processing_version=processing_version+1,processing_due_at=null,processing_reason='BANK_CLOSEOUT_EXISTING_CASH_CONFIRMED'where user_id=? and id=?",owner(),op.rawId());db.update("update money_transactions set version=version+1 where user_id=? and id=?",owner(),transaction);effect(r,transaction);MoneyStatementClock.link(db,json,owner(),transaction,r,request);}
   default->throw new InvalidRequestException("UNSUPPORTED_CLOSEOUT_APPLY");
  }
  var after=new LinkedHashMap<String,Object>();after.put("transaction",money.transaction(transaction));if(op.otherTransactionId()!=null)after.put("second",money.transaction(op.otherTransactionId()));if(op.rawId()!=null)after.put("sources",sourceState(op.rawId()));
  UUID changeId=change(request,op,transaction,before,after);return Map.of("action",op.action(),"rowId",op.rowId(),"transactionId",transaction,"changeId",changeId,"status","APPLIED");
 }
 private Object internal(Operation op,Context c,boolean apply,UUID request){
  var a=c.rows().get(op.rowId());var b=c.rows().get(op.pairedRowId());require(b!=null&&a.get("account_id").equals(b.get("account_id"))&&!a.get("direction").equals(b.get("direction"))&&number(a.get("amount")).compareTo(number(b.get("amount")))==0&&number(a.get("amount")).signum()>0&&!day(a)&&!day(b)&&at(a.get("occurred_at")).equals(at(b.get("occurred_at"))),"EXACT_SAME_SECOND_SAME_ACCOUNT_FACILITY_PAIR_REQUIRED");
  var credit=out(a)?b:a;var debit=out(a)?a:b;require(credit.get("description").toString().contains("대출사용금액 입금")&&debit.get("description").toString().contains("대출사용금액 상환"),"BANK_INTERNAL_FACILITY_LABELS_REQUIRED");
  raw(op,a,false);require(op.pairedRawId()!=null&&op.pairedRawVersion()!=null&&!op.pairedRawId().equals(op.rawId()),"TWO_EXACT_ORIGINAL_SOURCES_REQUIRED");recon.closeoutSource(op.pairedRawId(),op.pairedRawVersion(),b,false);
  var checkpoint=one(db.queryForList("select * from money_balance_checkpoints where user_id=? and id=? and account_id=?",owner(),op.checkpointId(),a.get("account_id")));require(at(checkpoint.get("verified_at")).equals(at(a.get("occurred_at")).plusNanos(999999000))&&number(checkpoint.get("amount")).compareTo(number(debit.get("balance_after")))==0,"EXISTING_BANK_SECOND_END_CHECKPOINT_REQUIRED");
  var facility=one(db.queryForList("select * from money_overdraft_facilities where user_id=? and account_id=? and active",owner(),a.get("account_id")));require(number(a.get("amount")).compareTo(number(facility.get("facility_limit")))<=0,"FACILITY_LIMIT_EVIDENCE_REQUIRED");
  String key=commands.fingerprint(List.of(a.get("account_id"),credit.get("bank_row_hash"),debit.get("bank_row_hash")));require(db.queryForObject("select count(*)from money_bank_internal_events where user_id=? and event_key=?",Long.class,owner(),key)==0,"BANK_INTERNAL_PAIR_ALREADY_RECONCILED");
  // Every real cash debit between the bank's two internal legs must already be posted.
  long lower=Math.min(version(a.get("row_number")),version(b.get("row_number"))),upper=Math.max(version(a.get("row_number")),version(b.get("row_number")));
  for(var middle:c.rows().values())if(middle.get("statement_id").equals(a.get("statement_id"))&&version(middle.get("row_number"))>lower&&version(middle.get("row_number"))<upper&&number(middle.get("amount")).signum()>0)require(db.queryForObject("select count(*)from money_statement_effects e join money_transactions t on t.user_id=e.user_id and t.id=e.transaction_id where e.user_id=? and e.row_id=? and not t.excluded and t.merged_into is null and t.amount=?",Long.class,owner(),middle.get("id"),middle.get("amount"))==1,"INTERVENING_REAL_INTEREST_CASH_MUST_BE_PRESERVED");
  require(db.queryForObject("select count(*)from money_transaction_sources where user_id=? and raw_event_id=any(?)",Long.class,owner(),new UUID[]{op.rawId(),op.pairedRawId()})==0,"INTERNAL_SOURCES_ALREADY_POSTED_AS_EXTERNAL_CASH");
  if(!apply)return Map.of("eventKey",key,"type","FACILITY_RECLASSIFICATION","cashMovement",BigDecimal.ZERO);
  var before=sourceState(op.rawId(),op.pairedRawId());raw(op,a,true);recon.closeoutSource(op.pairedRawId(),op.pairedRawVersion(),b,true);
  db.update("update money_raw_notifications set state='PROCESSED',review_deferred=false,processing_version=processing_version+1,processing_due_at=null,processing_reason='BANK_FACILITY_INTERNAL_EVENT_RECONCILED'where user_id=? and id=any(?)",owner(),new UUID[]{op.rawId(),op.pairedRawId()});
  var after=sourceState(op.rawId(),op.pairedRawId());UUID event=UUID.randomUUID();db.update("insert into money_bank_internal_events(id,user_id,event_key,event_type,account_id,bank_row_a,bank_row_b,raw_a,raw_b,checkpoint_id,facility_id,amount,request_id,before_sources,after_sources)values(?,?,?,'FACILITY_RECLASSIFICATION',?,?,?,?,?,?,?,?,?,cast(? as jsonb),cast(? as jsonb))",event,owner(),key,a.get("account_id"),a.get("id"),b.get("id"),op.rawId(),op.pairedRawId(),op.checkpointId(),facility.get("id"),a.get("amount"),request,json.writeValueAsString(before),json.writeValueAsString(after));
  UUID changeId=change(request,op,event,Map.of("sources",before),Map.of("eventId",event,"sources",after,"cashMovement",0));return Map.of("action",op.action(),"eventId",event,"changeId",changeId,"cashFactsCreated",0,"realInterestPreserved",true);
 }
 private Object undo(Operation op,Context c,boolean apply,UUID request){
  require(op.transactionId()!=null,"EXACT_CHANGE_RECEIPT_REQUIRED");
  var receipt=one(db.queryForList("select *,before_value::text as old,after_value::text as next from money_reconciliation_changes where user_id=? and id=? and row_id=?",owner(),op.transactionId(),op.rowId()));
  require(receipt.get("undone_by")==null,"CLOSEOUT_CHANGE_ALREADY_UNDONE");
  UUID subject=(UUID)receipt.get("subject_id");String action=receipt.get("action").toString();
  var before=json.readTree(receipt.get("old").toString());var after=json.readTree(receipt.get("next").toString());
  require(action.startsWith("CLOSEOUT_")&&!action.equals("CLOSEOUT_UNDO"),"OWNED_CLOSEOUT_RECEIPT_REQUIRED");
  if(action.equals("CLOSEOUT_BANK_INTERNAL_PAIR")){
   var event=one(db.queryForList("select * from money_bank_internal_events where user_id=? and id=? and active",owner(),subject));MoneyMeaningService.version(version(event.get("version")),op.expectedVersion());
   restoreSources(before.path("sources"),after.path("sources"),apply);
   if(apply)db.update("update money_bank_internal_events set active=false,version=version+1 where user_id=? and id=?",owner(),subject);
  }else{
   var current=money.transaction(subject);MoneyMeaningService.version(current.version(),op.expectedVersion());
   require(sameJson(current,after.path("transaction")),"CLOSEOUT_TRANSACTION_CHANGED_SINCE_RECEIPT");
   switch(action){
    case "CLOSEOUT_HISTORY_CASH","CLOSEOUT_HISTORY_TRANSFER","CLOSEOUT_HISTORY_DELAYED_TRANSFER"->{
     if(apply){var result=new MoneyRegistrationService(db,users,json,money,commands).cancelStatementRegistration(subject,new MoneyRegistrationService.Change(child(request,op.rowId()),current.version(),null,null));require("APPLIED".equals(result.get("status")),"CANONICAL_HISTORY_CANCELLATION_REJECTED");}
    }
    case "CLOSEOUT_HISTORY_COMPLETE_TRANSFER"->{if(apply){compensateClocks(subject,(UUID)receipt.get("request_id"));restoreFact(subject,before);}}
    case "CLOSEOUT_LINK_EXISTING_TRANSFER","CLOSEOUT_LINK_UNTRACKED_TRANSFER"->{
     UUID secondary=uuid(after.path("second").path("id").asString());var other=money.transaction(secondary);require(sameJson(other,after.path("second")),"CLOSEOUT_PAIRED_FACT_CHANGED_SINCE_RECEIPT");
     if(apply){compensateClocks(subject,(UUID)receipt.get("request_id"));if(action.equals("CLOSEOUT_LINK_UNTRACKED_TRANSFER"))db.update("update money_transactions set to_account_id=?,transfer_destination_status=null where user_id=? and id=?",nodeId(before.path("second"),"toAccountId"),owner(),subject);var result=unified.edit(subject,new MoneyUnifiedBookkeepingService.Edit(child(request,op.rowId()),current.version(),"UNLINK_TRANSFER",null,null,null,null,null,null,null,null,null,null,null,null,op.reason(),null));require("APPLIED".equals(result.get("status")),"CANONICAL_TRANSFER_UNLINK_REJECTED");restoreFact(subject,before.path("first"));restoreFact(secondary,before.path("second"));for(var original:List.of(before.path("first"),before.path("second")))for(var source:original.path("sources"))db.update("update money_transaction_sources set transaction_id=? where user_id=? and raw_event_id=?",uuid(original.path("id").asString()),owner(),uuid(source.path("rawEventId").asString()));}
    }
    case "CLOSEOUT_LINK_SOURCE","CLOSEOUT_REPAIR_SOURCE_LINK"->{
     restoreSources(before.path("sources"),after.path("sources"),apply);
     // Corroborating immutable source/parse history remains; only the held-review decision and clock are compensated.
     if(apply){compensateClocks(subject,(UUID)receipt.get("request_id"));db.update("update money_transactions set version=version+1 where user_id=? and id=?",owner(),subject);}
    }
    default->throw new InvalidRequestException("UNSUPPORTED_CLOSEOUT_RECEIPT_UNDO");
   }
  }
  if(apply){db.update("update money_reconciliation_changes set undone_by=? where user_id=? and id=? and undone_by is null",request,owner(),op.transactionId());change(request,op,subject,after,Map.of("compensatedChange",op.transactionId(),"sourceHistoryPreserved",true));}
  return Map.of("changeId",op.transactionId(),"subjectId",subject,"status",apply?"COMPENSATED":"PREVIEW_ONLY","sourceHistoryPreserved",true);
 }
 private boolean sameJson(Object current,tools.jackson.databind.JsonNode receipt){return json.readTree(json.writeValueAsString(current)).equals(receipt);}
 private void restoreSources(tools.jackson.databind.JsonNode before,tools.jackson.databind.JsonNode after,boolean apply){
  for(var source:after){UUID id=uuid(source.path("id").asString());var current=one(sourceState(id));require(sameJson(current,source),"CLOSEOUT_RAW_CHANGED_SINCE_RECEIPT");}
  if(apply)for(var source:before)db.update("update money_raw_notifications set state=?,review_deferred=?,processing_reason=?,processing_version=processing_version+1,processing_due_at=null where user_id=? and id=?",source.path("state").asString(),source.path("review_deferred").asBoolean(),source.path("processing_reason").isNull()?null:source.path("processing_reason").asString(),owner(),uuid(source.path("id").asString()));
 }
 private void restoreFact(UUID id,tools.jackson.databind.JsonNode before){
  db.update("update money_transactions set transfer_destination_status=null,type=?,meaning_state=?,from_account_id=?,to_account_id=?,category_id=?,title=?,memo=?,version=version+1 where user_id=? and id=?",before.path("type").asString(),before.path("meaningState").asString(),nodeId(before,"fromAccountId"),nodeId(before,"toAccountId"),nodeId(before,"categoryId"),nodeText(before,"title"),nodeText(before,"memo"),owner(),id);
 }
 private UUID nodeId(tools.jackson.databind.JsonNode n,String key){return n.path(key).isNull()||n.path(key).isMissingNode()?null:uuid(n.path(key).asString());}
 private String nodeText(tools.jackson.databind.JsonNode n,String key){return n.path(key).isNull()||n.path(key).isMissingNode()?null:n.path(key).asString();}
 private void compensateClocks(UUID subject,UUID original){
  for(var clock:db.queryForList("select previous_value::text as old,next_value::text as next from money_meaning_audit where user_id=? and subject_id=? and action='BANK_ACCOUNT_CLOCK' and next_value->>'requestId'=? order by created_at desc,id desc",owner(),subject,original.toString())){
   var value=json.readTree(clock.get("next").toString());UUID account=uuid(value.path("accountId").asString());
   var current=db.queryForObject("select "+MoneyProductService.effectiveAt("?::uuid")+" from money_transactions t where t.user_id=? and t.id=?",Timestamp.class,account,owner(),subject);require(current!=null&&current.toInstant().equals(Instant.parse(value.path("bankOccurredAt").asString())),"BANK_CLOCK_CHANGED_SINCE_CLOSEOUT");
   db.update("insert into money_meaning_audit(id,user_id,subject_id,action,previous_value,next_value) values(?,?,?,'BANK_ACCOUNT_CLOCK',cast(? as jsonb),cast(? as jsonb))",UUID.randomUUID(),owner(),subject,clock.get("next"),clock.get("old"));
  }
 }
 private Object statistics(Context c){return new MoneyWebService(db,users,money,product,json).overview(c.from(),c.to()).get("kpis");}
 private List<Map<String,Object>> cutoffs(Context c){
  var reader=new MoneyReconciliationReadService(db,users,money,product,json);var result=new ArrayList<Map<String,Object>>();
  for(UUID source:c.sourceHashes().keySet()){
   var row=c.rows().values().stream().filter(r->source.equals(r.get("statement_id"))).min(Comparator.comparingLong(r->version(r.get("row_number")))).orElseThrow();var projection=reader.cutoffProjection((UUID)row.get("account_id"),end(row));var item=new LinkedHashMap<String,Object>();item.put("statementId",source);item.put("accountId",row.get("account_id"));item.put("cutoff",end(row));item.put("precision",row.get("time_precision"));item.put("bankClosing",row.get("balance_after"));item.put("ledgerBalance",projection.get("ledgerBalance"));item.put("difference",projection.get("ledgerBalance")==null?null:number(row.get("balance_after")).subtract((BigDecimal)projection.get("ledgerBalance")));result.add(item);
  }return result;
 }
 private Map<UUID,MoneyProductService.Reconciliation> balances(){var result=new LinkedHashMap<UUID,MoneyProductService.Reconciliation>();for(var b:product.reconciliation())result.put(b.accountId(),b);return result;}
 private Map<UUID,BigDecimal> archivedCorrections(Plan plan){
  var expected=new HashMap<UUID,BigDecimal>();for(var op:plan.operations()){
   if(op.action().equals("LINK_UNTRACKED_TRANSFER")){var old=money.transaction(op.otherTransactionId());require(money.account(old.toAccountId()).archived(),"ONLY_PROVED_WRONG_ARCHIVED_DESTINATION_CAN_CHANGE");expected.merge(old.toAccountId(),old.amount().negate(),BigDecimal::add);}
   else if(op.action().equals("UNDO")){var receipts=db.queryForList("select action,before_value::text as old from money_reconciliation_changes where user_id=? and id=?",owner(),op.transactionId());if(receipts.size()==1&&"CLOSEOUT_LINK_UNTRACKED_TRANSFER".equals(receipts.getFirst().get("action"))){var before=json.readTree(receipts.getFirst().get("old").toString()).path("second");UUID account=nodeId(before,"toAccountId");require(money.account(account).archived(),"ARCHIVED_UNTRACKED_DESTINATION_STATE_CHANGED");expected.merge(account,before.path("amount").decimalValue(),BigDecimal::add);}}
  }return expected;
 }
 private void unchanged(Map<UUID,MoneyProductService.Reconciliation> before,Map<UUID,MoneyProductService.Reconciliation> after,Map<UUID,BigDecimal> allowed){
  require(before.keySet().equals(after.keySet()),"CLOSEOUT_ACCOUNT_SCOPE_CHANGED");for(var e:before.entrySet()){var a=after.get(e.getKey());BigDecimal old=e.getValue().ledgerBalance(),next=a.ledgerBalance(),delta=allowed.getOrDefault(e.getKey(),BigDecimal.ZERO);require(old==null?next==null:next!=null&&next.subtract(old).compareTo(delta)==0,"CLOSEOUT_UNEXPECTED_CURRENT_CANONICAL_BALANCE_CHANGE:"+e.getKey());}
 }
 private List<Map<String,Object>> balanceImpacts(Map<UUID,MoneyProductService.Reconciliation> before,Map<UUID,MoneyProductService.Reconciliation> after){
  var result=new ArrayList<Map<String,Object>>();for(var e:before.entrySet()){var next=after.get(e.getKey());var row=new LinkedHashMap<String,Object>();row.put("accountId",e.getKey());row.put("archived",e.getValue().archived());row.put("before",e.getValue().ledgerBalance());row.put("after",next.ledgerBalance());row.put("delta",e.getValue().ledgerBalance()==null||next.ledgerBalance()==null?null:next.ledgerBalance().subtract(e.getValue().ledgerBalance()));result.add(row);}return result;
 }
 private List<Object> bankRows(Plan p,Context c){var ids=new LinkedHashSet<UUID>();for(var op:p.operations()){ids.add(op.rowId());if(op.pairedRowId()!=null)ids.add(op.pairedRowId());}return ids.stream().map(id->{var row=c.rows().get(id);return (Object)Arrays.asList(id,row.get("account_id"),row.get("amount"),row.get("direction"),row.get("occurred_at"),row.get("time_precision"),row.get("bank_row_hash"));}).toList();}
 public Object preview(Plan input){return tx.execute(s->{lock();var c=context(input);for(var op:input.operations())validate(op,c);String state=snapshot();var allowed=archivedCorrections(input);var before=balances();var oldStats=statistics(c);var oldCutoffs=cutoffs(c);
  var simulated=dry.execute(rollback->{try{UUID request=UUID.randomUUID();for(var op:input.operations())apply(op,c,request);var after=balances();unchanged(before,after,allowed);return Map.of("statistics",statistics(c),"cutoffs",cutoffs(c),"balances",balanceImpacts(before,after));}finally{rollback.setRollbackOnly();}});
  UUID id=UUID.randomUUID();var payload=new LinkedHashMap<String,Object>();payload.put("previewId",id);payload.put("policyVersion",POLICY);payload.put("plan",input);payload.put("sourceHashes",c.sourceHashes());payload.put("bankRowColumns",List.of("rowId","accountId","amount","direction","occurredAtLowerBound","precision","bankRowHash"));payload.put("bankRows",bankRows(input,c));payload.put("statisticsBefore",oldStats);payload.put("statisticsAfter",simulated.get("statistics"));payload.put("cutoffsBefore",oldCutoffs);payload.put("cutoffsAfter",simulated.get("cutoffs"));payload.put("currentBalancesUnchanged",allowed.isEmpty());payload.put("trackedCurrentBalancesUnchanged",true);payload.put("balances",simulated.get("balances"));payload.put("archivedAccountCorrections",allowed);payload.put("reviewedDelayedOwnedPairs",input.operations().stream().filter(op->op.action().equals("HISTORY_DELAYED_TRANSFER")).count());payload.put("delayedPairPolicy","PROVISIONAL_OWNER_REVIEWED_600_SECOND_MUTUALLY_UNIQUE_BANK_PAIR; both original bank clocks retained");payload.put("untrackedOwnedDestinationTransfers",input.operations().stream().filter(op->op.action().equals("LINK_UNTRACKED_TRANSFER")).count());payload.put("untrackedDestinationMeaning","OWNER_REQUESTED_NO_ACCOUNT_REGISTRATION; original paired bank notifications retained; no current balance inferred");payload.put("approval","EXACT_FRESH_OWNER_APPROVAL_REQUIRED");payload.put("expiresAt",Instant.now().plusSeconds(600));String fingerprint=commands.fingerprint(payload);
  db.update("insert into money_remaining_closeout_plans(id,user_id,fingerprint,snapshot,payload,expires_at)values(?,?,?,?,cast(? as jsonb),?)",id,owner(),fingerprint,state,json.writeValueAsString(payload),Timestamp.from((Instant)payload.get("expiresAt")));payload.put("fingerprint",fingerprint);return payload;
 });}
 public Object execute(MoneyStatementReconciliationService.Execute input){require(input!=null&&input.previewId()!=null&&input.requestId()!=null&&Boolean.TRUE.equals(input.confirmed()),"EXACT_FRESH_OWNER_APPROVAL_REQUIRED");return tx.execute(s->{lock();return commands.execute(owner(),input.requestId(),"REMAINING_BANK_CLOSEOUT_EXECUTE",input,()->{
  var p=one(db.queryForList("select *,payload::text as body from money_remaining_closeout_plans where user_id=? and id=?",owner(),input.previewId()));require(input.fingerprint().equals(p.get("fingerprint"))&&at(p.get("expires_at")).isAfter(Instant.now()),"CLOSEOUT_PREVIEW_STALE_OR_FINGERPRINT_MISMATCH");require(snapshot().equals(p.get("snapshot")),"CLOSEOUT_OWNER_STATE_CHANGED");var payload=json.readTree(p.get("body").toString());require(POLICY.equals(payload.path("policyVersion").asString()),"CLOSEOUT_POLICY_CHANGED");var plan=json.treeToValue(payload.path("plan"),Plan.class);var c=context(plan);require(sameJson(c.sourceHashes(),payload.path("sourceHashes")),"CLOSEOUT_SOURCE_HASH_CHANGED");for(var op:plan.operations())validate(op,c);var allowed=archivedCorrections(plan);var before=balances();var results=new ArrayList<Object>();for(var op:plan.operations())results.add(apply(op,c,input.requestId()));unchanged(before,balances(),allowed);return Map.of("previewId",input.previewId(),"fingerprint",input.fingerprint(),"policyVersion",POLICY,"appliedCount",results.size(),"items",results,"trackedCurrentBalancesUnchanged",true,"balances",balanceImpacts(before,balances()),"cutoffsAfter",cutoffs(c),"atomic",true);
 });});}
 public Object internalEvents(int limit,int offset){require(limit>0&&limit<=50&&offset>=0&&offset<=10000,"INVALID_PAGE");return Map.of("items",db.queryForList("select id,event_type,account_id,bank_row_a,bank_row_b,raw_a,raw_b,checkpoint_id,facility_id,amount,active,version,request_id,created_at from money_bank_internal_events where user_id=? order by created_at desc,id limit ? offset ?",owner(),limit,offset));}
}
