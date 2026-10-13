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

/** Read adapter over canonical transfers. Observation/source rows never enter this projection. */
@Service
@Transactional(readOnly=true)
public class MoneySavingsReadService {
 private final JdbcTemplate db; private final CurrentUserProvider users;
 public MoneySavingsReadService(JdbcTemplate db,CurrentUserProvider users){this.db=db;this.users=users;}
 static final String FACTS="""
  select t.id,t.version,t.amount,t.currency,t.occurred_at,t.from_account_id,t.to_account_id,
   t.title,t.memo,t.counterparty_text,f.display_name as from_name,d.display_name as to_name,
   fh.fund_group as from_group,dh.fund_group as to_group
  from money_transactions t
  join money_accounts f on f.user_id=t.user_id and f.id=t.from_account_id
  join money_accounts d on d.user_id=t.user_id and d.id=t.to_account_id
  left join lateral (select h.fund_group from money_account_fund_group_history h
   where h.user_id=t.user_id and h.account_id=t.from_account_id and h.effective_at<=t.occurred_at
   order by h.effective_at desc limit 1) fh on true
  left join lateral (select h.fund_group from money_account_fund_group_history h
   where h.user_id=t.user_id and h.account_id=t.to_account_id and h.effective_at<=t.occurred_at
   order by h.effective_at desc limit 1) dh on true
  where t.user_id=? and t.type='TRANSFER' and not t.excluded and t.merged_into is null
   and t.occurred_at>=? and t.occurred_at<? order by t.occurred_at desc,t.id
  """;
 public record Transfer(UUID id,BigDecimal amount,String currency,Instant occurredAt,UUID fromAccountId,UUID toAccountId,
   String title,String memo,String counterpartyText,String fromName,String toName,String fromGroup,String toGroup,long transactionVersion) {
  public Transfer(UUID id,BigDecimal amount,String currency,Instant occurredAt,UUID fromAccountId,UUID toAccountId,String title,String memo,String counterpartyText,String fromName,String toName,String fromGroup,String toGroup){this(id,amount,currency,occurredAt,fromAccountId,toAccountId,title,memo,counterpartyText,fromName,toName,fromGroup,toGroup,0L);}
 }
 public record Slice(UUID accountId,String label,BigDecimal amount,long count) {}
 public record Totals(BigDecimal gross,BigDecimal withdrawals,BigDecimal net,boolean analyticsUnavailable,int unknownHistoryCount,List<String> currencies,List<Slice> composition) {}
 static int boundary(Transfer t){
  if(t.fromGroup()==null||t.toGroup()==null)return 0;
  boolean from="SAVINGS".equals(t.fromGroup()),to="SAVINGS".equals(t.toGroup());
  return from==to?0:to?1:-1;
 }
 static Totals totals(List<Transfer> facts){
  BigDecimal gross=BigDecimal.ZERO,withdrawals=BigDecimal.ZERO;int unknown=0;
  var currencies=new TreeSet<String>();var slices=new LinkedHashMap<UUID,Slice>();var seen=new HashSet<UUID>();
  for(var t:facts){
   if(!seen.add(t.id()))continue;
   if(t.fromGroup()==null||t.toGroup()==null){unknown++;continue;}
   int direction=boundary(t);if(direction==0)continue;
   currencies.add(t.currency());
   if(direction>0){gross=gross.add(t.amount());var old=slices.get(t.toAccountId());slices.put(t.toAccountId(),new Slice(t.toAccountId(),t.toName(),t.amount().add(old==null?BigDecimal.ZERO:old.amount()),old==null?1:old.count()+1));}
   else withdrawals=withdrawals.add(t.amount());
  }
  boolean unavailable=unknown>0||currencies.stream().anyMatch(c->!"KRW".equals(c));
  return new Totals(unavailable?null:gross,unavailable?null:withdrawals,unavailable?null:gross.subtract(withdrawals),unavailable,unknown,List.copyOf(currencies),unavailable?List.of():List.copyOf(slices.values()));
 }
 public Map<String,Object> read(String from,String to,UUID destinationAccountId,String search,int limit,int offset){
  LocalDate start=LocalDate.parse(from),end=LocalDate.parse(to);require(!start.isAfter(end),"시작일과 종료일을 확인하세요.");
  require(limit>0&&limit<=200&&offset>=0,"조회 범위를 확인하세요.");require(search==null||search.length()<=200,"검색어는 200자 이내로 입력하세요.");
  UUID owner=users.getCurrentUserId();
  if(destinationAccountId!=null)require(Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_accounts where user_id=? and id=?)",Boolean.class,owner,destinationAccountId)),"소유 계좌를 선택하세요.");
  var facts=db.query(FACTS,(r,n)->new Transfer(r.getObject("id",UUID.class),r.getBigDecimal("amount"),r.getString("currency"),r.getTimestamp("occurred_at").toInstant(),r.getObject("from_account_id",UUID.class),r.getObject("to_account_id",UUID.class),r.getString("title"),r.getString("memo"),r.getString("counterparty_text"),r.getString("from_name"),r.getString("to_name"),r.getString("from_group"),r.getString("to_group"),r.getLong("version")),owner,Timestamp.from(start.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()),Timestamp.from(end.plusDays(1).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()));
  String needle=Objects.toString(search,"").toLowerCase(Locale.ROOT);
  var matching=facts.stream().filter(t->boundary(t)>0).filter(t->destinationAccountId==null||destinationAccountId.equals(t.toAccountId())).filter(t->(Objects.toString(t.title(),"")+" "+Objects.toString(t.memo(),"")+" "+Objects.toString(t.counterpartyText(),"")+" "+t.fromName()+" "+t.toName()).toLowerCase(Locale.ROOT).contains(needle)).toList();
  return Map.of("totals",totals(facts),"items",matching.stream().skip(offset).limit(limit).toList(),"total",matching.size());
 }
}
