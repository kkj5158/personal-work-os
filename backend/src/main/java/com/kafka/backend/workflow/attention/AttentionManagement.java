package com.kafka.backend.workflow.attention;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.sql.Timestamp;
import java.nio.charset.StandardCharsets;
import java.security.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.util.*;
import java.util.function.Supplier;
import static com.kafka.backend.workflow.attention.AttentionTypes.*;

/** A bounded owner console. All item writes use the same canonical commands as the web. */
@Service @Transactional
public class AttentionManagement {
    private final AttentionService service;private final AttentionCredentials credentials;private final JdbcTemplate db;private final ObjectMapper json;
    private static final ZoneId KST=ZoneId.of("Asia/Seoul");
    private static final String GROUP_SQL="case when a.status='COMPLETED' or (a.status='DISMISSED' and h.prior_state::jsonb->>'status'='COMPLETED') then 'COMPLETED' else coalesce(a.active_group,l.queue_role) end";
    private static final Set<String> FILTERS=Set.of("view","q","projectId","sourceKind","source","event","group","from","to","createdBefore","ids","batchId");
    public AttentionManagement(AttentionService service,AttentionCredentials credentials,JdbcTemplate db,ObjectMapper json){this.service=service;this.credentials=credentials;this.db=db;this.json=json;}
    private UUID owner(){return service.owner();}
    private void human(){if(SecurityContextHolder.getContext().getAuthentication() instanceof AttentionAuthentication)throw bad(403,"OWNER_AUTH_REQUIRED");}
    private static AttentionException bad(int status,String code){return new AttentionException(status,code);}
    private String encode(Object o){return json.writeValueAsString(o);}
    private Map<String,Object> map(String s){return json.readValue(s,Map.class);}
    private static String hash(String s){return AttentionCredentials.hash(s);}
    private static Object canonical(Object x){if(x instanceof Map<?,?> m){var out=new TreeMap<String,Object>();m.forEach((k,v)->out.put(k.toString(),canonical(v)));return out;}if(x instanceof List<?> l)return l.stream().map(AttentionManagement::canonical).toList();return x;}
    private static void fields(Map<String,Object> in,Set<String> allowed){if(in==null||in.keySet().stream().anyMatch(k->!allowed.contains(k)))throw bad(400,"INVALID_FIELDS");}
    private static String text(Object x,int max,boolean required){if(x==null){if(required)throw bad(400,"REQUIRED_FIELD");return null;}if(!(x instanceof String s)||s.length()>max||s.indexOf('\0')>=0||required&&s.isBlank())throw bad(400,"INVALID_INPUT");return s;}
    private static UUID id(Object x){try{return UUID.fromString(text(x,36,true));}catch(RuntimeException e){throw bad(400,"INVALID_ID");}}
    private static long number(Object x){try{String s=Objects.toString(x,"");if(!s.matches("[0-9]{1,16}"))throw bad(400,"INVALID_VERSION");return Long.parseLong(s);}catch(RuntimeException e){throw bad(400,"INVALID_VERSION");}}
    private static String choice(Object x,String fallback,String...values){String v=x==null?fallback:text(x,40,true);if(!Arrays.asList(values).contains(v))throw bad(400,"INVALID_CHOICE");return v;}
    private UUID child(UUID request,String purpose){return UUID.nameUUIDFromBytes((request+":"+purpose).getBytes(StandardCharsets.UTF_8));}
    private Map<String,Object> envelope(Object data){return Map.of("schemaVersion","work-queue-v1","data",data,"observedAt",Instant.now(),"timezone","Asia/Seoul");}
    private Map<String,Object> operation(String route,Map<String,Object> in,Supplier<Map<String,Object>> work){
        human();UUID request=id(in.get("requestId"));service.lock();String fingerprint=hash(route+"\n"+encode(canonical(in)));
        var previous=db.queryForList("select request_hash,response::text from attention_management_operations where user_id=? and request_id=?",owner(),request);
        if(!previous.isEmpty()){if(!fingerprint.equals(previous.getFirst().get("request_hash")))throw bad(409,"IDEMPOTENCY_MISMATCH");return map(previous.getFirst().get("response").toString());}
        var result=new LinkedHashMap<String,Object>(work.get());result.put("requestId",request);result.put("recordedAt",Instant.now());
        db.update("insert into attention_management_operations(user_id,request_id,request_hash,response) values(?,?,?,cast(? as jsonb))",owner(),request,fingerprint,encode(result));return result;
    }
    private Map<String,Object> window(Map<String,Object> value,int offset,int limit){if(offset<0||offset>2000||limit<1||limit>100)throw bad(400,"PAGE_LIMIT");var out=new LinkedHashMap<String,Object>(value);if(value.get("outcomes") instanceof List<?> all){int start=Math.min(offset,all.size()),end=Math.min(start+limit,all.size());out.put("outcomes",all.subList(start,end));out.put("outcomeCount",all.size());out.put("nextOffset",end<all.size()?end:null);out.put("complete",end==all.size());}return out;}
    public Map<String,Object> outcome(UUID request,int offset,int limit){human();var rows=db.queryForList("select response::text from attention_management_operations where user_id=? and request_id=?",String.class,owner(),request);return envelope(window(rows.isEmpty()?Map.of("status","UNKNOWN","requestId",request,"retryAdvice","Recover using this original requestId; UNKNOWN does not authorize a new requestId"):map(rows.getFirst()),offset,limit));}
    private Map<String,Object> card(Item item,boolean detail){
        var out=new LinkedHashMap<String,Object>();out.put("id",item.id());out.put("title",item.action());out.put("status",item.status());out.put("group",item.queueGroup());out.put("previousOpenGroup",item.previousOpenGroup());out.put("revision",item.revision());out.put("memoRevision",item.memoRevision());out.put("generation",item.source().generation());out.put("createdAt",item.createdAt());out.put("projectId",item.projectId());out.put("projectLabel",item.projectLabel());out.put("sourceKind",item.source().kind());out.put("producer",item.source().producer());out.put("event",item.source().intent());
        if(item.status().equals("DISMISSED")){var prior=db.queryForList("select prior_state from attention_hidden_states where user_id=? and item_id=?",String.class,owner(),item.id());var restoration=prior.isEmpty()?Map.of("status","OPEN","legacy",true):map(prior.getFirst());if("COMPLETED".equals(restoration.get("status")))out.put("group","COMPLETED");if(detail)out.put("restoration",restoration);}
        if(item.content()!=null){
            if(detail)out.put("content",item.content());
            else {
                var preview=new LinkedHashMap<>(Map.of("schemaVersion",item.content().get("schemaVersion"),
                    "contentRevision",item.content().get("contentRevision"),"quality",item.content().get("quality"),
                    "eventId",item.content().getOrDefault("eventId","reservation"),
                    "verificationRevision",item.content().getOrDefault("verificationRevision",0)));
                if("CODEX_DESKTOP".equals(item.content().get("producer"))){
                    preview.put("producer","CODEX_DESKTOP");
                    preview.put("request",item.content().get("request"));
                    preview.put("requestProvenance",item.content().get("requestProvenance"));
                    preview.put("outcome",item.content().get("outcome"));
                }
                out.put("content",preview);
            }
        }
        if(detail){out.put("memo",item.memo());out.put("source",item.source());out.put("sourceKey",item.sourceKey());out.put("updatedAt",item.updatedAt());out.put("completedAt",item.completedAt());out.put("dismissedAt",item.dismissedAt());}
        return out;
    }
    public Map<String,Object> item(UUID id){human();service.lock();return envelope(card(service.item(id),true));}
    private record Selection(String sql,List<Object> params,String view){}
    private Selection select(Map<String,Object> in){
        String view=choice(in.get("view"),"NORMAL","NORMAL","HIDDEN");var params=new ArrayList<Object>();params.add(owner());String sql=" from attention_items a join attention_lanes l on l.id=a.lane_id and l.user_id=a.user_id left join projects p on p.id=a.project_id and p.user_id=a.user_id left join attention_hidden_states h on h.item_id=a.id and h.user_id=a.user_id where a.user_id=? and "+(view.equals("HIDDEN")?"a.status='DISMISSED'":"a.status in ('OPEN','COMPLETED')");
        String q=text(in.get("q"),100,false);if(q!=null&&!q.isBlank()){sql+=" and (position(lower(?) in lower(a.action))>0 or position(lower(?) in lower(a.memo))>0 or position(lower(?) in lower(coalesce(p.name,a.project_label)))>0 or position(lower(?) in lower(coalesce(a.source::jsonb->>'summary','')))>0)";params.add(q);params.add(q);params.add(q);params.add(q);
            if(service.contentVisible()){
                sql=sql.substring(0,sql.length()-1)+" or "+AttentionService.managedSearch()+")";
                params.add(q);
            }
        }
        if(in.get("projectId")!=null){sql+=" and a.project_id=?";params.add(id(in.get("projectId")));}
        for(var filter:Map.of("sourceKind","kind","source","producer","event","intent").entrySet())if(in.get(filter.getKey())!=null){sql+=" and a.source::jsonb->>'"+filter.getValue()+"'=?";params.add(text(in.get(filter.getKey()),64,true));}
        String group=choice(in.get("group"),"ALL","ALL","ACTIVE","DEFERRED","COMPLETED");if(!group.equals("ALL")){sql+=" and ("+GROUP_SQL+")=?";params.add(group);}
        try{
            if(in.get("from")!=null){sql+=" and a.created_at>=?";params.add(Timestamp.from(LocalDate.parse(text(in.get("from"),10,true)).atStartOfDay(KST).toInstant()));}
            if(in.get("to")!=null){sql+=" and a.created_at<?";params.add(Timestamp.from(LocalDate.parse(text(in.get("to"),10,true)).plusDays(1).atStartOfDay(KST).toInstant()));}
            if(in.get("createdBefore")!=null){sql+=" and a.created_at<?";params.add(Timestamp.from(Instant.parse(text(in.get("createdBefore"),40,true))));}
        }catch(DateTimeException e){throw bad(400,"INVALID_DATE");}
        List<?> ids=null;if(in.get("ids")!=null){if(!(in.get("ids") instanceof List<?> list)||list.isEmpty()||list.size()>2000)throw bad(400,"BULK_LIMIT");ids=list;}
        if(in.get("batchId")!=null){if(ids!=null||!view.equals("HIDDEN"))throw bad(400,"INVALID_BATCH_FILTER");var plans=db.queryForList("select targets::text from attention_management_previews where id=? and user_id=? and executed_request_id is not null and plan->>'action'='HIDE'",String.class,id(in.get("batchId")),owner());if(plans.isEmpty())throw bad(404,"BATCH_NOT_FOUND");ids=((List<Map<String,Object>>)json.readValue(plans.getFirst(),List.class)).stream().map(v->v.get("id")).toList();}
        if(ids!=null){if(ids.isEmpty())sql+=" and false";else{sql+=" and a.id in ("+String.join(",",Collections.nCopies(ids.size(),"?"))+")";for(Object value:ids)params.add(id(value));}}
        return new Selection(sql,params,view);
    }
    private Map<String,Long> counts(Selection s){var result=new LinkedHashMap<String,Long>();for(String g:List.of("ACTIVE","COMPLETED","DEFERRED"))result.put(g,0L);db.query("select "+GROUP_SQL+",count(*)"+s.sql()+" group by 1",(r,n)->{result.put(r.getString(1),r.getLong(2));return 0;},s.params().toArray());return result;}
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Map<String,Object> list(Map<String,Object> in,boolean summary){
        human();var allowed=new HashSet<>(FILTERS);allowed.addAll(Set.of("cursor","limit"));fields(in,allowed);service.lock();long revision=service.revision();Selection s=select(in);var global=counts(select(Map.of("view",s.view())));var filtered=counts(s);var out=new LinkedHashMap<String,Object>();out.put("globalTotals",global);out.put("filteredTotals",filtered);out.put("queueRevision",revision);out.put("view",s.view());
        if(!summary){
            long requested=in.get("limit")==null?50:number(in.get("limit"));if(requested<1||requested>100)throw bad(400,"PAGE_LIMIT");int limit=(int)requested;
            var filter=new TreeMap<>(in);filter.remove("cursor");filter.remove("limit");String binding=hash(owner()+"\n"+encode(canonical(filter)));var params=new ArrayList<>(s.params());String where=s.sql();
            if(in.get("cursor")!=null)try{String[] bits=new String(Base64.getUrlDecoder().decode(text(in.get("cursor"),2000,true)),StandardCharsets.UTF_8).split("\\|",-1);if(bits.length!=4||!binding.equals(bits[0]))throw bad(400,"INVALID_CURSOR");if(Long.parseLong(bits[1])!=revision)throw bad(409,"FEED_CHANGED");Instant at=Instant.parse(bits[2]);where+=" and (a.created_at<? or (a.created_at=? and a.id<?))";params.add(Timestamp.from(at));params.add(Timestamp.from(at));params.add(UUID.fromString(bits[3]));}catch(AttentionException e){throw e;}catch(RuntimeException e){throw bad(400,"INVALID_CURSOR");}
            params.add(limit+1);var ids=db.queryForList("select a.id"+where+" order by a.created_at desc,a.id desc limit ?",UUID.class,params.toArray());boolean more=ids.size()>limit;var items=service.itemsForList(ids.stream().limit(limit).toList());out.put("items",items.stream().map(i->card(i,false)).toList());String cursor=null;if(more){var last=items.getLast();cursor=Base64.getUrlEncoder().withoutPadding().encodeToString((binding+"|"+revision+"|"+last.createdAt()+"|"+last.id()).getBytes(StandardCharsets.UTF_8));}out.put("nextCursor",cursor);out.put("complete",!more);
        }
        return envelope(out);
    }
    public Map<String,Object> command(String route,Map<String,Object> in){
        Set<String> extra=switch(route){case "create"->Set.of("title","memo","projectId","sourceUrl");case "edit"->Set.of("id","fields","title","memo","expectedRevision","expectedMemoRevision");case "move"->Set.of("id","group","expectedRevision","expectedGeneration");case "hide","restore"->Set.of("id","expectedRevision","expectedGeneration");case "restore-connection"->Set.of("id","expectedName","possessionProofId");case "revoke-connection"->Set.of("id","expectedName");default->throw bad(404,"COMMAND_NOT_FOUND");};var allowed=new HashSet<>(extra);allowed.add("requestId");fields(in,allowed);
        return envelope(operation(route,in,()->{
            UUID request=id(in.get("requestId"));
            if(route.endsWith("connection"))return connectionCommand(route,in);
            Item result;
            if(route.equals("create")){
                String title=text(in.get("title"),100,true),memo=in.containsKey("memo")?AttentionService.multiline(Objects.requireNonNullElse(text(in.get("memo"),4000,false),""),4000):null;UUID project=in.get("projectId")==null?null:id(in.get("projectId"));String url=AttentionService.normalizeUrl(text(in.get("sourceUrl"),2048,false));
                result=service.create(new Create(child(request,"create"),child(request,"item"),title,project,"",null,new Source("POS",request.toString(),url,"MANUAL","MANUAL",request.toString(),"ACK_ONLY",null),null)).item();if(memo!=null)result=service.memo(result.id(),new Memo(child(request,"memo"),0L,memo)).item();
            }else{
                UUID itemId=id(in.get("id"));Item old=service.item(itemId);long expected=number(in.get("expectedRevision"));if(old.revision()!=expected)throw bad(409,"REVISION_CONFLICT");
                if(route.equals("edit")){
                    if(!(in.get("fields") instanceof List<?> mask)||mask.isEmpty()||mask.size()>2||new HashSet<>(mask).size()!=mask.size()||mask.stream().anyMatch(x->!Set.of("title","memo").contains(x)))throw bad(400,"INVALID_FIELD_MASK");
                    for(String field:List.of("title","memo"))if(mask.contains(field)!=in.containsKey(field))throw bad(400,"FIELD_MASK_MISMATCH");
                    String title=mask.contains("title")?text(in.get("title"),100,true):null,memo=mask.contains("memo")?AttentionService.multiline(Objects.requireNonNullElse(text(in.get("memo"),4000,false),""),4000):null;
                    if(mask.contains("memo")&&number(in.get("expectedMemoRevision"))!=old.memoRevision())throw bad(409,"MEMO_REVISION_CONFLICT");result=old;
                    if(title!=null)result=service.edit(itemId,Map.of("operationId",child(request,"title").toString(),"expectedRevision",expected,"action",title)).item();
                    if(memo!=null)result=service.memo(itemId,new Memo(child(request,"memo"),old.memoRevision(),memo)).item();
                }else{String generation=text(in.get("expectedGeneration"),128,true);var action=new Action(child(request,route),expected,generation);
                    result=switch(route){case "hide"->service.hide(itemId,action).item();case "restore"->{if(!old.status().equals("DISMISSED"))throw bad(409,"NOT_HIDDEN");yield service.status(itemId,"OPEN",action).item();}case "move"->{String group=choice(in.get("group"),null,"ACTIVE","DEFERRED","COMPLETED","REOPEN");if(group.equals("REOPEN")){if(!old.status().equals("COMPLETED"))throw bad(409,"NOT_COMPLETED");group=Objects.requireNonNullElse(old.previousOpenGroup(),"ACTIVE");}yield service.group(itemId,new Group(action.operationId(),expected,generation,group)).item();}default->throw bad(400,"INVALID_COMMAND");};
                }
            }
            return Map.of("status","APPLIED","item",card(result,true));
        }));
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Map<String,Object> preview(Map<String,Object> in){
        var allowed=new HashSet<>(FILTERS);allowed.addAll(Set.of("requestId","action","targetGroup"));fields(in,allowed);
        return envelope(operation("preview",in,()->{
            String action=choice(in.get("action"),null,"HIDE","RESTORE","MOVE");if(action.equals("MOVE"))choice(in.get("targetGroup"),null,"ACTIVE","DEFERRED","COMPLETED");else if(in.containsKey("targetGroup"))throw bad(400,"INVALID_FIELDS");
            var filter=new TreeMap<String,Object>();for(String key:FILTERS)if(in.containsKey(key))filter.put(key,in.get(key));filter.put("view",action.equals("RESTORE")?"HIDDEN":"NORMAL");Selection selection=select(filter);
            var ids=db.queryForList("select a.id"+selection.sql()+" order by a.created_at desc,a.id desc limit 2001",UUID.class,selection.params().toArray());if(ids.size()>2000)throw bad(400,"BULK_LIMIT_NARROW_FILTER");
            var targets=ids.stream().map(service::item).map(i->Map.of("id",i.id(),"revision",i.revision(),"generation",i.source().generation(),"status",i.status(),"group",Objects.requireNonNullElse(i.queueGroup(),"ACTIVE"))).toList();
            UUID preview=UUID.randomUUID();Instant captured=Instant.now(),expires=captured.plusSeconds(600);var plan=new LinkedHashMap<String,Object>();plan.put("action",action);plan.put("targetGroup",in.get("targetGroup"));plan.put("filter",filter);String fingerprint=hash(owner()+"\n"+preview+"\n"+captured+"\n"+encode(canonical(plan))+"\n"+encode(targets));
            db.update("insert into attention_management_previews(id,user_id,fingerprint,plan,targets,captured_at,expires_at) values(?,?,?,cast(? as jsonb),cast(? as jsonb),?,?)",preview,owner(),fingerprint,encode(plan),encode(targets),Timestamp.from(captured),Timestamp.from(expires));
            var out=new LinkedHashMap<String,Object>();out.put("status","PREVIEW");out.put("previewId",preview);out.put("fingerprint",fingerprint);out.put("snapshotCapturedAt",captured);out.put("expiresAt",expires);out.put("candidateCount",targets.size());out.put("groupCounts",counts(selection));out.put("globalTotals",counts(select(Map.of("view",selection.view()))));out.put("alreadyHiddenExcluded",action.equals("RESTORE")?0:db.queryForObject("select count(*) from attention_items where user_id=? and status='DISMISSED'",Long.class,owner()));out.put("membership","IMMUTABLE_SERVER_SIDE_IDS_AND_REVISIONS");out.put("sampleIds",ids.stream().limit(10).toList());out.put("plan",plan);out.put("restorationBatchId",preview);return out;
        }));
    }
    public Map<String,Object> execute(Map<String,Object> in){
        fields(in,Set.of("requestId","previewId","fingerprint","confirmed"));if(!Boolean.TRUE.equals(in.get("confirmed")))throw bad(400,"CONFIRMED_REQUIRED");
        return envelope(window(operation("execute",in,()->{
            UUID preview=id(in.get("previewId")),request=id(in.get("requestId"));var rows=db.queryForList("select * from attention_management_previews where id=? and user_id=? for update",preview,owner());if(rows.isEmpty())throw bad(404,"PREVIEW_NOT_FOUND");var row=rows.getFirst();
            if(!Objects.equals(row.get("fingerprint"),text(in.get("fingerprint"),64,true)))throw bad(409,"FINGERPRINT_MISMATCH");if(row.get("executed_request_id")!=null)throw bad(409,"PREVIEW_ALREADY_EXECUTED");if(!((Timestamp)row.get("expires_at")).toInstant().isAfter(Instant.now()))throw bad(409,"PREVIEW_EXPIRED");
            var targets=(List<Map<String,Object>>)json.readValue(row.get("targets").toString(),List.class);var plan=map(row.get("plan").toString());var conflicts=new ArrayList<Object>();
            for(var target:targets){Item item=service.item(id(target.get("id")));if(item.revision()!=number(target.get("revision"))||!item.source().generation().equals(target.get("generation"))||!item.status().equals(target.get("status")))conflicts.add(Map.of("id",item.id(),"code","REVISION_OR_GENERATION_CONFLICT","expectedRevision",target.get("revision"),"actualRevision",item.revision()));}
            if(!conflicts.isEmpty())return Map.of("status","CONFLICT","code","BULK_REVISION_CONFLICT","previewId",preview,"candidateCount",targets.size(),"appliedCount",0,"outcomes",conflicts);
            var outcomes=new ArrayList<Object>();String action=plan.get("action").toString();
            for(var target:targets){UUID itemId=id(target.get("id"));var command=new Action(child(request,itemId.toString()),number(target.get("revision")),target.get("generation").toString());Item item=switch(action){case "HIDE"->service.hide(itemId,command).item();case "RESTORE"->service.status(itemId,"OPEN",command).item();case "MOVE"->service.group(itemId,new Group(command.operationId(),command.expectedRevision(),command.expectedGeneration(),plan.get("targetGroup").toString())).item();default->throw bad(400,"INVALID_ACTION");};outcomes.add(Map.of("id",item.id(),"status",item.status(),"group",item.queueGroup(),"revision",item.revision(),"sourceKey",item.sourceKey(),"createdAt",item.createdAt()));}
            var result=new LinkedHashMap<String,Object>();result.put("status","APPLIED");result.put("previewId",preview);result.put("restorationBatchId",preview);result.put("snapshotCapturedAt",((Timestamp)row.get("captured_at")).toInstant());result.put("fingerprint",row.get("fingerprint"));result.put("candidateCount",targets.size());result.put("appliedCount",outcomes.size());result.put("conflictedCount",0);result.put("outcomes",outcomes);result.put("normalTotalsAfter",counts(select(Map.of())));
            db.update("update attention_management_previews set executed_request_id=?,receipt=cast(? as jsonb) where id=? and user_id=?",request,encode(result),preview,owner());return result;
        }),0,50));
    }
    public Map<String,Object> connections(){human();return envelope(Map.of("connections",credentials.devices(),"deliveryStatus","NOT_DEMONSTRATED_BY_REGISTRATION_OR_LAST_USED"));}
    private Map<String,Object> connectionCommand(String route,Map<String,Object> in){
        UUID credential=id(in.get("id"));var device=credentials.devices().stream().filter(d->d.id().equals(credential)).findFirst().orElseThrow(()->bad(404,"CONNECTION_NOT_FOUND"));if(!device.name().equals(text(in.get("expectedName"),60,true)))throw bad(409,"CONNECTION_IDENTITY_CHANGED");
        if(route.equals("restore-connection")){
            if(!device.kind().equals("PRODUCER")||device.revokedAt()!=null)throw bad(409,"CONNECTION_NOT_RESTORABLE");
            if(db.update("update attention_key_possession set consumed=true where id=? and user_id=? and credential_id=? and verified=true and consumed=false and expires_at>current_timestamp",id(in.get("possessionProofId")),owner(),credential)!=1)throw bad(403,"LOCAL_KEY_POSSESSION_REQUIRED");credentials.restore(credential);
        }else credentials.revoke(credential);
        return Map.of("status","APPLIED","connectionId",credential,"name",device.name(),"action",route,"deliveryStatus","NOT_DEMONSTRATED");
    }
    /** Ordinary authenticated owner flow only; never exposed as a secret-reading MCP tool. */
    public Map<String,Object> possession(UUID credential,Map<String,Object> in){
        human();fields(in,Set.of("challengeId","response"));var devices=credentials.devices();if(devices.stream().noneMatch(d->d.id().equals(credential)&&d.kind().equals("PRODUCER")&&d.revokedAt()==null))throw bad(404,"CONNECTION_NOT_FOUND");
        if(in.isEmpty()){UUID id=UUID.randomUUID();byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);String nonce=HexFormat.of().formatHex(bytes);Instant expires=Instant.now().plusSeconds(300);db.update("insert into attention_key_possession(id,user_id,credential_id,nonce,expires_at) values(?,?,?,?,?)",id,owner(),credential,nonce,Timestamp.from(expires));return envelope(Map.of("challengeId",id,"message","work-queue-key-possession-v1\n"+credential+"\n"+nonce,"expiresAt",expires));}
        UUID challenge=id(in.get("challengeId"));var rows=db.queryForList("select p.nonce,c.token_hash from attention_key_possession p join attention_credentials c on c.id=p.credential_id and c.user_id=p.user_id where p.id=? and p.user_id=? and p.credential_id=? and p.consumed=false and p.verified=false and p.expires_at>current_timestamp for update of p",challenge,owner(),credential);if(rows.isEmpty())throw bad(403,"POSSESSION_PROOF_INVALID");
        try{var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(HexFormat.of().parseHex(rows.getFirst().get("token_hash").toString()),"HmacSHA256"));String message="work-queue-key-possession-v1\n"+credential+"\n"+rows.getFirst().get("nonce");byte[] answer=HexFormat.of().parseHex(text(in.get("response"),64,true));if(!MessageDigest.isEqual(answer,mac.doFinal(message.getBytes(StandardCharsets.UTF_8))))throw bad(403,"POSSESSION_PROOF_INVALID");}catch(AttentionException e){throw e;}catch(Exception e){throw bad(403,"POSSESSION_PROOF_INVALID");}
        db.update("update attention_key_possession set verified=true where id=? and user_id=?",challenge,owner());return envelope(Map.of("possessionProofId",challenge,"validForSeconds",300));
    }
}
