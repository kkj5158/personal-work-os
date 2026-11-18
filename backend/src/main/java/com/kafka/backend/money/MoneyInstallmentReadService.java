package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyService.require;

/** Gross installment payments; intentionally independent of the SAVINGS fund boundary. */
@Service
@Transactional(readOnly = true)
public class MoneyInstallmentReadService {
 private final JdbcTemplate db;
 private final CurrentUserProvider users;
 public MoneyInstallmentReadService(JdbcTemplate db, CurrentUserProvider users) { this.db=db; this.users=users; }
 static final ZoneId KST=ZoneId.of("Asia/Seoul");
 static final String FACTS="""
  select t.id,t.version,t.amount,t.currency,t.occurred_at,coalesce(to_jsonb(t)->>'occurrence_precision','SECOND') as occurrence_precision,t.from_account_id,t.to_account_id,
   t.title,t.memo,t.counterparty_text,f.display_name from_name,d.display_name to_name,
   fh.fund_group from_group,dh.fund_group to_group,
   fh.savings_subtype from_subtype,dh.savings_subtype to_subtype
  from money_transactions t
  left join money_accounts f on f.user_id=t.user_id and f.id=t.from_account_id
  left join money_accounts d on d.user_id=t.user_id and d.id=t.to_account_id
  left join lateral (select h.fund_group,coalesce(c.corrected_subtype,h.savings_subtype) savings_subtype
   from money_account_fund_group_history h
   left join money_account_subtype_corrections c on c.user_id=h.user_id and c.account_id=h.account_id and c.effective_at=h.effective_at
   where h.user_id=t.user_id and h.account_id=f.id and h.effective_at<=t.occurred_at
   order by h.effective_at desc limit 1) fh on true
  left join lateral (select h.fund_group,coalesce(c.corrected_subtype,h.savings_subtype) savings_subtype
   from money_account_fund_group_history h
   left join money_account_subtype_corrections c on c.user_id=h.user_id and c.account_id=h.account_id and c.effective_at=h.effective_at
   where h.user_id=t.user_id and h.account_id=d.id and h.effective_at<=t.occurred_at
   order by h.effective_at desc limit 1) dh on true
  where t.user_id=? and t.type='TRANSFER' and t.meaning_state='CONFIRMED'
   and not t.excluded and t.merged_into is null
   and coalesce(f.include_in_statistics,true) and coalesce(d.include_in_statistics,true)
   and t.occurred_at>=? and t.occurred_at<? order by t.occurred_at desc,t.id
  """;
 public record Fact(MoneySavingsReadService.Transfer transfer,String fromSubtype,String toSubtype) {}
 public record Totals(BigDecimal amount,long count,boolean analyticsUnavailable,int unknownHistoryCount,
                      List<String> currencies,List<MoneySavingsReadService.Slice> composition) {}
 public record Page(String from,String to,String timezone,String currency,String classificationBasis,
                    Totals totals,List<MoneySavingsReadService.Transfer> items,int total,BigDecimal filteredAmount) {}
 // A known non-savings group has a legitimately null subtype. Missing history is unknown.
 static boolean classified(String group,String subtype) {
  return Set.of("LIVING","OTHER").contains(Objects.toString(group,"")) && subtype==null
   || "SAVINGS".equals(group) && Set.of("INSTALLMENT","SAVINGS_ACCOUNT").contains(Objects.toString(subtype,""));
 }
 static boolean unknown(Fact f) {
  var t=f.transfer();
  if(!classified(t.toGroup(),f.toSubtype())) return true;
  if(!"INSTALLMENT".equals(f.toSubtype())) return false;
  return !classified(t.fromGroup(),f.fromSubtype()) || t.amount()==null || t.amount().signum()<=0
   || t.currency()==null || !t.currency().matches("[A-Z]{3}");
 }
 static boolean eligible(Fact f) {
  return !unknown(f) && "INSTALLMENT".equals(f.toSubtype()) && !"INSTALLMENT".equals(f.fromSubtype());
 }
 static List<Fact> unique(List<Fact> facts) {
  var result=new LinkedHashMap<UUID,Fact>();
  for(var fact:facts) result.putIfAbsent(fact.transfer().id(),fact);
  return List.copyOf(result.values());
 }
 static Totals totals(List<Fact> input, boolean currencyScoped) {
  var facts=unique(input); int unknown=(int)facts.stream().filter(MoneyInstallmentReadService::unknown).count();
  var currencies=new TreeSet<String>(); var slices=new LinkedHashMap<UUID,MoneySavingsReadService.Slice>();
  BigDecimal sum=BigDecimal.ZERO; long count=0;
  for(var fact:facts) if(eligible(fact)) {
   var t=fact.transfer(); currencies.add(t.currency()); sum=sum.add(t.amount()); count++;
   var old=slices.get(t.toAccountId());
   slices.put(t.toAccountId(),new MoneySavingsReadService.Slice(t.toAccountId(),t.toName(),t.amount().add(old==null?BigDecimal.ZERO:old.amount()),old==null?1:old.count()+1));
  }
  boolean unavailable=unknown>0 || currencies.size()>1 || !currencyScoped && currencies.stream().anyMatch(c->!"KRW".equals(c));
  return new Totals(unavailable?null:sum,count,unavailable,unknown,List.copyOf(currencies),unavailable?List.of():List.copyOf(slices.values()));
 }
 public Page read(String from,String to,UUID destinationAccountId,String search,int limit,int offset,String currency) {
  require(currency==null||currency.matches("[A-Z]{3}"),"통화를 확인하세요.");
  LocalDate start=LocalDate.parse(from),end=LocalDate.parse(to);
  require(!start.isAfter(end),"시작일과 종료일을 확인하세요.");
  require(limit>0&&limit<=200&&offset>=0,"조회 범위를 확인하세요.");
  require(search==null||search.length()<=200,"검색어는 200자 이내로 입력하세요.");
  UUID owner=users.getCurrentUserId();
  if(destinationAccountId!=null) require(Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_accounts where user_id=? and id=?)",Boolean.class,owner,destinationAccountId)),"소유 계좌를 선택하세요.");
  var facts=db.query(FACTS,(r,n)->new Fact(new MoneySavingsReadService.Transfer(r.getObject("id",UUID.class),r.getBigDecimal("amount"),r.getString("currency"),r.getTimestamp("occurred_at").toInstant(),r.getObject("from_account_id",UUID.class),r.getObject("to_account_id",UUID.class),r.getString("title"),r.getString("memo"),r.getString("counterparty_text"),r.getString("from_name"),r.getString("to_name"),r.getString("from_group"),r.getString("to_group"),r.getLong("version"),r.getString("occurrence_precision")),r.getString("from_subtype"),r.getString("to_subtype")),owner,Timestamp.from(start.atStartOfDay(KST).toInstant()),Timestamp.from(end.plusDays(1).atStartOfDay(KST).toInstant()));
  if(currency!=null) facts=facts.stream().filter(f->currency.equals(f.transfer().currency())).toList();
  facts=unique(facts);
  var totals=totals(facts,currency!=null);
  String needle=Objects.toString(search,"").toLowerCase(Locale.ROOT);
  var matching=facts.stream().filter(MoneyInstallmentReadService::eligible).map(Fact::transfer)
   .filter(t->destinationAccountId==null||destinationAccountId.equals(t.toAccountId()))
   .filter(t->(Objects.toString(t.title(),"")+" "+Objects.toString(t.memo(),"")+" "+Objects.toString(t.counterpartyText(),"")+" "+t.fromName()+" "+t.toName()).toLowerCase(Locale.ROOT).contains(needle)).toList();
  var filteredAmount=totals.analyticsUnavailable()?null:matching.stream().map(MoneySavingsReadService.Transfer::amount).reduce(BigDecimal.ZERO,BigDecimal::add);
  return new Page(from,to,KST.getId(),currency==null?"KRW":currency,"OCCURRENCE_HISTORY_WITH_AUDITED_CORRECTIONS",totals,matching.stream().skip(offset).limit(limit).toList(),matching.size(),filteredAmount);
 }
}
