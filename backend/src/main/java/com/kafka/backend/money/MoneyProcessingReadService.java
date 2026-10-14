package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.sql.Timestamp;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyService.require;

/** An observation projection, never a provisional canonical transaction or classification input. */
@Service
public class MoneyProcessingReadService {
 private final JdbcTemplate db;private final CurrentUserProvider users;private final ObjectMapper json;private final MoneyService money;
 private final List<MoneyNotificationParser> parsers=List.of(new ShinhanNotificationParserV1(),new IbkNotificationParserV1(),new WooriNotificationParserV1(),new KakaoNotificationParserV1());
 public MoneyProcessingReadService(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,MoneyService money){this.db=db;this.users=users;this.json=json;this.money=money;}
 private ParsedCandidate candidate(String payload){if(payload==null)return null;var tree=json.readTree(payload);if(tree instanceof tools.jackson.databind.node.ObjectNode object)object.remove("currency");return json.treeToValue(tree,ParsedCandidate.class);}
 private record Observation(MoneyRawNotification raw,ParsedCandidate candidate,String parserKey,String parserVersion,String parseStatus,String candidateCurrency){}
 @Transactional(readOnly=true)
 public Map<String,Object> processing(String from,String to){
  var start=LocalDate.parse(from);var end=LocalDate.parse(to);require(!start.isAfter(end),"Start must precede end");
  var zone=ZoneId.of("Asia/Seoul");var a=start.atStartOfDay(zone).toInstant();var b=end.plusDays(1).atStartOfDay(zone).toInstant();
  UUID owner=users.getCurrentUserId();var accounts=money.accounts();
  // Read latest persisted parsing in one bounded query. RECEIVED rows can be parsed in memory
  // so visibility does not depend on the dispatcher or create a parse attempt as a read side effect.
  var observations=db.query("""
   select r.*,p.candidate::text as parsed_candidate,p.parser_key,p.parser_version,p.status as parse_status,p.candidate->>'currency' as candidate_currency
   from money_raw_notifications r left join lateral(select * from money_parse_attempts p where p.user_id=r.user_id and p.raw_event_id=r.id order by p.created_at desc,p.id desc limit 1) p on true
   where r.user_id=? and r.state in ('RECEIVED','PARSED','REVIEW_REQUIRED','FAILED')
    and coalesce((p.candidate->>'occurredAt')::timestamptz,r.posted_at)>=?
    and coalesce((p.candidate->>'occurredAt')::timestamptz,r.posted_at)<?
    and not exists(select 1 from money_transaction_sources s where s.user_id=r.user_id and s.raw_event_id=r.id)
   order by r.received_at desc,r.id limit 201
   """,(rs,n)->new Observation(money.rawRow(rs,n),candidate(rs.getString("parsed_candidate")),rs.getString("parser_key"),rs.getString("parser_version"),rs.getString("parse_status"),rs.getString("candidate_currency")),owner,Timestamp.from(a.minus(Duration.ofDays(1))),Timestamp.from(b.plus(Duration.ofDays(1))));
  var items=new ArrayList<Map<String,Object>>();
  for(var o:observations.stream().limit(200).toList()){
   var raw=o.raw();var c=o.candidate();
   if(c==null&&raw.state()==ProcessingState.RECEIVED){var parser=parsers.stream().filter(p->p.supports(raw)).findFirst().orElse(null);if(parser==null)continue;c=parser.parse(raw);}
   else if(!"PARSED".equals(o.parseStatus())||c==null||!Objects.equals(o.parserKey(),Objects.toString(c.provider(),"").toLowerCase(Locale.ROOT)+"-push")||!"1.0.0".equals(o.parserVersion()))continue;
   if(!MoneyOrdinaryAdmission.domestic(c)||!Objects.equals(MoneyOrdinaryAdmission.PACKAGES.get(c.provider()),raw.sourcePackage())||!"1.0.0".equals(c.parserVersion())
     ||c.direction()==null||c.amount()==null||c.amount().signum()<=0||c.occurredAt()==null||c.timeSource()==null||c.postedAt()==null||!"KRW".equals(MoneyOrdinaryAdmission.currency(c)))continue;
   if(raw.rawPayload().get("currency")!=null&&!"KRW".equals(raw.rawPayload().get("currency"))||o.candidateCurrency()!=null&&!"KRW".equals(o.candidateCurrency()))continue;
   if(c.occurredAt().isBefore(a)||!c.occurredAt().isBefore(b))continue;
   var resolver=new MoneyAccountResolver();var own=resolver.resolve(accounts,c.provider(),c.direction()==Direction.OUT?c.sourceAccountHint():c.destinationAccountHint()).account();if(own==null)continue;
   String otherHint=c.direction()==Direction.OUT?c.destinationAccountHint():c.sourceAccountHint();
   if(otherHint!=null&&!otherHint.isBlank()&&!resolver.resolve(accounts,c.provider(),otherHint).resolved()&&!MoneyOrdinaryAdmission.externalHint(otherHint))continue;
   boolean terminal=raw.state()==ProcessingState.REVIEW_REQUIRED||raw.state()==ProcessingState.FAILED;
   var row=new LinkedHashMap<String,Object>();row.put("rawEventId",raw.id());row.put("direction",c.direction());row.put("amount",c.amount());row.put("currency","KRW");row.put("accountId",own.id());row.put("accountName",own.displayName());row.put("bankProvider",own.provider());row.put("counterparty",c.counterpartyText());row.put("occurredAt",c.occurredAt());row.put("timeSource",c.timeSource());row.put("timePrecision",c.evidence().get("timePrecision"));row.put("receivedAt",raw.receivedAt());row.put("processingVersion",raw.processingVersion());row.put("status",terminal?"REVIEW_REQUIRED":"PROCESSING");row.put("reasonCode",terminal?raw.processingReason():null);row.put("reasonText",terminal?MoneyAdmissionReasons.text(raw.processingReason()):null);items.add(row);
  }
  return Map.of("items",items,"truncated",observations.size()>200);
 }
}
