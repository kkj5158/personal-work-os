package com.kafka.backend.workflow.attention;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import java.util.function.Supplier;
import static com.kafka.backend.workflow.attention.AttentionTypes.*;

/** Canonical owner-scoped attention routing. Never updates Project, WorkTask, Waiting or TK state. */
@Service @Transactional
public class AttentionService {
    private final JdbcTemplate db;private final CurrentUserProvider users;private final ObjectMapper json;
    private static final Set<String> KINDS=Set.of("CHATGPT","CODEX_DESKTOP","CODEX_WEB","CLAUDE_CODE","POS","TEAM_KAFKA","WEB","LOCAL_APP");
    public AttentionService(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json){this.db=db;this.users=users;this.json=json;}
    private UUID owner(){return users.getCurrentUserId();}
    private AttentionAuthentication principal(){var p=SecurityContextHolder.getContext().getAuthentication();return p instanceof AttentionAuthentication attention?attention:null;}
    private boolean producer(){var p=principal();return p!=null&&p.producer();}
    private String namespace(){var p=principal();return p!=null&&p.producer()?p.namespace():"human";}
    private void human(){if(producer())throw error(403,"INSUFFICIENT_SCOPE");}
    private static AttentionException error(int status,String code){return new AttentionException(status,code);}
    private void lock(){
        db.update("insert into attention_queues(user_id) values(?) on conflict do nothing",owner());
        db.queryForList("select user_id from attention_queues where user_id=? for update",owner());
        if(db.queryForObject("select count(*) from attention_lanes where user_id=?",Integer.class,owner())==0){
            for(int i=0;i<3;i++)db.update("insert into attention_lanes(id,user_id,name,sort_order) values(?,?,?,?)",UUID.randomUUID(),owner(),List.of("지금 볼 것","구현 확인","나중에 확인").get(i),i);
        }
    }
    private long revision(){return db.queryForObject("select revision from attention_queues where user_id=?",Long.class,owner());}
    private void bump(){db.update("update attention_queues set revision=revision+1 where user_id=?",owner());}
    private long sequence(){long value=db.queryForObject("select next_sequence from attention_queues where user_id=?",Long.class,owner());db.update("update attention_queues set next_sequence=next_sequence+1 where user_id=?",owner());return value;}
    private static Instant instant(ResultSet r,String column)throws SQLException{var value=r.getTimestamp(column);return value==null?null:value.toInstant();}
    private String encode(Object value){return json.writeValueAsString(value);}
    private <T>T decode(String text,Class<T> type){return json.readValue(text,type);}
    private static String text(String value,int max,boolean required){if(value==null){if(required)throw error(400,"INVALID_INPUT");return null;}value=value.strip();if(value.length()>max||required&&value.isEmpty()||value.chars().anyMatch(c->c<32&&c!='\t'))throw error(400,"INVALID_INPUT");return value;}
    static String normalizeUrl(String value){
        if(value==null||value.isBlank())return null;
        if(value.length()>2048||value.chars().anyMatch(c->c<=32))throw error(400,"INVALID_TARGET");
        try{URI uri=URI.create(value).normalize();if(!"https".equalsIgnoreCase(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null)throw error(400,"INVALID_TARGET");
            return new URI("https",null,uri.getHost().toLowerCase(Locale.ROOT),uri.getPort()==443?-1:uri.getPort(),null,null,null).toASCIIString()+(uri.getRawPath().isEmpty()?"/":uri.getRawPath())+(uri.getRawQuery()==null?"":"?"+uri.getRawQuery());
        }catch(java.net.URISyntaxException|IllegalArgumentException e){throw error(400,"INVALID_TARGET");}
    }
    private Source source(Source in){
        if(in==null||in.kind()==null||!KINDS.contains(in.kind()))throw error(400,"INVALID_TARGET");
        String sourceProducer=producer()?namespace():"MANUAL";
        if(in.producer()!=null&&!in.producer().equals(sourceProducer))throw error(403,"INSUFFICIENT_SCOPE");
        String reference=text(in.reference(),512,false),url=normalizeUrl(in.url()),intent=text(in.intent(),64,true),generation=text(in.generation(),128,true);
        localReference(in.kind(),reference);
        String policy=in.completionPolicy()==null?"ACK_ONLY":in.completionPolicy();if(!Set.of("ACK_ONLY","SOURCE_RESOLVED").contains(policy))throw error(400,"INVALID_INPUT");
        return new Source(in.kind(),reference,url,sourceProducer,intent,generation,policy,in.authoredAt());
    }
    private static void localReference(String kind,String reference){if(reference!=null&&Set.of("LOCAL_APP","CODEX_DESKTOP","CLAUDE_CODE").contains(kind)&&(reference.matches("^[A-Za-z]:[\\\\/].*")||reference.startsWith("\\\\")||reference.startsWith("/")||reference.toLowerCase(Locale.ROOT).startsWith("file:")))throw error(400,"INVALID_TARGET");}
    private static String hash(String text){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private static String selectItems(){return "select a.*,p.name as canonical_project_name from attention_items a left join projects p on p.id=a.project_id and p.user_id=a.user_id";}
    private String key(Source source,UUID id){String reference=source.reference()!=null&&!source.reference().isBlank()?source.reference():source.url()!=null?source.url():id.toString();return hash(encode(List.of(owner().toString(),namespace(),source.kind(),reference,source.intent(),source.generation())));}
    private Item row(ResultSet r,int n)throws SQLException{
        UUID project=r.getObject("project_id",UUID.class);String label=r.getString("project_label");
        if(project!=null&&r.getString("canonical_project_name")!=null)label=r.getString("canonical_project_name");
        String action=r.getString("action");return new Item(r.getObject("id",UUID.class),action,project,label,label.isBlank()?action:label+" · "+action,r.getObject("work_task_id",UUID.class),r.getString("status"),r.getObject("lane_id",UUID.class),r.getInt("stack_order"),r.getInt("lane_order"),r.getLong("attention_sequence"),r.getLong("revision"),decode(r.getString("source"),Source.class),r.getString("source_key"),instant(r,"seen_at"),instant(r,"created_at"),instant(r,"updated_at"),instant(r,"completed_at"),instant(r,"dismissed_at"));
    }
    public Item item(UUID id){human();return ownedItem(id);}
    private Item ownedItem(UUID id){var rows=db.query(selectItems()+" where a.id=? and a.user_id=?",this::row,id,owner());if(rows.isEmpty())throw error(404,"ITEM_NOT_FOUND");return rows.getFirst();}
    private List<Lane> lanes(){return db.query("select * from attention_lanes where user_id=? order by sort_order,id",(r,n)->new Lane(r.getObject("id",UUID.class),r.getString("name"),r.getInt("sort_order"),r.getLong("revision")),owner());}
    private Lane lane(UUID id){return lanes().stream().filter(l->l.id().equals(id)).findFirst().orElseThrow(()->error(404,"LANE_NOT_FOUND"));}
    public Snapshot snapshot(){human();lock();return new Snapshot(revision(),lanes(),db.query(selectItems()+" where a.user_id=? and a.status='OPEN' order by a.stack_order,a.id",this::row,owner()),Instant.now(),Map.of("sourceResolution",false,"producerProvisioning",principal()==null));}
    public String etag(Snapshot snapshot){String display=hash(encode(snapshot.items().stream().map(item->List.of(item.id(),item.displayTitle())).toList())).substring(0,12);return "\"attention-"+hash(owner().toString()).substring(0,16)+"-"+snapshot.queueRevision()+"-"+display+"\"";}
    public History history(String status,String cursor,String query){
        human();if(status==null||!Set.of("COMPLETED","DISMISSED").contains(status))throw error(400,"INVALID_INPUT");String search=text(query,100,false);Instant before=null;UUID after=null;
        if(cursor!=null){try{String[] parts=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.US_ASCII).split("\\|",-1);if(parts.length!=2)throw new IllegalArgumentException();before=Instant.parse(parts[0]);after=UUID.fromString(parts[1]);}catch(Exception e){throw error(400,"INVALID_INPUT");}}
        String time=status.equals("COMPLETED")?"completed_at":"dismissed_at";
        var params=new ArrayList<Object>();params.add(owner());params.add(status);String sql=selectItems()+" where a.user_id=? and a.status=?";
        if(search!=null&&!search.isBlank()){sql+=" and (lower(a.action) like ? escape '\\' or lower(coalesce(p.name,a.project_label)) like ? escape '\\' or lower(a.source) like ? escape '\\')";String escaped="%"+search.toLowerCase(Locale.ROOT).replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";params.add(escaped);params.add(escaped);params.add(escaped);}
        if(before!=null){sql+=" and (a."+time+"<? or (a."+time+"=? and a.id<?))";params.add(Timestamp.from(before));params.add(Timestamp.from(before));params.add(after);}
        sql+=" order by a."+time+" desc,a.id desc limit 51";var items=db.query(sql,this::row,params.toArray());String next=null;
        if(items.size()>50){items=new ArrayList<>(items.subList(0,50));var last=items.getLast();next=Base64.getUrlEncoder().withoutPadding().encodeToString(((status.equals("COMPLETED")?last.completedAt():last.dismissedAt())+"|"+last.id()).getBytes(StandardCharsets.US_ASCII));}
        return new History(items,next);
    }
    private Mutation mutation(UUID operation,Item item,boolean includeLanes){return new Mutation(operation,revision(),item,includeLanes?lanes():null);}
    private Mutation apply(UUID operation,String route,Object payload,Supplier<Mutation> work){
        if(operation==null)throw error(400,"INVALID_INPUT");lock();String requestHash=hash(route+"\n"+encode(canonical(json.readValue(encode(payload),Object.class))));
        var prior=db.queryForList("select request_hash,response from attention_operations where user_id=? and namespace=? and operation_id=?",owner(),namespace(),operation);
        if(!prior.isEmpty()){if(!prior.getFirst().get("request_hash").equals(requestHash))throw error(409,"IDEMPOTENCY_MISMATCH");return decode(prior.getFirst().get("response").toString(),Mutation.class);}
        Mutation result=work.get();
        db.update("insert into attention_operations(user_id,namespace,operation_id,request_hash,response) values(?,?,?,?,?)",owner(),namespace(),operation,requestHash,encode(result));
        // Only this owner's expired replay records are retained for 30 days; item source keys never expire.
        db.update("delete from attention_operations where user_id=? and applied_at<?",owner(),Timestamp.from(Instant.now().minusSeconds(30L*86400)));
        return result;
    }
    private static Object canonical(Object value){if(value instanceof Map<?,?> map){var sorted=new TreeMap<String,Object>();map.forEach((key,item)->sorted.put(key.toString(),canonical(item)));return sorted;}if(value instanceof List<?> list)return list.stream().map(AttentionService::canonical).toList();return value;}
    private void expected(Item item,Long revision,String generation){if(generation!=null&&!generation.equals(item.source().generation()))throw new AttentionException(409,"GENERATION_CHANGED",item,revision());if(revision==null||revision!=item.revision())throw new AttentionException(409,"REVISION_CONFLICT",item,revision());}
    private void queueExpected(Long expected){if(expected==null||expected!=revision())throw new AttentionException(409,"QUEUE_ORDER_CHANGED",null,revision());}
    private void linked(UUID project,UUID task){
        if(project!=null&&db.queryForObject("select count(*) from projects where id=? and user_id=?",Integer.class,project,owner())!=1)throw error(404,"PROJECT_NOT_FOUND");
        if(task!=null){var rows=db.queryForList("select project_id from work_tasks where id=? and user_id=?",task,owner());if(rows.isEmpty())throw error(404,"TASK_NOT_FOUND");if(project!=null&&!Objects.equals(rows.getFirst().get("project_id"),project))throw error(400,"INVALID_INPUT");}
    }
    private void capacity(){if(db.queryForObject("select count(*) from attention_items where user_id=? and status='OPEN'",Integer.class,owner())>=1000)throw error(409,"QUEUE_LIMIT");}
    private List<UUID> order(String mode,UUID lane){if(mode.equals("STACK"))return db.queryForList("select id from attention_items where user_id=? and status='OPEN' order by stack_order,id",UUID.class,owner());return db.queryForList("select id from attention_items where user_id=? and lane_id=? and status='OPEN' order by lane_order,id",UUID.class,owner(),lane);}
    private void reorder(String mode,UUID lane,List<UUID> ids){String column=mode.equals("STACK")?"stack_order":"lane_order";for(int i=0;i<ids.size();i++)db.update("update attention_items set "+column+"=? where id=? and user_id=?",i,ids.get(i),owner());}
    private void head(Item item){var stack=order("STACK",null);stack.remove(item.id());stack.addFirst(item.id());reorder("STACK",null,stack);var lane=order("LANE",item.laneId());lane.remove(item.id());lane.addFirst(item.id());reorder("LANE",item.laneId(),lane);}
    public Mutation create(Create in){
        return apply(in.operationId(),"create",in,()->{
            UUID id=in.id()==null?UUID.randomUUID():in.id();Source source=source(in.source());String sourceKey=key(source,id);
            var existing=db.query(selectItems()+" where a.user_id=? and a.source_key=?",this::row,owner(),sourceKey);if(!existing.isEmpty())return mutation(in.operationId(),existing.getFirst(),false);
            if(db.queryForObject("select count(*) from attention_items where id=?",Integer.class,id)>0)throw error(409,"ITEM_ID_CONFLICT");
            if(producer()&&in.laneId()!=null)throw error(403,"INSUFFICIENT_SCOPE");linked(in.projectId(),in.workTaskId());capacity();
            UUID laneId=in.laneId()==null?lanes().getFirst().id():lane(in.laneId()).id();String action=text(in.action(),100,true),label=Objects.requireNonNullElse(text(in.projectLabel(),40,false),"");
            if(in.projectId()!=null)label=db.queryForObject("select name from projects where id=? and user_id=?",String.class,in.projectId(),owner());if(label.length()>40)label=label.substring(0,40);
            db.update("insert into attention_items(id,user_id,action,project_id,project_label,work_task_id,status,lane_id,stack_order,lane_order,attention_sequence,source,source_key,producer_namespace,generation) values(?,?,?,?,?,?,'OPEN',?,0,0,?,?,?,?,?)",id,owner(),action,in.projectId(),label,in.workTaskId(),laneId,sequence(),encode(source),sourceKey,namespace(),source.generation());
            head(ownedItem(id));bump();return mutation(in.operationId(),ownedItem(id),false);
        });
    }
    public Mutation edit(UUID id,Map<String,Object> input){
        human();Set<String> fields=Set.of("operationId","expectedRevision","action","projectId","projectLabel","workTaskId");for(String key:input.keySet())if(!fields.contains(key))throw error(400,"INVALID_INPUT");UUID operation=uuid(input.get("operationId"));
        return apply(operation,"edit:"+id,input,()->{var old=ownedItem(id);expected(old,number(input.get("expectedRevision")),null);String action=input.containsKey("action")?text(string(input.get("action")),100,true):old.action();UUID project=input.containsKey("projectId")?uuid(input.get("projectId")):old.projectId(),task=input.containsKey("workTaskId")?uuid(input.get("workTaskId")):old.workTaskId();if(!Objects.equals(project,old.projectId())||!Objects.equals(task,old.workTaskId()))linked(project,task);String label=input.containsKey("projectLabel")?Objects.requireNonNullElse(text(string(input.get("projectLabel")),40,false),""):old.projectLabel();if(project!=null){var names=db.queryForList("select name from projects where id=? and user_id=?",String.class,project,owner());if(!names.isEmpty())label=names.getFirst();}if(label.length()>40)label=label.substring(0,40);
            db.update("update attention_items set action=?,project_id=?,project_label=?,work_task_id=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?",action,project,label,task,id,owner());bump();return mutation(operation,ownedItem(id),false);});
    }
    private static UUID uuid(Object value){if(value==null||"".equals(value))return null;try{return value instanceof UUID id?id:UUID.fromString(value.toString());}catch(Exception e){throw error(400,"INVALID_INPUT");}}
    private static String string(Object value){if(value!=null&&!(value instanceof String))throw error(400,"INVALID_INPUT");return (String)value;}
    private static Long number(Object value){if(!(value instanceof Number n)||n.doubleValue()!=Math.rint(n.doubleValue())||n.longValue()<0)throw error(400,"INVALID_INPUT");return n.longValue();}
    public Mutation status(UUID id,String status,Action in){
        human();return apply(in.operationId(),status+":"+id,in,()->{var old=ownedItem(id);expected(old,in.expectedRevision(),in.expectedGeneration());if(in.expectedGeneration()==null)throw error(400,"INVALID_INPUT");if(old.status().equals(status))return mutation(in.operationId(),old,false);
            if(status.equals("OPEN")){capacity();db.update("update attention_items set status='OPEN',completed_at=null,dismissed_at=null,human_reopen_count=human_reopen_count+1,attention_sequence=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?",sequence(),id,owner());head(ownedItem(id));}
            else{if(!old.status().equals("OPEN"))throw new AttentionException(409,"REVISION_CONFLICT",old,revision());db.update("update attention_items set status=?,completed_at=?,dismissed_at=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?",status,status.equals("COMPLETED")?Timestamp.from(Instant.now()):null,status.equals("DISMISSED")?Timestamp.from(Instant.now()):null,id,owner());reorder("STACK",null,order("STACK",null));reorder("LANE",old.laneId(),order("LANE",old.laneId()));}
            bump();return mutation(in.operationId(),ownedItem(id),false);});
    }
    public Mutation seen(UUID id,Action in){human();return apply(in.operationId(),"seen:"+id,in,()->{var old=ownedItem(id);if(in.expectedGeneration()==null||!in.expectedGeneration().equals(old.source().generation()))throw new AttentionException(409,"GENERATION_CHANGED",old,revision());if(old.seenAt()==null){db.update("update attention_items set seen_at=current_timestamp,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?",id,owner());bump();}return mutation(in.operationId(),ownedItem(id),false);});}
    public Mutation move(UUID id,Move in){human();return apply(in.operationId(),"move:"+id,in,()->{queueExpected(in.expectedQueueRevision());var old=ownedItem(id);expected(old,in.expectedRevision(),null);if(!old.status().equals("OPEN")||in.mode()==null||!Set.of("STACK","LANE").contains(in.mode()))throw error(400,"INVALID_INPUT");UUID destination=in.mode().equals("LANE")?(in.laneId()==null?old.laneId():lane(in.laneId()).id()):null;
            var ids=order(in.mode(),destination);ids.remove(id);if(Objects.equals(in.beforeItemId(),id))throw error(400,"INVALID_INPUT");int index=in.beforeItemId()==null?ids.size():ids.indexOf(in.beforeItemId());if(index<0)throw error(404,"ITEM_NOT_FOUND");ids.add(index,id);
            db.update("update attention_items set lane_id=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?",destination==null?old.laneId():destination,id,owner());reorder(in.mode(),destination,ids);if(in.mode().equals("LANE")&&!old.laneId().equals(destination))reorder("LANE",old.laneId(),order("LANE",old.laneId()));bump();return mutation(in.operationId(),ownedItem(id),false);});}
    public Mutation target(UUID id,Target in){human();return apply(in.operationId(),"target:"+id,in,()->{var old=ownedItem(id);expected(old,in.expectedRevision(),in.expectedGeneration());if(in.expectedGeneration()==null||in.source()==null||!Objects.equals(old.source().kind(),in.source().kind()))throw error(400,"INVALID_TARGET");String reference=text(in.source().reference(),512,false),url=normalizeUrl(in.source().url());localReference(in.source().kind(),reference);if(old.source().reference()!=null&&!Objects.equals(old.source().reference(),reference)||old.source().url()!=null&&!Objects.equals(normalizeUrl(old.source().url()),url))throw error(409,"TARGET_MEANING_CHANGED");var s=old.source();Source updated=new Source(s.kind(),reference,url,s.producer(),s.intent(),s.generation(),s.completionPolicy(),s.authoredAt());db.update("update attention_items set source=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?",encode(updated),id,owner());bump();return mutation(in.operationId(),ownedItem(id),false);});}
    public Mutation createLane(LaneCreate in){human();return apply(in.operationId(),"lane-create",in,()->{queueExpected(in.expectedQueueRevision());var lanes=lanes();if(lanes.size()>=3)throw error(409,"LANE_LIMIT");db.update("insert into attention_lanes(id,user_id,name,sort_order) values(?,?,?,?)",UUID.randomUUID(),owner(),text(in.name(),20,true),lanes.size());bump();return mutation(in.operationId(),null,true);});}
    public Mutation renameLane(UUID id,LaneRename in){human();return apply(in.operationId(),"lane-rename:"+id,in,()->{var lane=lane(id);if(in.expectedRevision()==null||in.expectedRevision()!=lane.revision())throw error(409,"REVISION_CONFLICT");db.update("update attention_lanes set name=?,revision=revision+1 where id=? and user_id=?",text(in.name(),20,true),id,owner());bump();return mutation(in.operationId(),null,true);});}
    public Mutation orderLanes(LaneOrder in){human();return apply(in.operationId(),"lane-order",in,()->{queueExpected(in.expectedQueueRevision());var lanes=lanes();if(in.laneIds()==null||in.laneIds().size()!=lanes.size()||new HashSet<>(in.laneIds()).size()!=lanes.size()||!new HashSet<>(in.laneIds()).equals(new HashSet<>(lanes.stream().map(Lane::id).toList())))throw error(400,"INVALID_INPUT");for(int i=0;i<in.laneIds().size();i++)db.update("update attention_lanes set sort_order=?,revision=revision+1 where id=? and user_id=?",i,in.laneIds().get(i),owner());bump();return mutation(in.operationId(),null,true);});}
    public Mutation removeLane(UUID id,LaneRemove in){human();return apply(in.operationId(),"lane-remove:"+id,in,()->{queueExpected(in.expectedQueueRevision());lane(id);lane(in.destinationLaneId());if(id.equals(in.destinationLaneId())||lanes().size()<2)throw error(409,"LANE_LIMIT");var destination=order("LANE",in.destinationLaneId());destination.addAll(order("LANE",id));db.update("update attention_items set lane_id=?,revision=revision+1,updated_at=current_timestamp where lane_id=? and user_id=?",in.destinationLaneId(),id,owner());reorder("LANE",in.destinationLaneId(),destination);db.update("delete from attention_lanes where id=? and user_id=?",id,owner());var remaining=lanes();for(int i=0;i<remaining.size();i++)db.update("update attention_lanes set sort_order=?,revision=revision+1 where id=? and user_id=?",i,remaining.get(i).id(),owner());bump();return mutation(in.operationId(),null,true);});}
    public Mutation resolve(Resolution in){
        if(!producer())throw error(403,"INSUFFICIENT_SCOPE");return apply(in.operationId(),"source-resolution",in,()->{if(in.sourceKey()==null||!in.sourceKey().matches("[a-f0-9]{64}"))throw error(400,"INVALID_INPUT");var rows=db.query(selectItems()+" where a.user_id=? and a.source_key=? and a.producer_namespace=?",this::row,owner(),in.sourceKey(),namespace());if(rows.isEmpty())throw error(404,"ITEM_NOT_FOUND");var item=rows.getFirst();if(!Objects.equals(in.generation(),item.source().generation()))throw new AttentionException(409,"GENERATION_CHANGED",item,revision());text(in.resolvedSourceRevision(),128,true);if(!item.source().completionPolicy().equals("SOURCE_RESOLVED"))throw error(403,"INSUFFICIENT_SCOPE");
            int reopen=db.queryForObject("select human_reopen_count from attention_items where id=? and user_id=?",Integer.class,item.id(),owner());
            // A newer explicit human intention wins even when the source generation has not changed.
            if(item.status().equals("OPEN")&&reopen==0){db.update("update attention_items set status='COMPLETED',completed_at=current_timestamp,resolved_source_revision=?,revision=revision+1,updated_at=current_timestamp where id=? and user_id=?",in.resolvedSourceRevision(),item.id(),owner());reorder("STACK",null,order("STACK",null));reorder("LANE",item.laneId(),order("LANE",item.laneId()));bump();}
            return mutation(in.operationId(),ownedItem(item.id()),false);});
    }
}
