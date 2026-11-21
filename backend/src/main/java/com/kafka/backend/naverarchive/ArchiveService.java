package com.kafka.backend.naverarchive;

import com.kafka.backend.common.CurrentUserProvider;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class ArchiveService {
 final JdbcTemplate db;final CurrentUserProvider users;final TransactionTemplate tx;
 final ObjectMapper json=new ObjectMapper().findAndRegisterModules();
 static final Set<String> FIELDS=Set.of("title","bodyText","sourceHtml","originalPublishedAt","sourceCategory","sourceVisibility","provenance","fidelityStatus","externalPostId","originalUrl");
 static final String ROW="'NAVER' as source,p.id,p.title,p.original_published_at as \"originalPublishedAt\",p.source_category as \"sourceCategory\",p.source_visibility as \"sourceVisibility\",p.provenance,p.fidelity_status as \"fidelityStatus\",p.is_archived as \"archived\",p.version,p.source_sha256 as \"sourceSha256\",p.external_post_id as \"externalPostId\",p.original_url as \"originalUrl\",p.updated_at as \"updatedAt\",coalesce(r.is_read,false) as \"read\",coalesce(r.position,0) as position";
 static final String JOIN=" from naver_archive_posts p left join naver_archive_read_progress r on r.owner_id=p.owner_id and r.post_id=p.id";
 public ArchiveService(JdbcTemplate db,CurrentUserProvider users,PlatformTransactionManager manager){this.db=db;this.users=users;tx=new TransactionTemplate(manager);}
 UUID owner(){return users.getCurrentUserId();}
 <T>T lock(UUID owner,Supplier<T> work){return tx.execute(status->{db.update("insert into naver_archive_workspaces values(?) on conflict do nothing",owner);db.queryForObject("select owner_id from naver_archive_workspaces where owner_id=? for update",UUID.class,owner);return work.get();});}
 static ArchiveException error(int status,String text){return new ArchiveException(status,text);}
 static String str(Map<String,Object>b,String key,int max,boolean required){Object v=b.get(key);if(v!=null&&!(v instanceof String))throw error(400,"입력 형식을 확인해주세요.");String s=v==null?null:(String)v;if(s!=null&&(s.length()>max||s.indexOf('\0')>=0)||required&&(s==null||s.isBlank()))throw error(400,"필수 항목과 길이 제한을 확인해주세요.");return s;}
 static UUID uuid(Object v){try{return UUID.fromString(String.valueOf(v));}catch(RuntimeException e){throw error(400,"올바른 ID가 아닙니다.");}}
 static long number(Object v){if(!(v instanceof Number n))throw error(400,"버전이 필요합니다.");try{long l=new java.math.BigDecimal(n.toString()).longValueExact();if(l<0)throw new ArithmeticException();return l;}catch(RuntimeException e){throw error(400,"올바른 버전이 아닙니다.");}}
 static void keys(Map<String,Object>b,Set<String> allowed){if(!allowed.containsAll(b.keySet()))throw error(400,"지원하지 않는 입력 항목입니다.");}
 String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw error(400,"JSON을 확인해주세요.");}}
 @SuppressWarnings("unchecked") Map<String,Object> decode(String value){try{return json.readValue(value,LinkedHashMap.class);}catch(Exception e){throw error(400,"JSON을 확인해주세요.");}}
 Map<String,Object> one(String sql,Object...args){var rows=db.queryForList(sql,args);if(rows.isEmpty())throw error(404,"글을 찾을 수 없습니다.");return clean(rows.getFirst());}
 static Map<String,Object> clean(Map<String,Object> row){var r=new LinkedHashMap<String,Object>(row);r.replaceAll((k,v)->v instanceof Timestamp t?t.toInstant().toString():v instanceof java.time.OffsetDateTime t?t.toInstant().toString():v);return r;}
 public Map<String,Object> get(UUID id){return get(owner(),id);}
 Map<String,Object> get(UUID owner,UUID id){var post=one("select "+ROW+",p.body_text as \"bodyText\",p.source_html as \"sourceHtml\",p.safe_html as \"safeHtml\",p.created_at as \"createdAt\""+JOIN+" where p.owner_id=? and p.id=?",owner,id);post.put("assets",db.queryForList("select id,mime_type as \"mimeType\",octet_length(bytes) as size,sha256 from naver_archive_assets where owner_id=? and post_id=? order by id",owner,id));return post;}
 static String value(Map<String,Object>b,String key,String fallback,Set<String> allowed){String v=str(b,key,40,false);if(v==null)v=fallback;if(!allowed.contains(v))throw error(400,"메타데이터 값을 확인해주세요.");return v;}
 Map<String,Object> normalize(Map<String,Object>b,boolean creating){
  var out=new LinkedHashMap<String,Object>();
  for(String k:FIELDS)if(b.containsKey(k))out.put(k,b.get(k));
  out.put("title",str(out,"title",500,true));out.put("bodyText",str(out,"bodyText",500000,true));
  String html=str(out,"sourceHtml",500000,false);out.put("sourceHtml",html);out.put("safeHtml",ArchiveContent.safeHtml(html));
  out.put("sourceCategory",str(out,"sourceCategory",200,false));
  out.put("sourceVisibility",value(out,"sourceVisibility","UNKNOWN",Set.of("PUBLIC","NEIGHBORS","PRIVATE","UNKNOWN")));
  out.put("provenance",value(out,"provenance","OWNER_WEB",Set.of("OWNER_PASTE","OWNER_EXPORT","OWNER_WEB")));
  out.put("fidelityStatus",value(out,"fidelityStatus","NEEDS_REVIEW",Set.of("COMPLETE_OWNER_SUPPLIED","NEEDS_REVIEW","INCOMPLETE","FAILED")));
  if(html!=null&&org.jsoup.Jsoup.parseBodyFragment(html).select("img").stream().anyMatch(img->!img.attr("src").matches("asset:[a-fA-F0-9-]{36}")))out.put("fidelityStatus","NEEDS_REVIEW");
  String date=str(out,"originalPublishedAt",40,false);if(date!=null){try{date=OffsetDateTime.parse(date).toInstant().toString();}catch(RuntimeException e){throw error(400,"원본 날짜는 시간대가 있는 ISO 날짜이거나 null이어야 합니다.");}}out.put("originalPublishedAt",date);
  String external=str(out,"externalPostId",80,false),url=str(out,"originalUrl",1000,false);
  if(external!=null&&!external.matches("[0-9]{1,30}"))throw error(400,"네이버 원본 글 ID를 확인해주세요.");
  if(url!=null&&!url.isBlank()){
   try{var u=java.net.URI.create(url);if(!"https".equals(u.getScheme())||!Set.of("blog.naver.com","m.blog.naver.com").contains(u.getHost())||u.getUserInfo()!=null||u.getPort()!=-1||u.getFragment()!=null)throw new IllegalArgumentException();
    String found=null;if(u.getPath().matches("/[^/]+/[0-9]+/?"))found=u.getPath().replaceAll(".*/([0-9]+)/?$","$1");
    if(u.getRawQuery()!=null)for(String p:u.getRawQuery().split("&"))if(p.matches("logNo=[0-9]{1,30}"))found=p.substring(6);
    if(found!=null){if(external!=null&&!external.equals(found))throw new IllegalArgumentException();external=found;url="https://blog.naver.com/PostView.naver?logNo="+found;}
   }catch(RuntimeException e){throw error(400,"원본 URL은 네이버 블로그 HTTPS 식별 정보만 허용합니다.");}
  }else url=null;
  out.put("externalPostId",external);out.put("originalUrl",url);out.put("sourceSha256",ArchiveContent.hash((String)out.get("bodyText")));return out;
 }
 Map<String,Object> receipt(UUID owner,UUID id,String action,String actor){
  var current=get(owner,id);UUID receipt=UUID.randomUUID();
  db.update("insert into naver_archive_revisions(receipt,owner_id,post_id,version,action,actor,source_sha256,snapshot) values(?,?,?,?,?,?,?,?)",receipt,owner,id,current.get("version"),action,actor,current.get("sourceSha256"),encode(current));
  var result=new LinkedHashMap<String,Object>(current);result.put("auditReceipt",receipt);result.put("action",action);return result;
 }
 Map<String,Object> operation(UUID owner,Map<String,Object>b,String action,Supplier<Map<String,Object>> work){
  UUID request=uuid(b.get("requestId"));String hash=ArchiveContent.hash(action+encode(new TreeMap<>(b)));
  var old=db.queryForList("select fingerprint,result from naver_archive_operations where owner_id=? and request_id=?",owner,request);
  if(!old.isEmpty()){if(!hash.equals(old.getFirst().get("fingerprint")))throw error(409,"같은 요청 ID의 내용이 다릅니다.");return decode((String)old.getFirst().get("result"));}
  var result=work.get();db.update("insert into naver_archive_operations(owner_id,request_id,fingerprint,result) values(?,?,?,?)",owner,request,hash,encode(result));return result;
 }
 public Map<String,Object> outcome(UUID request){return decode((String)one("select result from naver_archive_operations where owner_id=? and request_id=?",owner(),request).get("result"));}
 public Map<String,Object> create(Map<String,Object>b,String actor){var allowed=new HashSet<>(FIELDS);allowed.add("requestId");keys(b,allowed);UUID owner=owner();return lock(owner,()->operation(owner,b,"CREATE",()->{var input=new LinkedHashMap<>(b);if(!input.containsKey("provenance"))input.put("provenance","MCP".equals(actor)?"OWNER_PASTE":"OWNER_WEB");return insert(owner,normalize(input,true),actor);}));}
 Map<String,Object> insert(UUID owner,Map<String,Object>n,String actor){
  if(duplicates(owner,n).stream().anyMatch(d->n.get("externalPostId")!=null&&Objects.equals(n.get("externalPostId"),d.get("externalPostId"))||n.get("originalUrl")!=null&&Objects.equals(n.get("originalUrl"),d.get("originalUrl"))))throw error(409,"동일 원본 ID 또는 URL이 있습니다. 중복 검사를 확인해주세요.");
  UUID id=UUID.randomUUID();db.update("insert into naver_archive_posts(id,owner_id,title,body_text,source_html,safe_html,original_published_at,source_category,source_visibility,provenance,fidelity_status,source_sha256,external_post_id,original_url) values(?,?,?,?,?,?,?::timestamptz,?,?,?,?,?,?,?)",id,owner,n.get("title"),n.get("bodyText"),n.get("sourceHtml"),n.get("safeHtml"),n.get("originalPublishedAt"),n.get("sourceCategory"),n.get("sourceVisibility"),n.get("provenance"),n.get("fidelityStatus"),n.get("sourceSha256"),n.get("externalPostId"),n.get("originalUrl"));return receipt(owner,id,"CREATE",actor);
 }
 public Map<String,Object> update(UUID id,Map<String,Object>b,String actor){var allowed=new HashSet<>(FIELDS);allowed.addAll(Set.of("requestId","expectedVersion"));keys(b,allowed);UUID owner=owner();return lock(owner,()->operation(owner,b,"UPDATE:"+id,()->{
  var current=get(owner,id);version(current,b);var merged=new LinkedHashMap<>(current);for(String k:FIELDS)if(b.containsKey(k))merged.put(k,b.get(k));var n=normalize(merged,false);
  // Imported display references bind to private stored assets, while sourceHtml
  // preserves original local references. Metadata edits must retain that binding.
  if(Objects.equals(n.get("sourceHtml"),current.get("sourceHtml")))n.put("safeHtml",current.get("safeHtml"));
  for(var duplicate:duplicates(owner,n))if(!id.equals(duplicate.get("id"))&&(Objects.equals(n.get("externalPostId"),duplicate.get("externalPostId"))&&n.get("externalPostId")!=null||Objects.equals(n.get("originalUrl"),duplicate.get("originalUrl"))&&n.get("originalUrl")!=null))throw error(409,"동일 원본이 있습니다.");
  db.update("update naver_archive_posts set title=?,body_text=?,source_html=?,safe_html=?,original_published_at=?::timestamptz,source_category=?,source_visibility=?,provenance=?,fidelity_status=?,source_sha256=?,external_post_id=?,original_url=?,version=version+1,updated_at=now() where owner_id=? and id=?",n.get("title"),n.get("bodyText"),n.get("sourceHtml"),n.get("safeHtml"),n.get("originalPublishedAt"),n.get("sourceCategory"),n.get("sourceVisibility"),n.get("provenance"),n.get("fidelityStatus"),n.get("sourceSha256"),n.get("externalPostId"),n.get("originalUrl"),owner,id);return receipt(owner,id,"UPDATE",actor);
 }));}
 static void version(Map<String,Object>current,Map<String,Object>b){if(number(current.get("version"))!=number(b.get("expectedVersion")))throw error(409,"다른 화면에서 수정되었습니다. 새로 읽고 변경사항을 확인해주세요.");}
 public Map<String,Object> archive(UUID id,boolean archived,Map<String,Object>b,String actor){keys(b,Set.of("requestId","expectedVersion"));UUID owner=owner();return lock(owner,()->operation(owner,b,"ARCHIVE:"+id+":"+archived,()->{version(get(owner,id),b);db.update("update naver_archive_posts set is_archived=?,version=version+1,updated_at=now() where owner_id=? and id=?",archived,owner,id);return receipt(owner,id,archived?"ARCHIVE":"RESTORE",actor);}));}
 List<Map<String,Object>> duplicates(UUID owner,Map<String,Object>n){return db.queryForList("select id,external_post_id as \"externalPostId\",original_url as \"originalUrl\",title,source_sha256 as \"sourceSha256\" from naver_archive_posts where owner_id=? and ((external_post_id is not null and external_post_id=?) or (original_url is not null and original_url=?) or source_sha256=?) limit 50",owner,n.get("externalPostId"),n.get("originalUrl"),n.get("sourceSha256"));}
 public Map<String,Object> duplicateCheck(Map<String,Object>b){keys(b,FIELDS);var n=new LinkedHashMap<>(b);if(!n.containsKey("title"))n.put("title","duplicate check");if(!n.containsKey("bodyText"))n.put("bodyText"," ");if(" ".equals(n.get("bodyText")))n.put("bodyText","__NO_BODY_PROVIDED__");return Map.of("matches",duplicates(owner(),normalize(n,false)),"policy","Exact source ID/URL, content hash suggestions; titles never auto-merge.");}
 public Map<String,Object> progress(UUID id,Map<String,Object>b){keys(b,Set.of("read","position"));if(!(b.get("read") instanceof Boolean)||!(b.get("position") instanceof Number n)||!Double.isFinite(n.doubleValue())||n.doubleValue()<0||n.doubleValue()>1)throw error(400,"읽기 위치를 확인해주세요.");UUID owner=owner();return lock(owner,()->{get(owner,id);db.update("insert into naver_archive_read_progress(owner_id,post_id,is_read,position) values(?,?,?,?) on conflict(owner_id,post_id) do update set is_read=excluded.is_read,position=excluded.position,updated_at=now()",owner,id,b.get("read"),b.get("position"));return Map.of("id",id,"read",b.get("read"),"position",b.get("position"));});}
 public Map<String,Object> revisions(UUID id){get(id);return Map.of("items",db.queryForList("select receipt,version,action,actor,source_sha256 as \"sourceSha256\",created_at as \"createdAt\" from naver_archive_revisions where owner_id=? and post_id=? order by version desc limit 100",owner(),id).stream().map(ArchiveService::clean).toList());}
 public Map<String,Object> revision(UUID id,long version){get(id);return decode((String)one("select snapshot from naver_archive_revisions where owner_id=? and post_id=? and version=?",owner(),id,version).get("snapshot"));}
 public Map<String,Object> list(Map<String,String>q){
  if(!Set.of("q","from","to","category","visibility","provenance","fidelity","readState","archived","order","limit","cursor","dateState").containsAll(q.keySet()))throw error(400,"지원하지 않는 필터입니다.");
  String dateState=q.getOrDefault("dateState","all");
  if(!Set.of("all","known","unknown").contains(dateState))throw error(400,"게시일 확인 상태를 확인해주세요.");
  List<Object>a=new ArrayList<>();a.add(owner());StringBuilder where=new StringBuilder(" where p.owner_id=?");
  if(!"all".equals(q.get("archived"))){where.append(" and p.is_archived=?");a.add("true".equals(q.get("archived")));}
  String query=q.getOrDefault("q","");if(query.length()>200)throw error(400,"검색어가 너무 깁니다.");if(!query.isBlank()){where.append(" and (position(lower(?) in lower(p.title||' '||p.body_text||' '||coalesce(p.source_category,'')))>0)");a.add(query);}
  for(String key:List.of("category","visibility","provenance","fidelity"))if(q.containsKey(key)&&!q.get(key).isBlank()){where.append(" and p.").append(Map.of("category","source_category","visibility","source_visibility","provenance","provenance","fidelity","fidelity_status").get(key)).append("=?");a.add(q.get(key));}
  if("unread".equals(q.get("readState")))where.append(" and coalesce(r.is_read,false)=false");
  if("review".equals(q.get("readState")))where.append(" and p.fidelity_status<>'COMPLETE_OWNER_SUPPLIED'");
  // Count missing dates before date constraints, but within the owner's other
  // active filters. A date-range empty state must not imply these posts are gone.
  long unknownDates=db.queryForObject("select count(*)"+JOIN+where+" and p.original_published_at is null",Long.class,a.toArray());
  if(!"all".equals(dateState))where.append(" and p.original_published_at is ").append("unknown".equals(dateState)?"null":"not null");
  for(String key:List.of("from","to"))if(q.containsKey(key)&&!q.get(key).isBlank()){try{var date=LocalDate.parse(q.get(key));where.append(" and p.original_published_at ").append(key.equals("from")?">=":"<").append(" ?::timestamptz");a.add((key.equals("to")?date.plusDays(1):date).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant().toString());}catch(RuntimeException e){throw error(400,"날짜 필터를 확인해주세요.");}}
  long total=db.queryForObject("select count(*)"+JOIN+where,Long.class,a.toArray());
  boolean desc="desc".equals(q.get("order"));String direction=desc?"desc":"asc";
  int limit=50;try{limit=Integer.parseInt(q.getOrDefault("limit","50"));}catch(NumberFormatException e){throw error(400,"페이지 크기를 확인해주세요.");}if(limit<1||limit>100)throw error(400,"페이지 크기는 1–100입니다.");
  if(q.containsKey("cursor")&&!q.get("cursor").isBlank()){
   try{var cursor=decode(new String(Base64.getUrlDecoder().decode(q.get("cursor")),java.nio.charset.StandardCharsets.UTF_8));
    var filters=new TreeMap<>(q);filters.remove("cursor");String signature=ArchiveContent.hash(encode(filters));if(!signature.equals(cursor.get("filters")))throw new IllegalArgumentException();
    UUID id=uuid(cursor.get("id"));String date=(String)cursor.get("date");
    if(date==null){where.append(" and p.original_published_at is null and p.id ").append(desc?"<":">").append(" ?");a.add(id);}
    else {where.append(" and (p.original_published_at is null or (p.original_published_at,p.id) ").append(desc?"<":">").append(" (?::timestamptz,?))");a.add(Instant.parse(date).toString());a.add(id);}
   }catch(RuntimeException e){throw error(400,"페이지 커서가 만료되었거나 필터가 다릅니다.");}
  }
  a.add(limit+1);var rows=db.queryForList("select "+ROW+JOIN+where+" order by p.original_published_at "+direction+" nulls last,p.id "+direction+" limit ?",a.toArray()).stream().map(ArchiveService::clean).toList();
  boolean more=rows.size()>limit;var items=rows.subList(0,Math.min(limit,rows.size()));String next=null;
  if(more){var last=items.getLast();var filters=new TreeMap<>(q);filters.remove("cursor");var c=new LinkedHashMap<String,Object>();c.put("id",last.get("id"));c.put("date",last.get("originalPublishedAt"));c.put("filters",ArchiveContent.hash(encode(filters)));next=Base64.getUrlEncoder().withoutPadding().encodeToString(encode(c).getBytes(java.nio.charset.StandardCharsets.UTF_8));}
  var result=new LinkedHashMap<String,Object>();result.put("items",items);result.put("total",total);result.put("unknownDates",unknownDates);result.put("nextCursor",next);return result;
 }
 public Map<String,Object> summary(){UUID owner=owner();var r=new LinkedHashMap<String,Object>();r.put("counts",one("select count(*) as total,count(*) filter(where original_published_at is null) as \"unknownDates\",count(*) filter(where fidelity_status<>'COMPLETE_OWNER_SUPPLIED') as \"needsReview\",count(*) filter(where is_archived) as archived from naver_archive_posts where owner_id=?",owner));r.put("years",db.queryForList("select extract(year from original_published_at at time zone 'Asia/Seoul') as year,count(*) as count from naver_archive_posts where owner_id=? and not is_archived group by 1 order by 1 nulls last",owner));r.put("categories",db.queryForList("select source_category as category,count(*) as count from naver_archive_posts where owner_id=? and not is_archived group by 1 order by 1",owner));r.put("lastRead",db.queryForList("select post_id as id,position,is_read as \"read\" from naver_archive_read_progress where owner_id=? order by updated_at desc limit 1",owner));r.put("latestImport",db.queryForList("select id,state,manifest_sha256 as \"manifestSha256\" from naver_archive_import_batches where owner_id=? order by created_at desc limit 1",owner));r.put("officialExportCompatibility","UNTESTED_PENDING_USER_ARCHIVE");return r;}
}
