package com.kafka.backend.money;

import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.util.*;

/** Request-local draft context. Uses canonical projections/state DTOs and never writes or caches across reads. */
final class MoneyRecommendationDraftReads {
 private final JdbcTemplate db;private final ObjectMapper json;private final MoneyWebService web;private final MoneyClassificationService classification;
 MoneyRecommendationDraftReads(JdbcTemplate db,ObjectMapper json,MoneyWebService web,MoneyClassificationService classification){this.db=db;this.json=json;this.web=web;this.classification=classification;}
 record Revision(UUID draftId,long revision){}
 record Context(Map<UUID,Map<String,Object>> books,Map<UUID,List<Map<String,Object>>> accounts,Map<UUID,List<Map<String,Object>>> reasons,Map<UUID,Map<String,Object>> states,Map<Revision,Map<String,Object>> revisions){}
 @SuppressWarnings("unchecked") private Map<String,Object> object(Object value){return value==null?new LinkedHashMap<>():json.readValue(value.toString(),Map.class);}
 Context load(UUID owner,List<Map<String,Object>> drafts){
  if(drafts.isEmpty()||drafts.size()>50)throw new IllegalArgumentException("Expected one bounded draft chunk");
  var ids=drafts.stream().map(d->(UUID)d.get("transaction_id")).distinct().toList();var books=new LinkedHashMap<UUID,Map<String,Object>>();
  for(var row:db.queryForList(MoneyWebService.BOOK_BASE+"select * from effective where id=any(?)",owner,ids.toArray(UUID[]::new))){row.replaceAll((k,v)->v instanceof Timestamp t?t.toInstant():v);books.put((UUID)row.get("id"),web.decodeBook(row));}
  var accountIds=books.values().stream().map(b->(UUID)b.get("trackingAccountId")).filter(Objects::nonNull).distinct().toArray(UUID[]::new);var accounts=new HashMap<UUID,List<Map<String,Object>>>();
  for(var row:db.queryForList("select id,version,archived from money_accounts where user_id=? and id=any(?)",owner,accountIds))accounts.computeIfAbsent((UUID)row.get("id"),id->new ArrayList<>()).add(row);
  var reasons=new HashMap<UUID,List<Map<String,Object>>>();for(var row:db.queryForList(MoneyReviewService.REASON_CONTEXT+"select id,reason,state from reason_context where id=any(?) and kind='TRANSACTION' order by id,reason",owner,ids.toArray(UUID[]::new))){UUID id=(UUID)row.remove("id");reasons.computeIfAbsent(id,key->new ArrayList<>()).add(row);}
  var states=classification.states(ids);var requested=new LinkedHashSet<Revision>();for(var draft:drafts){UUID id=(UUID)draft.get("id");requested.add(new Revision(id,((Number)draft.get("revision")).longValue()));if(draft.get("candidate_revision")!=null)requested.add(new Revision(id,((Number)draft.get("candidate_revision")).longValue()));}
  var revisions=new HashMap<Revision,Map<String,Object>>();
  for(var row:db.queryForList("select r.draft_id,r.revision,r.category_id as \"categoryId\",r.origin,r.result::text,r.snapshot::text,r.stamp,r.context_version as \"contextVersion\",r.disposition from money_classification_draft_revisions r join unnest(?::uuid[],?::bigint[]) as wanted(draft_id,revision) on r.draft_id=wanted.draft_id and r.revision=wanted.revision where r.user_id=?",requested.stream().map(Revision::draftId).toArray(UUID[]::new),requested.stream().map(Revision::revision).toArray(Long[]::new),owner)){
   UUID id=(UUID)row.remove("draft_id");row.put("result",object(row.get("result")));row.put("snapshot",object(row.get("snapshot")));revisions.put(new Revision(id,((Number)row.get("revision")).longValue()),row);
  }return new Context(books,accounts,reasons,states,revisions);
 }
}
