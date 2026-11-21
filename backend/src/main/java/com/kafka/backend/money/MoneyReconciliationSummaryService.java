package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;

/** Lightweight owner batch: load sources once, reuse canonical effective-time ledger movement.
 * No diagnostic scans/matching graph, no posting and no use of manual observations as anchors. */
@Service
public class MoneyReconciliationSummaryService {
 private final JdbcTemplate db; private final CurrentUserProvider users; private final MoneyService money; private final MoneyProductService product; private final JsonMapper json;
 public MoneyReconciliationSummaryService(JdbcTemplate db,CurrentUserProvider users,MoneyService money,MoneyProductService product,JsonMapper json){this.db=db;this.users=users;this.money=money;this.product=product;this.json=json;}
 record Evidence(Instant at,BigDecimal amount,String source,UUID id,boolean anchor){}
 public record Row(MoneyAccount account,BigDecimal currentLedgerBalance,Instant calculatedAt,Instant basisAt,String basis,
   BigDecimal observedBalance,Instant observedAt,String source,BigDecimal ledgerAtObservedAt,BigDecimal difference,
   String bucket,String status,String reason,boolean independentVerification,boolean conflictingEvidence,long pendingCount,boolean unsupportedCurrency){}
 public record Dashboard(Instant calculatedAt,List<Row> accounts,Map<String,Long> counts){}
 @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ) public Dashboard summary(){
  UUID owner=users.getCurrentUserId();Instant now=Instant.now();var accounts=money.accounts();
  Map<UUID,List<Evidence>> evidence=new HashMap<>();Map<UUID,List<Instant>> pending=new HashMap<>();
  db.query("select id,account_id,amount,verified_at from money_balance_checkpoints where user_id=? and verified_at<=?",r->{evidence.computeIfAbsent(r.getObject("account_id",UUID.class),k->new ArrayList<>()).add(new Evidence(r.getTimestamp("verified_at").toInstant(),r.getBigDecimal("amount"),"MANUAL_ANCHOR",r.getObject("id",UUID.class),true));},owner,Timestamp.from(now));
  db.query("select id,account_id,amount,observed_at from money_balance_observations where user_id=? and status='ACTIVE' and observed_at<=?",r->{evidence.computeIfAbsent(r.getObject("account_id",UUID.class),k->new ArrayList<>()).add(new Evidence(r.getTimestamp("observed_at").toInstant(),r.getBigDecimal("amount"),"USER_MANUAL",r.getObject("id",UUID.class),false));},owner,Timestamp.from(now));
  var raws=db.queryForList("""
   select r.id,r.posted_at,r.title,r.body,r.big_text,r.source_package,r.state,r.processing_reason,p.candidate::text,s.transaction_id,
    t.excluded,t.merged_into,t.currency,h.parse_attempt_id frozen_attempt,h.account_id frozen_account from money_raw_notifications r
   left join lateral(select id,candidate from money_parse_attempts p where p.user_id=r.user_id and p.raw_event_id=r.id order by p.created_at desc,p.id desc limit 1) p on true
   left join money_transaction_sources s on s.user_id=r.user_id and s.raw_event_id=r.id
   left join money_provider_observation_routes h on h.user_id=r.user_id and h.parse_attempt_id=p.id
   left join money_transactions t on t.user_id=s.user_id and t.id=s.transaction_id
   where r.user_id=? and r.posted_at<=?
   """,owner,Timestamp.from(now));
  for(var raw:raws){
   var c=raw.get("candidate")==null?null:json.readValue(raw.get("candidate").toString(),ParsedCandidate.class);
   if(Boolean.TRUE.equals(raw.get("excluded"))||raw.get("merged_into")!=null||"IGNORED_NON_FINANCIAL".equals(raw.get("processing_reason")))continue;
   var observationAccount=MoneyAccountProviderChange.observationAccount(raw.get("frozen_attempt"),(UUID)raw.get("frozen_account"),accounts,c);
   if(observationAccount!=null&&c.postBalance()!=null&&c.postedAt()!=null&&c.timeSource()!=null&&!c.postedAt().isAfter(now)&&(raw.get("currency")==null||"KRW".equals(raw.get("currency")))){
    evidence.computeIfAbsent(observationAccount,k->new ArrayList<>()).add(new Evidence(c.postedAt(),c.postBalance(),"NOTIFICATION",(UUID)raw.get("id"),true));
   }
   if(raw.get("transaction_id")==null&&!"PROCESSED".equals(raw.get("state"))){
    for(var account:accounts){var scope=MoneyReconciliationEvidenceScope.resolve(account,accounts,c,Objects.toString(raw.get("source_package"),""),Objects.toString(raw.get("title"),"")+" "+Objects.toString(raw.get("body"),"")+" "+Objects.toString(raw.get("big_text"),""));
     if(scope!=MoneyReconciliationEvidenceScope.Scope.UNRELATED)pending.computeIfAbsent(account.id(),k->new ArrayList<>()).add(((Timestamp)raw.get("posted_at")).toInstant());}
   }
  }
  var unsupported=new HashSet<>(db.queryForList("select distinct a.id from money_accounts a join money_transactions t on t.user_id=a.user_id and (t.from_account_id=a.id or t.to_account_id=a.id) where a.user_id=? and not t.excluded and t.merged_into is null and t.currency<>'KRW'",UUID.class,owner));
  Map<UUID,MoneyProductService.Balance> balances=new HashMap<>();product.accountBalances(now).forEach(v->balances.put(((MoneyAccount)v.get("account")).id(),(MoneyProductService.Balance)v.get("balance")));
  var rows=new ArrayList<Row>();
  // Two small canonical aggregate queries per comparable account, no per-account evidence graphs.
  for(var a:accounts){var list=evidence.getOrDefault(a.id(),List.of()).stream().sorted(Comparator.comparing(Evidence::at).thenComparing(e->e.id().toString())).toList();
   var latest=list.isEmpty()?null:list.getLast();var balance=balances.get(a.id());boolean foreign=unsupported.contains(a.id());
   Evidence anchor=latest==null?null:list.stream().filter(e->e.anchor()&&e.at().isBefore(latest.at())&&e.source().equals("MANUAL_ANCHOR")).reduce((x,y)->y).orElseGet(()->list.stream().filter(e->e.anchor()&&e.source().equals("NOTIFICATION")&&e.at().isBefore(latest.at())).findFirst().orElse(null));
   boolean conflict=latest!=null&&conflicting(list,latest)||anchor!=null&&conflicting(list,anchor);
   long pendingCount=pending.getOrDefault(a.id(),List.of()).stream().filter(at->(anchor==null||at.isAfter(anchor.at()))&&(latest==null||!at.isAfter(latest.at()))).distinct().count();
   boolean anchorOnly=latest!=null&&list.stream().filter(e->e.at().equals(latest.at())).allMatch(e->e.source().equals("MANUAL_ANCHOR"));
   // Prefer an actual observation at a non-conflicting tie, solely for provenance; contradictory amounts never win.
   Evidence observed=latest==null?null:list.stream().filter(e->e.at().equals(latest.at())&&!e.source().equals("MANUAL_ANCHOR")).findFirst().orElse(latest);
   BigDecimal ledger=anchor==null||conflict||foreign||anchorOnly?null:anchor.amount().add(product.ledgerDelta(a.id(),anchor.at(),observed.at()));
   BigDecimal difference=ledger==null?null:observed.amount().subtract(ledger);
   String status=latest==null?"NO_OBSERVATION":conflict?"CONFLICT":foreign?"UNSUPPORTED_CURRENCY":anchorOnly?"MANUAL_ANCHOR":anchor==null?"INSUFFICIENT":pendingCount>0?"PENDING":difference.signum()==0?observed.source().equals("USER_MANUAL")?"MANUAL_MATCH":"MATCHED":"MISMATCH";
   String bucket=status.equals("MISMATCH")?"MISMATCH":Set.of("MANUAL_MATCH","MATCHED").contains(status)?"MATCH":"CHECK";
   String reason=switch(status){case "NO_OBSERVATION"->"확인 기록 없음";case "CONFLICT"->"동일 시각 확인 기록 충돌";case "UNSUPPORTED_CURRENCY"->"원통화 확인 필요";case "MANUAL_ANCHOR"->"수동 기준점 · 독립 검증 아님";case "INSUFFICIENT"->"비교 기준점 부족";case "PENDING"->"미등록·미확정 알림 확인 필요";case "MANUAL_MATCH"->"같은 시각 일치 (직접 확인)";case "MATCHED"->"같은 시각 일치 (은행 알림)";default->"같은 시각 잔액 차이";};
   rows.add(new Row(a,foreign||balance.asOf()==null?null:balance.amount(),now,balance.asOf(),balance.provenance(),conflict||observed==null?null:observed.amount(),observed==null?null:observed.at(),observed==null?null:observed.source(),ledger,difference,bucket,status,reason,bucket.equals("MATCH")&&observed.source().equals("NOTIFICATION"),conflict,pendingCount,foreign));
  }
  Map<String,Long> counts=new LinkedHashMap<>();for(String bucket:List.of("MISMATCH","MATCH","CHECK"))counts.put(bucket,rows.stream().filter(r->!r.account().archived()&&r.bucket().equals(bucket)).count());return new Dashboard(now,rows,counts);
 }
 private static boolean conflicting(List<Evidence> list,Evidence target){return list.stream().filter(e->e.at().equals(target.at())).map(Evidence::amount).map(BigDecimal::stripTrailingZeros).distinct().count()>1;}
}
