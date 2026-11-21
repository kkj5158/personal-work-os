package com.kafka.backend.naverarchive;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class NaverRssSyncService {
 static final String PENDING="('PARTIAL_NEEDS_SOURCE','POSSIBLE_DUPLICATE_REVIEW','SOURCE_EDIT_REVIEW')";
 static final String POLICY="NAVER_RSS_SHARING_EXCEPTION_20261121";
 final ArchiveService s;final NaverRssSource source;final boolean available;final Clock clock;
 @org.springframework.beans.factory.annotation.Autowired
 public NaverRssSyncService(ArchiveService s,NaverRssSource source,@Value("${APP_NAVER_RSS_SYNC_ENABLED:false}") boolean available){this(s,source,available,Clock.systemUTC());}
 NaverRssSyncService(ArchiveService s,NaverRssSource source,boolean available,Clock clock){this.s=s;this.source=source;this.available=available;this.clock=clock;}
 static String instant(Instant v){return v==null?null:v.toString();}
 Map<String,Object> config(UUID owner){var rows=s.db.queryForList("select * from naver_archive_rss_config where owner_id=?",owner);return rows.isEmpty()?new LinkedHashMap<>():rows.getFirst();}
 void ensure(UUID owner){s.db.update("insert into naver_archive_rss_config(owner_id) values(?) on conflict do nothing",owner);}
 public Map<String,Object> status(){return status(s.owner());}
 Map<String,Object> status(UUID owner){
  var c=config(owner);var out=new LinkedHashMap<String,Object>();out.put("available",available);out.put("enabled",Boolean.TRUE.equals(c.get("enabled")));out.put("version",c.getOrDefault("version",0L));out.put("blogId",NaverRssFeed.BLOG);out.put("mode","RSS_PARTIAL_DISCOVERY");out.put("fullArchiveEnabled",false);out.put("policyRevision",POLICY);out.put("scheduler","EXISTING_POS_API_DEDICATED_SPRING");out.put("cron","0 */10 * * * *");out.put("timeZone","UTC");out.put("retentionWarning","RSS_LATEST_N_ONLY_PRIVATE_POSTS_NOT_DISCOVERABLE");
  for(String[] pair:new String[][]{{"baselineAt","baseline_at"},{"lastAttemptAt","last_attempt_at"},{"lastSuccessAt","last_success_at"},{"nextRetryAt","next_retry_at"},{"lastErrorCategory","last_error_category"}})out.put(pair[0],ArchiveService.clean(c).get(pair[1]));
  out.put("policyBlocked",Boolean.TRUE.equals(c.get("policy_blocked")));out.put("coverageGap",Boolean.TRUE.equals(c.get("coverage_gap")));
  out.put("backlog",s.db.queryForObject("select count(*) from naver_archive_rss_items where owner_id=? and state in "+PENDING,Long.class,owner));
  var runs=s.db.queryForList("select result from naver_archive_rss_runs where owner_id=? order by finished_at desc,id desc limit 1",owner);out.put("lastRun",runs.isEmpty()?null:s.decode((String)runs.getFirst().get("result")));return out;
 }
 public Map<String,Object> configure(Map<String,Object> body){
  if(!Set.of("requestId","expectedVersion","enabled").containsAll(body.keySet())||!(body.get("enabled") instanceof Boolean enabled))throw ArchiveService.error(400,"자동 확인 설정을 확인해주세요.");
  long expected=ArchiveService.number(body.get("expectedVersion"));UUID owner=s.owner();
  return s.tx.execute(tx->{if(!sourceLock())throw ArchiveService.error(409,"RSS 확인 작업이 실행 중입니다. 잠시 뒤 설정을 바꿔주세요.");return s.lock(owner,()->s.operation(owner,body,"RSS_CONFIG",()->{
   var c=config(owner);if(((Number)c.getOrDefault("version",0L)).longValue()!=expected)throw ArchiveService.error(409,"설정이 바뀌었습니다. 새로 확인해주세요.");
   if(enabled&&(!available||Boolean.TRUE.equals(c.get("policy_blocked"))))throw ArchiveService.error(409,"서버 비활성화 또는 플랫폼 접근 차단을 먼저 확인해주세요.");
   if(c.isEmpty())s.db.update("insert into naver_archive_rss_config(owner_id,enabled) values(?,?)",owner,enabled);
   else s.db.update("update naver_archive_rss_config set enabled=?,version=version+1 where owner_id=?",enabled,owner);
   return status(owner);
  }));});
 }
 public Map<String,Object> runNow(Map<String,Object> body){if(!Set.of("requestId").containsAll(body.keySet()))throw ArchiveService.error(400,"확인 요청을 확인해주세요.");return run(s.owner(),ArchiveService.uuid(body.get("requestId")),"MANUAL");}
 List<UUID> enabledOwners(){return available?s.db.queryForList("select owner_id from naver_archive_rss_config where enabled and not policy_blocked order by owner_id limit 100",UUID.class):List.of();}
 void scheduled(){for(UUID owner:enabledOwners()){long bucket=clock.instant().getEpochSecond()/600;UUID request=UUID.nameUUIDFromBytes(("NAVER_RSS:"+owner+":"+bucket).getBytes(StandardCharsets.UTF_8));run(owner,request,"SCHEDULED");}}
 boolean sourceLock(){return Boolean.TRUE.equals(s.db.queryForObject("select pg_try_advisory_xact_lock(hashtextextended('ORBIT_NAVER_RSS_yozo990',0))",Boolean.class));}
 Map<String,Object> skip(String state){return Map.of("state",state,"inserted",0,"updated",0,"fullArchiveEnabled",false);}
 Map<String,Object> run(UUID owner,UUID request,String trigger){
  if(!available)return skip("DISABLED");
  return s.tx.execute(tx->{
   // Source-wide, transaction-scoped: no duplicate fetch or processing across replicas.
   boolean held=sourceLock();
   if(!held)return skip("SKIPPED_OVERLAP");
   ensure(owner);var previous=s.db.queryForList("select result from naver_archive_rss_runs where owner_id=? and request_id=?",owner,request);if(!previous.isEmpty())return s.decode((String)previous.getFirst().get("result"));
   var c=config(owner);Instant now=clock.instant();
   if("SCHEDULED".equals(trigger)&&!Boolean.TRUE.equals(c.get("enabled")))return skip("DISABLED");
   if(Boolean.TRUE.equals(c.get("policy_blocked")))return skip("POLICY_BLOCKED");
   Object next=c.get("next_retry_at");if(next!=null&&Instant.parse((String)ArchiveService.clean(c).get("next_retry_at")).isAfter(now))return skip("RETRY_LATER");
   // Bound manual checks as well as scheduler activity. This never bypasses Retry-After.
   Object attempt=c.get("last_attempt_at");if(attempt!=null&&Instant.parse((String)ArchiveService.clean(c).get("last_attempt_at")).plusSeconds(60).isAfter(now))return skip("MINIMUM_INTERVAL");
   s.db.update("update naver_archive_rss_config set last_attempt_at=?::timestamptz where owner_id=?",instant(now),owner);
   var result=new LinkedHashMap<String,Object>();result.put("id",UUID.randomUUID().toString());result.put("requestId",request.toString());result.put("trigger",trigger);result.put("startedAt",instant(now));result.put("inserted",0);result.put("updated",0);result.put("fullArchiveEnabled",false);String hash=null,error=null;
   try{
    NaverRssFeed.Feed feed=source.fetch();hash=feed.hash();final var config=c;
    var counts=s.lock(owner,()->process(owner,feed,config,now));result.putAll(counts);result.put("state",feed.invalid()>0?"PARTIAL":"SUCCESS_RSS_ONLY");
    boolean gap=c.get("last_success_at")!=null&&feed.oldest()!=null&&Instant.parse((String)ArchiveService.clean(c).get("last_success_at")).isBefore(feed.oldest());
    s.db.update("update naver_archive_rss_config set baseline_at=coalesce(baseline_at,?::timestamptz),last_success_at=?::timestamptz,next_retry_at=null,failures=0,last_error_category=?,coverage_gap=coverage_gap or ? where owner_id=?",instant(now),instant(now),feed.invalid()>0?"INVALID_FEED_ITEMS":null,gap,owner);
   }catch(NaverRssFeed.Failure failure){
    error=failure.category;int failures=((Number)c.getOrDefault("failures",0)).intValue()+1;long backoff=Math.min(1800,30L*(1L<<Math.min(6,failures-1)));long jitter=Math.floorMod(request.getLeastSignificantBits(),Math.max(1,backoff/5));Instant retry=now.plusSeconds(backoff+jitter);if(failure.retryAt!=null&&failure.retryAt.isAfter(retry))retry=failure.retryAt;
    s.db.update("update naver_archive_rss_config set failures=?,next_retry_at=?::timestamptz,policy_blocked=?,enabled=case when ? then false else enabled end,version=version+case when ? and enabled then 1 else 0 end,last_error_category=? where owner_id=?",failures,failure.blocked?null:instant(retry),failure.blocked,failure.blocked,failure.blocked,error,owner);
    result.put("state",failure.blocked?"POLICY_BLOCKED":"RETRYABLE_ERROR");result.put("blocked",failure.blocked?1:0);result.put("failed",failure.blocked?0:1);result.put("discovered",0);result.put("partial",0);result.put("unchanged",0);result.put("lastErrorCategory",error);
   }
   result.put("finishedAt",instant(clock.instant()));s.db.update("insert into naver_archive_rss_runs(owner_id,request_id,id,trigger_kind,started_at,finished_at,state,feed_sha256,error_category,result) values(?,?,?, ?,?::timestamptz,?::timestamptz,?,?,?,?)",owner,request,ArchiveService.uuid(result.get("id")),trigger,result.get("startedAt"),result.get("finishedAt"),result.get("state"),hash,error,s.encode(result));return result;
  });
 }
 Map<String,Object> process(UUID owner,NaverRssFeed.Feed feed,Map<String,Object> config,Instant now){
  var changes=new ArrayList<Map<String,Object>>();int discovered=0,partial=0,unchanged=0,queueUpdated=0;boolean baseline=config.get("baseline_at")==null;
  Map<String,Map<String,Object>> posts=new HashMap<>();for(var p:s.db.queryForList("select id,external_post_id from naver_archive_posts where owner_id=? and external_post_id is not null",owner))posts.put((String)p.get("external_post_id"),p);
  for(var e:feed.items()){
   var old=s.db.queryForList("select source_sha256,state from naver_archive_rss_items where owner_id=? and blog_id=? and external_post_id=?",owner,NaverRssFeed.BLOG,e.id());var existing=posts.get(e.id());List<String> duplicates=existing==null?duplicateIds(owner,e):List.of();
   String state;if(existing!=null){boolean changed=!old.isEmpty()&&!e.hash().equals(old.getFirst().get("source_sha256"));state=changed||!old.isEmpty()&&"SOURCE_EDIT_REVIEW".equals(old.getFirst().get("state"))?"SOURCE_EDIT_REVIEW":"EXISTING_ARCHIVE";}
   else if(!duplicates.isEmpty())state="POSSIBLE_DUPLICATE_REVIEW";
   else if(baseline&&e.published()!=null&&e.published().isBefore(now.minus(Duration.ofDays(7))))state="BASELINE_ONLY";
   else if(!old.isEmpty()&&"BASELINE_ONLY".equals(old.getFirst().get("state")))state="BASELINE_ONLY";
   else state="PARTIAL_NEEDS_SOURCE";
   if(old.isEmpty()&&!Set.of("EXISTING_ARCHIVE","BASELINE_ONLY").contains(state))discovered++;
   if(Set.of("PARTIAL_NEEDS_SOURCE","POSSIBLE_DUPLICATE_REVIEW","SOURCE_EDIT_REVIEW").contains(state))partial++;
   if(!old.isEmpty()&&e.hash().equals(old.getFirst().get("source_sha256")))unchanged++;else if(!old.isEmpty())queueUpdated++;
   if(old.isEmpty()||!e.hash().equals(old.getFirst().get("source_sha256"))||!state.equals(old.getFirst().get("state"))){var change=new LinkedHashMap<String,Object>();change.put("externalPostId",e.id());change.put("beforeSourceSha256",old.isEmpty()?null:old.getFirst().get("source_sha256"));change.put("afterSourceSha256",e.hash());change.put("beforeState",old.isEmpty()?null:old.getFirst().get("state"));change.put("afterState",state);changes.add(change);}
   s.db.update("insert into naver_archive_rss_items(owner_id,blog_id,external_post_id,title,category,published_at,original_url,excerpt,source_sha256,state,truncated,first_seen_at,last_seen_at,linked_post_id,duplicate_ids) values(?,?,?,?,?,?::timestamptz,?,?,?,?,?,?::timestamptz,?::timestamptz,?,?) on conflict(owner_id,provider,blog_id,external_post_id) do update set title=excluded.title,category=excluded.category,published_at=excluded.published_at,original_url=excluded.original_url,excerpt=excluded.excerpt,source_sha256=excluded.source_sha256,state=excluded.state,truncated=excluded.truncated,last_seen_at=excluded.last_seen_at,linked_post_id=excluded.linked_post_id,duplicate_ids=excluded.duplicate_ids",owner,NaverRssFeed.BLOG,e.id(),e.title(),e.category(),instant(e.published()),e.url(),e.excerpt(),e.hash(),state,e.truncated(),instant(now),instant(now),existing==null?null:existing.get("id"),s.encode(duplicates));
  }
  return Map.of("feedItems",feed.items().size(),"discovered",discovered,"partial",partial,"unchanged",unchanged,"queueUpdated",queueUpdated,"blocked",0,"failed",feed.invalid(),"changes",changes);
 }
 List<String> duplicateIds(UUID owner,NaverRssFeed.Entry e){
  String prefix=e.excerpt().replaceAll("(?:\\.{3,}|…+)\\s*$","").strip().replaceAll("(?U)\\s+"," ");boolean longPrefix=prefix.codePointCount(0,prefix.length())>=80;
  return s.db.queryForList("select id from naver_archive_posts where owner_id=? and external_post_id is null and (original_url=? or source_sha256=? or (? and left(regexp_replace(trim(body_text),'[[:space:]]+',' ','g'),?)=?) or (title=? and ?::timestamptz is not null and original_published_at=?::timestamptz)) order by id limit 5",UUID.class,owner,e.url(),ArchiveContent.hash(e.excerpt()),longPrefix,prefix.codePointCount(0,prefix.length()),prefix,e.title(),instant(e.published()),instant(e.published())).stream().map(UUID::toString).toList();
 }
 public Map<String,Object> items(Map<String,String> q){
  if(!Set.of("limit","cursor").containsAll(q.keySet()))throw ArchiveService.error(400,"대기함 조건을 확인해주세요.");int limit;try{limit=Integer.parseInt(q.getOrDefault("limit","20"));if(limit<1||limit>50)throw new IllegalArgumentException();}catch(RuntimeException e){throw ArchiveService.error(400,"대기함 페이지 크기를 확인해주세요.");}
  UUID owner=s.owner();String where=" where owner_id=? and state in "+PENDING;List<Object> args=new ArrayList<>();args.add(owner);
  if(q.containsKey("cursor")){try{if(q.get("cursor").length()>2000)throw new IllegalArgumentException();var c=s.decode(new String(Base64.getUrlDecoder().decode(q.get("cursor")),StandardCharsets.UTF_8));Instant at=Instant.parse((String)c.get("firstSeenAt"));String id=(String)c.get("externalPostId");if(id==null||!id.matches("[0-9]{1,30}"))throw new IllegalArgumentException();where+=" and (first_seen_at,external_post_id)<(?::timestamptz,?)";args.add(at.toString());args.add(id);}catch(RuntimeException e){throw ArchiveService.error(400,"대기함 커서를 확인해주세요.");}}
  args.add(limit+1);var rows=s.db.queryForList("select external_post_id as \"externalPostId\",title,category,published_at as \"publishedAt\",original_url as \"originalUrl\",excerpt,source_sha256 as \"sourceSha256\",state,media_incomplete as \"mediaIncomplete\",truncated,first_seen_at as \"firstSeenAt\",duplicate_ids as \"duplicateIds\",linked_post_id as \"linkedPostId\" from naver_archive_rss_items"+where+" order by first_seen_at desc,external_post_id desc limit ?",args.toArray()).stream().map(ArchiveService::clean).toList();
  boolean more=rows.size()>limit;var resultRows=new ArrayList<>(rows.subList(0,Math.min(limit,rows.size())));for(var row:resultRows){@SuppressWarnings("unchecked") List<String> ids=readIds((String)row.remove("duplicateIds"));List<Map<String,Object>> candidates=new ArrayList<>();for(String id:ids)candidates.addAll(s.db.queryForList("select id,title,version,original_published_at as \"originalPublishedAt\" from naver_archive_posts where owner_id=? and id=?",owner,ArchiveService.uuid(id)).stream().map(ArchiveService::clean).toList());row.put("duplicateCandidates",candidates);}
  var out=new LinkedHashMap<String,Object>();out.put("items",resultRows);out.put("total",s.db.queryForObject("select count(*) from naver_archive_rss_items where owner_id=? and state in "+PENDING,Long.class,owner));String cursor=null;if(more){var last=resultRows.getLast();cursor=Base64.getUrlEncoder().withoutPadding().encodeToString(s.encode(Map.of("firstSeenAt",last.get("firstSeenAt"),"externalPostId",last.get("externalPostId"))).getBytes(StandardCharsets.UTF_8));}out.put("nextCursor",cursor);return out;
 }
 List<String> readIds(String json){try{return Arrays.asList(s.json.readValue(json,String[].class));}catch(Exception e){return List.of();}}
 Map<String,Object> item(UUID owner,String external){if(external==null||!external.matches("[0-9]{1,30}"))throw ArchiveService.error(400,"글 ID를 확인해주세요.");return s.one("select * from naver_archive_rss_items where owner_id=? and blog_id=? and external_post_id=?",owner,NaverRssFeed.BLOG,external);}
 public Map<String,Object> link(String external,Map<String,Object> body){
  if(!Set.of("postId","requestId","expectedVersion").containsAll(body.keySet()))throw ArchiveService.error(400,"연결 요청을 확인해주세요.");UUID owner=s.owner(),post=ArchiveService.uuid(body.get("postId"));
  return s.lock(owner,()->{boolean replayed=!s.db.queryForList("select request_id from naver_archive_operations where owner_id=? and request_id=?",owner,ArchiveService.uuid(body.get("requestId"))).isEmpty();var item=item(owner,external);var current=s.get(owner,post);Object prior=current.get("externalPostId");if(prior!=null&&!external.equals(prior))throw ArchiveService.error(409,"다른 원본 ID가 연결된 글입니다.");
   var update=new LinkedHashMap<String,Object>();update.put("requestId",body.get("requestId"));update.put("expectedVersion",body.get("expectedVersion"));update.put("externalPostId",external);update.put("originalUrl",item.get("original_url"));var saved=s.update(post,update,"WEB");
   if(!replayed)s.db.update("update naver_archive_rss_items set state='EXISTING_ARCHIVE',linked_post_id=?,duplicate_ids='[]' where owner_id=? and external_post_id=?",post,owner,external);
   return Map.of("postId",post.toString(),"version",saved.get("version"),"sourceSha256",saved.get("sourceSha256"),"auditReceipt",saved.get("auditReceipt"));});
 }
 public Map<String,Object> acknowledge(String external,Map<String,Object> body){
  if(!Set.of("requestId","sourceSha256").containsAll(body.keySet()))throw ArchiveService.error(400,"변경 확인 요청을 확인해주세요.");UUID owner=s.owner();return s.lock(owner,()->s.operation(owner,body,"RSS_ACK:"+external,()->{var item=item(owner,external);if(item.get("linked_post_id")==null||!Objects.equals(body.get("sourceSha256"),item.get("source_sha256")))throw ArchiveService.error(409,"원본 변경 또는 연결 상태를 다시 확인해주세요.");s.db.update("update naver_archive_rss_items set state='EXISTING_ARCHIVE' where owner_id=? and external_post_id=?",owner,external);return Map.of("state","EXISTING_ARCHIVE","externalPostId",external);}));
 }
}
