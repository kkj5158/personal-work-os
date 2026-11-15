package com.kafka.backend.money;
import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import java.util.*;
import java.time.*;
import java.math.BigDecimal;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyService.require;
/** Explicit owner financial decisions; captured amount/currency/time and source identity remain authoritative. */
@Service
public class MoneyOwnerReviewService {
 private final JdbcTemplate db;private final CurrentUserProvider users;private final ObjectMapper json;private final MoneyService money;private final MoneyCommandService commands;
 public MoneyOwnerReviewService(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,MoneyService money,MoneyCommandService commands){this.db=db;this.users=users;this.json=json;this.money=money;this.commands=commands;}
 public record Decision(UUID requestId,String fingerprint,String action,UUID accountId,UUID otherAccountId,UUID existingTransactionId,Long accountVersion,Long otherAccountVersion,Long existingTransactionVersion,Financial financial){
  public Decision(UUID requestId,String fingerprint,String action,UUID accountId,UUID otherAccountId,UUID existingTransactionId,Long accountVersion,Long otherAccountVersion,Long existingTransactionVersion){this(requestId,fingerprint,action,accountId,otherAccountId,existingTransactionId,accountVersion,otherAccountVersion,existingTransactionVersion,null);}
 }
 /** Additive wire contract: legacy Android/owner commands retain their original shape. */
 public record Financial(String type,Direction direction,BigDecimal amount,Instant occurredAt,String reason,String title,String memo,UUID categoryId,UUID loanId,Long loanVersion,BigDecimal principal,BigDecimal interest,BigDecimal fee,UUID refundOf,Long refundVersion,UUID partnerId,Long partnerVersion,String partnerFingerprint,Boolean approveArchived,String currency){}
 private record Evidence(MoneyRawNotification raw,UUID attempt,ParsedCandidate candidate,String currency){}
 private UUID owner(){return users.getCurrentUserId();}
 private Evidence evidence(UUID id){
  var raw=money.notification(id);require(Set.of(ProcessingState.REVIEW_REQUIRED,ProcessingState.FAILED).contains(raw.state()),"이미 처리된 알림입니다. 원래 금융 이력을 확인하세요.");
  var rows=db.queryForList("select id,candidate::text,status,parser_key,parser_version from money_parse_attempts where user_id=? and raw_event_id=? order by created_at desc,id desc limit 1",owner(),id);
  require(rows.size()==1&&rows.getFirst().get("candidate")!=null&&!"FAILED".equals(rows.getFirst().get("status")),"확인 가능한 금융 분석 근거가 필요합니다.");
  var row=rows.getFirst();var tree=json.readTree(row.get("candidate").toString());String currency=raw.rawPayload().get("currency") instanceof String s?s:null;
  if(tree.hasNonNull("currency")){String parsed=tree.get("currency").asString();require(currency==null||currency.equals(parsed),"원문과 분석 통화가 다릅니다.");currency=parsed;}
  if(tree instanceof ObjectNode node)node.remove("currency");var candidate=json.treeToValue(tree,ParsedCandidate.class);
  require(candidate!=null&&id.equals(candidate.rawEventId())&&candidate.provider()!=null&&candidate.amount()!=null&&candidate.amount().signum()>0&&candidate.occurredAt()!=null&&candidate.postedAt()!=null&&candidate.timeSource()!=null&&candidate.direction()!=null,"원래 금액·방향·시각을 확인해 주세요.");
  require(MoneyOrdinaryAdmission.domestic(candidate)&&Objects.equals(MoneyOrdinaryAdmission.PACKAGES.get(candidate.provider()),raw.sourcePackage())&&Objects.equals(candidate.provider().toLowerCase(Locale.ROOT)+"-push",row.get("parser_key"))&&MoneyOrdinaryAdmission.supportedParserVersion(candidate.provider(),Objects.toString(row.get("parser_version"),null)),"지원되는 금융 원문 분석 근거가 필요합니다.");
  if(currency==null)currency=MoneyOrdinaryAdmission.currency(candidate);require(currency!=null&&currency.matches("[A-Z]{3}"),"원본 통화가 확인되지 않았습니다.");
  if(candidate.evidence()!=null&&candidate.evidence().get("currency")!=null)require(currency.equals(candidate.evidence().get("currency")),"원문과 분석 통화가 다릅니다.");
  return new Evidence(raw,(UUID)row.get("id"),candidate,currency);
 }
 private Map<String,Object> graph(Evidence e){var c=e.candidate();var from=java.sql.Timestamp.from(c.occurredAt().minusSeconds(90));var to=java.sql.Timestamp.from(c.occurredAt().plusSeconds(90));
  var facts=db.queryForList("select id,version,type,from_account_id,to_account_id,amount,currency,occurred_at from money_transactions where user_id=? and not excluded and merged_into is null and occurred_at between ? and ? order by occurred_at,id limit 501",owner(),from,to);
  var raws=db.queryForList("select r.id,r.processing_version,r.review_deferred,p.id as parse_id,p.candidate::text from money_raw_notifications r join lateral(select id,candidate,status from money_parse_attempts p where p.user_id=r.user_id and p.raw_event_id=r.id order by created_at desc,id desc limit 1) p on true where r.user_id=? and p.status='PARSED' and (p.candidate->>'occurredAt')::timestamptz between ? and ? and not exists(select 1 from money_transaction_sources s where s.user_id=r.user_id and s.raw_event_id=r.id) order by r.id limit 501",owner(),from,to);
  require(facts.size()<=500&&raws.size()<=500,"관련 금융 근거가 많아 범위를 좁혀 확인해야 합니다.");return Map.of("facts",facts,"raws",raws);
 }
 private String fingerprint(Evidence e){return commands.fingerprint(Arrays.asList(e.raw().id(),e.raw().processingVersion(),e.attempt(),e.candidate(),e.currency(),graph(e)));}
 @Transactional(readOnly=true) public Map<String,Object> context(UUID id){
  try{return parsedContext(id);}catch(InvalidRequestException unavailable){
   var manual=manual();var result=new LinkedHashMap<String,Object>(manual.context(id));var raw=money.notification(id);var candidate=new LinkedHashMap<String,Object>();
   candidate.put("postedAt",raw.postedAt());candidate.put("providerOccurredAt",null);candidate.put("timeSource","OWNER_ENTERED");
   result.put("candidate",candidate);result.put("raw",Map.of("title",Objects.toString(raw.title(),""),"body",Objects.toString(raw.text(),"")));result.put("occurredAt",raw.postedAt());result.put("amount",null);result.put("currency",raw.rawPayload().get("currency"));result.put("direction",null);result.put("partners",List.of());result.put("duplicates",List.of());result.put("archived",archived(id));result.put("manualRequired",true);result.put("manualReason",unavailable.getMessage());return result;
  }
 }
 private Map<String,Object> parsedContext(UUID id){
  var e=evidence(id);var c=e.candidate();var result=new LinkedHashMap<String,Object>();result.put("fingerprint",fingerprint(e));result.put("amount",c.amount());result.put("currency",e.currency());result.put("occurredAt",c.occurredAt());result.put("direction",c.direction());result.put("counterparty",c.counterpartyText());
  result.put("duplicates",db.queryForList("select id,version,type,title,counterparty_text as merchant,from_account_id as \"fromAccountId\",to_account_id as \"toAccountId\" from money_transactions where user_id=? and not excluded and merged_into is null and amount=? and currency=? and occurred_at between ? and ? order by occurred_at,id limit 501",owner(),c.amount(),e.currency(),java.sql.Timestamp.from(c.occurredAt().minusSeconds(90)),java.sql.Timestamp.from(c.occurredAt().plusSeconds(90))));
  result.put("version",e.raw().processingVersion());result.put("raw",Map.of("title",Objects.toString(e.raw().title(),""),"body",Objects.toString(e.raw().text(),""),"sourcePackage",e.raw().sourcePackage()));result.put("candidate",c);
  result.put("archived",Boolean.TRUE.equals(db.queryForObject("select review_deferred from money_raw_notifications where user_id=? and id=?",Boolean.class,owner(),id)));
  var partners=new ArrayList<Map<String,Object>>();
  for(var row:(List<Map<String,Object>>)graph(e).get("raws")){
   UUID partner=(UUID)row.get("id");if(partner.equals(id))continue;
   var raw=money.notification(partner);if(!Set.of(ProcessingState.REVIEW_REQUIRED,ProcessingState.FAILED).contains(raw.state()))continue;
   try{var b=evidence(partner);if(b.candidate().direction()==c.direction()||b.candidate().amount().compareTo(c.amount())!=0||!e.currency().equals(b.currency()))continue;
    var item=new LinkedHashMap<String,Object>();item.put("id",partner);item.put("version",raw.processingVersion());item.put("fingerprint",fingerprint(b));item.put("archived",row.get("review_deferred"));item.put("candidate",b.candidate());item.put("currency",b.currency());item.put("reason","동일 금액·반대 방향 후보입니다. 두 소유 계좌와 원문을 비교해 같은 이체인지 확인하세요.");partners.add(item);
   }catch(InvalidRequestException ignored){/* Unsupported evidence is not a selectable source. */}
  }
  result.put("partners",partners);return result;
 }
 private MoneyUnifiedBookkeepingService unified(){
  var product=new MoneyProductService(db,users,money,json);var web=new MoneyWebService(db,users,money,product,json);
  return new MoneyUnifiedBookkeepingService(db,users,json,money,product,web,new MoneyFinancialService(db,users,money,product,web,json),commands);
 }
 private MoneyManualReviewService manual(){var product=new MoneyProductService(db,users,money,json);var web=new MoneyWebService(db,users,money,product,json);return new MoneyManualReviewService(db,users,json,money,commands,new MoneyFinancialService(db,users,money,product,web,json),web);}
 private Map<String,Object> manualFinancial(UUID id,Decision input,boolean fallback){
  var v=input.financial();var service=manual();var source=service.context(id);
  if(fallback&&!Objects.equals(source.get("fingerprint"),input.fingerprint()))throw new OptimisticLockConflictException("원문·분석 버전이 변경되었습니다. 초안과 최신 근거를 비교하세요.");
  MoneyService.text(v.reason(),500,true,"원문과 비교한 소유자 확인 사유");
  require(!archived(id)||Boolean.TRUE.equals(v.approveArchived()),"제외 원문 연결에 명시적으로 동의하세요.");
  String currency=v.currency()!=null?v.currency():Objects.toString(money.notification(id).rawPayload().get("currency"),null);
  if(!fallback){var c=evidence(id);currency=c.currency();}
  require(v.direction()!=null&&v.amount()!=null&&v.occurredAt()!=null,"금액·방향·실제 발생시각을 직접 확인하세요.");
  require(Set.of("UNRESOLVED","EXPENSE","INCOME","TRANSFER","SAVINGS","SAVINGS_WITHDRAWAL","REFUND","LOAN_PAYMENT","LOAN_RECEIPT").contains(Objects.toString(v.type(),"")),"지원되는 금융 유형을 선택하세요.");
  boolean unresolved="UNRESOLVED".equals(v.type());TransactionType type=unresolved?(v.direction()==Direction.OUT?TransactionType.EXPENSE:TransactionType.INCOME):Set.of("SAVINGS","SAVINGS_WITHDRAWAL").contains(v.type())?TransactionType.TRANSFER:TransactionType.valueOf(v.type());
  if(unresolved)require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transactions where user_id=? and amount=? and currency=? and (from_account_id=? or to_account_id=?) and occurred_at between ? and ?) or exists(select 1 from money_raw_notifications r join lateral(select candidate from money_parse_attempts p where p.user_id=r.user_id and p.raw_event_id=r.id order by created_at desc,id desc limit 1) p on true where r.user_id=? and r.id<>? and (p.candidate->>'amount')::numeric=? and (p.candidate->>'occurredAt')::timestamptz between ? and ? and not exists(select 1 from money_transaction_sources s where s.user_id=r.user_id and s.raw_event_id=r.id))",Boolean.class,owner(),v.amount(),currency,input.accountId(),input.accountId(),java.sql.Timestamp.from(v.occurredAt().minusSeconds(90)),java.sql.Timestamp.from(v.occurredAt().plusSeconds(90)),owner(),id,v.amount(),java.sql.Timestamp.from(v.occurredAt().minusSeconds(90)),java.sql.Timestamp.from(v.occurredAt().plusSeconds(90)))),"유형 미확정 현금의 중복·이체 후보를 먼저 확인하세요.");
  require(v.partnerId()==null,"분석 근거가 불완전한 두 원문은 각각 방향을 확인한 전용 이체 판단이 필요합니다.");
  UUID own=input.accountId(),other=input.otherAccountId();Long ownVersion=input.accountVersion(),otherVersion=input.otherAccountVersion();
  if(type==TransactionType.TRANSFER&&v.direction()==Direction.IN){UUID swap=own;own=other;other=swap;Long version=ownVersion;ownVersion=otherVersion;otherVersion=version;}
  var confirmation=new MoneyManualReviewService.Confirmation(input.requestId(),List.of(new MoneyManualReviewService.Source(id,((Number)source.get("version")).longValue(),source.get("fingerprint").toString(),v.direction().name())),"LINK_DUPLICATE".equals(input.action())?"LINK_DUPLICATE":"REGISTER_SEPARATE",type,own,other,ownVersion,otherVersion,v.amount(),currency,v.occurredAt(),"OWNER_ENTERED",Objects.toString(v.title(),"소유자 확인 거래"),v.reason(),input.existingTransactionId(),input.existingTransactionVersion(),v.refundOf(),v.refundVersion(),v.loanId(),v.loanVersion(),v.principal(),v.interest(),v.fee(),true);
  var result=service.apply(id,confirmation);UUID fact=(UUID)result.get("transactionId");
  if(unresolved)db.update("update money_transactions set meaning_state='UNRESOLVED' where user_id=? and id=?",owner(),fact);
  if(!"LINK_DUPLICATE".equals(input.action())){MoneyService.text(v.title(),300,false,"제목");MoneyService.text(v.memo(),2000,false,"메모");
   if(v.categoryId()!=null){require(!unresolved&&Set.of(TransactionType.EXPENSE,TransactionType.INCOME).contains(type),"분류와 금융 유형을 독립적으로 확인하세요.");require(Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_categories c where c.user_id=? and c.id=? and not c.archived and c.kind=?)",Boolean.class,owner(),v.categoryId(),type.name())),"소유한 활성 분류를 선택하세요.");db.update("update money_transactions set category_id=? where user_id=? and id=?",v.categoryId(),owner(),fact);}
   db.update("update money_transactions set title=?,memo=? where user_id=? and id=?",v.title(),v.memo(),owner(),fact);}
  db.update("update money_raw_notifications set review_deferred=false where user_id=? and id=?",owner(),id);
  db.update("insert into money_meaning_audit(id,user_id,subject_id,action,previous_value,next_value) values(?,?,?,'OWNER_REVIEW_MANUAL_FINANCIAL_V2',cast(? as jsonb),cast(? as jsonb))",UUID.randomUUID(),owner(),fact,json.writeValueAsString(source),json.writeValueAsString(input));return result;
 }
 @Transactional(readOnly=true) public Map<String,Object> refunds(UUID id,String search){
  var e=evidence(id);MoneyService.text(search,200,false,"원거래 검색");
  return Map.of("items",db.queryForList("select id,version,title,counterparty_text as merchant,amount,occurred_at as \"occurredAt\" from money_transactions t where t.user_id=? and t.type='EXPENSE' and t.meaning_state='CONFIRMED' and not t.excluded and t.merged_into is null and t.currency=? and position(lower(?) in lower(coalesce(t.title,'')||' '||coalesce(t.counterparty_text,'')))>0 order by t.occurred_at desc,t.id limit 50",owner(),e.currency(),search));
 }
 private boolean archived(UUID id){return Boolean.TRUE.equals(db.queryForObject("select review_deferred from money_raw_notifications where user_id=? and id=?",Boolean.class,owner(),id));}
 private void checkAccount(UUID id,Long expected){require(id!=null,"소유 계좌를 선택하세요.");var a=money.account(id);MoneyMeaningService.version(a.version(),expected);require(!a.archived(),"활성 소유 계좌를 선택하세요.");}
 private Map<String,Object> decideFinancial(UUID id,Decision input){
  return commands.execute(owner(),input.requestId(),"OWNER_REVIEW_FINANCIAL",Arrays.asList(id,input),()->{
   var v=input.financial();var ids=new ArrayList<UUID>();ids.add(id);if(v.partnerId()!=null){require(!id.equals(v.partnerId()),"서로 다른 원문을 선택하세요.");ids.add(v.partnerId());}
   db.queryForList("select id from money_raw_notifications where user_id=? and id=any(?) order by id for update",owner(),ids.toArray(UUID[]::new));
   require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transaction_sources where user_id=? and raw_event_id=any(?))",Boolean.class,owner(),ids.toArray(UUID[]::new))),"이미 금융 거래에 연결된 원문입니다. 기존 가계부 거래를 확인하세요.");
   Evidence e;try{e=evidence(id);}catch(InvalidRequestException invalid){return manualFinancial(id,input,true);}var c=e.candidate();if(!fingerprint(e).equals(input.fingerprint()))throw new OptimisticLockConflictException("원문·후보·버전이 변경되었습니다. 초안을 유지하고 근거를 새로 확인하세요.");
   if("LOAN_RECEIPT".equals(v.type()))return manualFinancial(id,input,false);
   require(!archived(id)||Boolean.TRUE.equals(v.approveArchived()),"제외 원문을 연결하려면 명시적으로 동의하세요.");checkAccount(input.accountId(),input.accountVersion());
   require(c.provider().equals(money.account(input.accountId()).provider()),"원문 은행과 같은 금융기관의 소유 계좌를 선택하세요.");
   Direction direction=v.direction()==null?c.direction():v.direction();BigDecimal amount=v.amount()==null?c.amount():v.amount();Instant at=v.occurredAt()==null?c.occurredAt():v.occurredAt();
   MoneyService.currencyAmount(amount,e.currency());require(at!=null&&!at.isAfter(Instant.now().plusSeconds(60)),"발생시각을 확인하세요.");
   boolean corrected=direction!=c.direction()||amount.compareTo(c.amount())!=0||!at.equals(c.occurredAt());
   var resolved=new MoneyAccountResolver().resolve(money.accounts(),c.provider(),c.direction()==Direction.OUT?c.sourceAccountHint():c.destinationAccountHint());
   corrected|=!resolved.resolved()||!resolved.account().id().equals(input.accountId());
   if(corrected)MoneyService.text(v.reason(),500,true,"소유자 정정 사유");
   String type=Objects.toString(v.type(),"UNRESOLVED");require(Set.of("UNRESOLVED","EXPENSE","INCOME","TRANSFER","SAVINGS","SAVINGS_WITHDRAWAL","LOAN_PAYMENT","REFUND").contains(type),"이 형태는 추가 금융 근거가 필요합니다. 확인된 현금만 유형 미확정으로 등록할 수 있습니다.");
   boolean transfer=Set.of("TRANSFER","SAVINGS","SAVINGS_WITHDRAWAL").contains(type);
   require(v.partnerId()==null||transfer,"상대 RAW는 이체 판단에서만 소비할 수 있습니다.");
   require(type.equals("UNRESOLVED")||transfer||direction==(Set.of("EXPENSE","LOAN_PAYMENT").contains(type)?Direction.OUT:Direction.IN),"선택한 금융 유형에 맞게 입출금 방향을 정정하세요.");
   var provenance=new LinkedHashMap<String,Object>();provenance.put("rule","OWNER_ASSERTED_REVIEW_V2");provenance.put("requestId",input.requestId());provenance.put("sourceFingerprint",input.fingerprint());provenance.put("original",c);provenance.put("decision",v);provenance.put("corrected",corrected);
   var sources=new ArrayList<TransactionSource>();sources.add(new TransactionSource(id,e.attempt(),SourceRelationship.PRIMARY,provenance));
   UUID from=direction==Direction.OUT?input.accountId():null,to=direction==Direction.IN?input.accountId():null;
   if(transfer){
    checkAccount(input.otherAccountId(),input.otherAccountVersion());require(!input.accountId().equals(input.otherAccountId()),"같은 소유 계좌로 이체할 수 없습니다.");
    if(direction==Direction.OUT)to=input.otherAccountId();else from=input.otherAccountId();
    if(v.partnerId()!=null){var b=evidence(v.partnerId());MoneyMeaningService.version(b.raw().processingVersion(),v.partnerVersion());
     if(!fingerprint(b).equals(v.partnerFingerprint()))throw new OptimisticLockConflictException("상대 원문의 근거가 변경되었습니다.");
     require(!archived(v.partnerId())||Boolean.TRUE.equals(v.approveArchived()),"제외된 상대 원문 연결에 명시적으로 동의하세요.");
     var bc=b.candidate();require(bc.direction()!=direction&&bc.amount().compareTo(amount)==0&&e.currency().equals(b.currency())&&Duration.between(bc.occurredAt(),at).abs().compareTo(Duration.ofSeconds(MoneyReviewService.PAIR_WINDOW_SECONDS))<=0,"두 원문의 방향·금액·통화·시각을 확인하세요.");
     var own=new MoneyAccountResolver().resolve(money.accounts(),bc.provider(),bc.direction()==Direction.OUT?bc.sourceAccountHint():bc.destinationAccountHint());require(own.resolved()&&own.account().id().equals(input.otherAccountId()),"상대 RAW의 소유 계좌가 선택 계좌와 다릅니다.");
     sources.add(new TransactionSource(v.partnerId(),b.attempt(),SourceRelationship.PRIMARY,Map.of("rule","OWNER_CONFIRMED_RAW_PAIR_V2","requestId",input.requestId(),"fingerprint",v.partnerFingerprint(),"original",bc,"archiveApproved",Boolean.TRUE.equals(v.approveArchived()))));
    }else require(((List<?>)context(id).get("partners")).isEmpty(),"알려진 반대편 RAW가 있습니다. 함께 확인하거나 기존 거래 연결을 선택하세요.");
   }
   UUID transaction;
   if("LINK_DUPLICATE".equals(input.action())){
    require(!corrected,"원문 정정과 기존 거래 연결은 함께 적용할 수 없습니다. 동일 사실의 근거를 먼저 확인하세요.");
    var target=money.transaction(input.existingTransactionId());MoneyMeaningService.version(target.version(),input.existingTransactionVersion());
    require(!target.excluded()&&target.mergedInto()==null&&target.amount().compareTo(amount)==0&&target.currency().equals(e.currency())&&Duration.between(target.occurredAt(),at).abs().compareTo(Duration.ofSeconds(90))<=0&&input.accountId().equals(direction==Direction.OUT?target.fromAccountId():target.toAccountId()),"연결 대상의 원래 계좌·방향·금액·통화·시각이 다릅니다.");
    require(sources.size()+target.sources().size()<=100,"출처가 많은 거래는 개별 금융 확인이 필요합니다.");
    if(v.partnerId()!=null)require(target.type()==TransactionType.TRANSFER&&Objects.equals(target.fromAccountId(),from)&&Objects.equals(target.toAccountId(),to),"두 원문은 소유 계좌 경로가 같은 기존 이체에만 연결할 수 있습니다.");
    for(var source:sources)db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,parse_attempt_id,relationship,evidence) values(?,?,?,?,'PRIMARY',cast(? as jsonb))",target.id(),owner(),source.rawEventId(),source.parseAttemptId(),json.writeValueAsString(source.evidence()));
    db.update("update money_transactions set version=version+1 where user_id=? and id=?",owner(),target.id());
    db.update("update money_review_decisions set transaction_version=? where user_id=? and transaction_id=? and transaction_version=?",target.version()+1,owner(),target.id(),target.version());transaction=target.id();
   }else{
    require("REGISTER".equals(input.action()),"금융 확정 행동을 확인하세요.");
    if(transfer)require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transactions where user_id=? and type='TRANSFER' and from_account_id=? and to_account_id=? and amount=? and currency=? and occurred_at between ? and ?)",Boolean.class,owner(),from,to,amount,e.currency(),java.sql.Timestamp.from(at.minusSeconds(90)),java.sql.Timestamp.from(at.plusSeconds(90)))),"같은 소유 계좌 경로의 기존 이체가 있습니다. 새로 등록하지 말고 기존 거래에 출처를 연결하세요.");
    if(type.equals("UNRESOLVED")&&corrected)return manualFinancial(id,input,false);
    if(type.equals("UNRESOLVED")){
     // Unknown meaning never relaxes cash identity/transfer conflict gates, including archived RAWs.
     var assessment=new MoneyReviewAdmission(db,users,json,money).assess(List.of(id)).get(id);require(!corrected&&assessment!=null&&assessment.eligible(),"현금 사실의 중복·이체 또는 정정 근거를 먼저 금융 판단으로 확정하세요.");
    }
    var initial=new TransactionInput(transfer?TransactionType.TRANSFER:direction==Direction.OUT?TransactionType.EXPENSE:TransactionType.INCOME,from,to,amount,e.currency(),at,c.counterpartyText(),sources);
    transaction=type.equals("UNRESOLVED")?money.recordUnresolvedTransactionId(initial):money.recordReviewTransactionId(initial);
    if(type.equals("LOAN_PAYMENT")||type.equals("REFUND")){
     require("KRW".equals(e.currency()),"대출·환불 전용 처리는 원화만 지원합니다.");
     if(type.equals("REFUND"))require(v.refundOf()!=null&&v.refundVersion()!=null,"확정 환불은 원거래를 연결하세요. 불명확하면 유형 미확정으로 등록하세요.");
     if(type.equals("LOAN_PAYMENT"))require(v.principal()!=null&&v.interest()!=null&&v.fee()!=null,"원금·이자·수수료를 모두 확인하세요. 불명확하면 유형 미확정으로 등록하세요.");
     unified().resolveReviewType(transaction,new MoneyUnifiedBookkeepingService.Edit(input.requestId(),money.transaction(transaction).version(),"TYPE",type,null,v.refundVersion(),v.loanId(),v.loanVersion(),v.principal(),v.interest(),v.fee(),v.refundOf(),null,null,null,v.reason(),null));
    }
    if(type.equals("SAVINGS")||type.equals("SAVINGS_WITHDRAWAL"))require(type.equals(db.queryForObject("select "+MoneySavingsReadService.displayTypeSql("t")+" from money_transactions t where t.user_id=? and t.id=?",String.class,owner(),transaction)),"발생일의 소유 계좌 자금 그룹이 선택한 저축 방향과 다릅니다.");
    if(v.categoryId()!=null){require(Set.of("EXPENSE","INCOME").contains(type),"유형 미확정·특수 거래의 분류는 금융 유형 확정 뒤 선택하세요.");require(Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_categories c where c.user_id=? and c.id=? and not c.archived and c.kind=? and not exists(select 1 from money_categories p where p.user_id=c.user_id and p.id=c.parent_id and p.archived))",Boolean.class,owner(),v.categoryId(),type)),"소유한 활성 분류를 선택하세요.");}
    MoneyService.text(v.title(),300,false,"제목");MoneyService.text(v.memo(),2000,false,"메모");
    db.update("update money_transactions set title=?,memo=?,category_id=?,version=version+1 where user_id=? and id=?",v.title(),v.memo(),v.categoryId(),owner(),transaction);
   }
   for(UUID raw:ids){money.finishProcessing(raw,ProcessingState.PROCESSED,"USER_CONFIRMED");db.update("update money_raw_notifications set review_deferred=false where user_id=? and id=?",owner(),raw);}
   db.update("update money_classification_jobs set status='PROTECTED',result='{}'::jsonb,updated_at=now() where user_id=? and transaction_id=? and not requested and status='QUEUED'",owner(),transaction);
   db.update("insert into money_meaning_audit(id,user_id,subject_id,action,previous_value,next_value) values(?,?,?,'OWNER_REVIEW_FINANCIAL_V2',cast(? as jsonb),cast(? as jsonb))",UUID.randomUUID(),owner(),transaction,json.writeValueAsString(Map.of("raw",c)),json.writeValueAsString(input));
   UUID event=UUID.randomUUID();for(UUID raw:ids)db.update("insert into money_ai_events(id,user_id,subject_id,kind,payload) values(?,?,?,'MOVE_TO_BOOKKEEPING',cast(? as jsonb))",raw.equals(id)?event:UUID.randomUUID(),owner(),raw,json.writeValueAsString(Map.of("kind","RAW","transactionId",transaction,"requestId",input.requestId(),"after",Map.of("version",money.notification(raw).processingVersion(),"state","COMPLETED"))));
   return Map.of("transactionId",transaction,"transaction",money.transaction(transaction),"eventId",event,"sourceIds",ids);
  });
 }
 public Map<String,Object> decide(UUID id,Decision input){
  require(input!=null&&input.fingerprint()!=null,"원래 금융 근거와 요청 ID가 필요합니다.");
  if(input.financial()!=null)return decideFinancial(id,input);
  return commands.execute(owner(),input.requestId(),"OWNER_REVIEW_FINANCIAL",Arrays.asList(id,input),()->{
   db.queryForList("select id from money_raw_notifications where user_id=? and id=? for update",owner(),id);var e=evidence(id);if(!Objects.equals(fingerprint(e),input.fingerprint()))throw new OptimisticLockConflictException("표시 이후 원문 분석 또는 버전이 바뀌었습니다.");
   var c=e.candidate();require(input.accountId()!=null,"소유 계좌를 선택하세요.");var account=money.account(input.accountId());MoneyMeaningService.version(account.version(),input.accountVersion());require(!account.archived(),"활성 소유 계좌를 선택하세요.");require(Objects.equals(account.provider(),c.provider()),"원문 금융기관과 같은 소유 계좌를 선택하세요.");UUID transaction;
   var provenance=Map.<String,Object>of("rule","OWNER_ASSERTED_REVIEW","action",Objects.toString(input.action(),""),"sourceFingerprint",input.fingerprint(),"requestId",input.requestId());
   if("LINK_DUPLICATE".equals(input.action())){
    require(input.existingTransactionId()!=null,"연결할 기존 거래를 선택하세요.");var target=money.transaction(input.existingTransactionId());MoneyMeaningService.version(target.version(),input.existingTransactionVersion());
    require(!target.excluded()&&target.mergedInto()==null&&target.amount().compareTo(c.amount())==0&&target.currency().equals(e.currency())&&Duration.between(target.occurredAt(),c.occurredAt()).abs().compareTo(Duration.ofSeconds(90))<=0,"기존 거래의 금액·통화·시각 근거가 다릅니다.");
    require(input.accountId().equals(c.direction()==Direction.OUT?target.fromAccountId():target.toAccountId()),"원래 방향의 소유 계좌가 기존 거래와 다릅니다.");
    require(target.sources().size()<100,"출처가 많은 거래는 개별 금융 확인이 필요합니다.");db.queryForList("select id from money_raw_notifications where user_id=? and id=? for update",owner(),id);
    require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transaction_sources where user_id=? and raw_event_id=?)",Boolean.class,owner(),id)),"이미 다른 금융 거래에 연결된 원문입니다.");
    db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,parse_attempt_id,relationship,evidence) values(?,?,?,?,'PRIMARY',cast(? as jsonb))",target.id(),owner(),id,e.attempt(),json.writeValueAsString(provenance));db.update("update money_transactions set version=version+1 where user_id=? and id=?",owner(),target.id());db.update("update money_review_decisions set transaction_version=? where user_id=? and transaction_id=? and transaction_version=?",target.version()+1,owner(),target.id(),target.version());transaction=target.id();
   }else{
    require(Set.of("REGISTER","TRANSFER").contains(Objects.toString(input.action(),"")),"직접 금융 처리 유형을 확인하세요.");
    UUID from=c.direction()==Direction.OUT?input.accountId():null,to=c.direction()==Direction.IN?input.accountId():null;TransactionType type=c.direction()==Direction.OUT?TransactionType.EXPENSE:TransactionType.INCOME;
    if("TRANSFER".equals(input.action())){require(input.otherAccountId()!=null&&!input.accountId().equals(input.otherAccountId())&&!money.account(input.otherAccountId()).archived(),"다른 활성 소유 계좌를 선택하세요.");MoneyMeaningService.version(money.account(input.otherAccountId()).version(),input.otherAccountVersion());if(c.direction()==Direction.OUT)to=input.otherAccountId();else from=input.otherAccountId();type=TransactionType.TRANSFER;}
    transaction=money.recordTransactionId(new TransactionInput(type,from,to,c.amount(),e.currency(),c.occurredAt(),c.counterpartyText(),List.of(new TransactionSource(id,e.attempt(),SourceRelationship.PRIMARY,provenance))));
   }
   long processing=money.finishProcessingVersion(id,ProcessingState.PROCESSED,"USER_CONFIRMED");UUID event=UUID.randomUUID();
   db.update("update money_classification_jobs set status='PROTECTED',result=cast(? as jsonb),updated_at=now() where user_id=? and transaction_id=? and not requested and status='QUEUED'",json.writeValueAsString(Map.of("reason","REVIEW_ADMISSION_ONLY")),owner(),transaction);
   db.update("insert into money_ai_events(id,user_id,subject_id,kind,payload) values(?,?,?,'MOVE_TO_BOOKKEEPING',cast(? as jsonb))",event,owner(),id,json.writeValueAsString(Map.of("kind","RAW","transactionId",transaction,"provenance",provenance,"after",Map.of("version",processing,"state","COMPLETED"))));
   return Map.of("transactionId",transaction,"transaction",money.transaction(transaction),"eventId",event);
  });
 }
}
