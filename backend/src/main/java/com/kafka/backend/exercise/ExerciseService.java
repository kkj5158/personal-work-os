package com.kafka.backend.exercise;
import com.kafka.backend.common.CurrentUserProvider;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.security.*;import java.time.*;import java.util.*;import java.nio.charset.StandardCharsets;

@Service @Transactional
public class ExerciseService {
 final JdbcTemplate db;final CurrentUserProvider users;final ObjectMapper json=new ObjectMapper();
 public ExerciseService(JdbcTemplate db,CurrentUserProvider users){this.db=db;this.users=users;}
 ObjectNode object(String s){try{return (ObjectNode)json.readTree(s);}catch(Exception e){throw new ExerciseError(422,"INVALID_JSON","입력 형식을 확인해주세요.");}}
 UUID owner(){return users.getCurrentUserId();}
 UUID id(String value){try{return UUID.fromString(value);}catch(Exception e){throw new ExerciseError(422,"INVALID_ID","식별자를 확인해주세요.");}}
 void lock(){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"exercise:"+owner());}
 @Transactional(readOnly=true) public ObjectNode state(){var result=json.createObjectNode().put("ownerId",owner().toString()).put("serverNow",Instant.now().toString());var a=result.putArray("documents");db.query("select document from exercise_documents where owner_id=? order by updated_at,id",(rs)->{a.add(object(rs.getString(1)));},owner());return result;}
 ObjectNode get(UUID id){var list=db.query("select document from exercise_documents where owner_id=? and id=?",(r,n)->object(r.getString(1)),owner(),id);return list.isEmpty()?null:list.getFirst();}
 String hash(JsonNode n){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical(n).getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
 String canonical(JsonNode n){if(n.isObject()){var keys=new ArrayList<String>();n.fieldNames().forEachRemaining(keys::add);Collections.sort(keys);return "{"+keys.stream().map(k->json.getNodeFactory().textNode(k).toString()+":"+canonical(n.get(k))).collect(java.util.stream.Collectors.joining(","))+"}";}if(n.isArray()){var v=new ArrayList<String>();n.forEach(x->v.add(canonical(x)));return "["+String.join(",",v)+"]";}return n.toString();}
 ObjectNode save(ObjectNode doc,ObjectNode before,UUID mutation){
  String kind=doc.path("kind").asText();ExerciseRules.require(Set.of("SESSION","ROUTINE","EXERCISE","SETTINGS").contains(kind),"문서 유형을 확인해주세요.");
  doc.remove("ownerId");doc.put("revision",before==null?1:before.path("revision").asLong()+1);doc.put("updatedAt",Instant.now().toString());
  ExerciseRules.validate(doc,kind);UUID did=id(doc.path("id").asText());
  db.update("insert into exercise_documents(owner_id,id,kind,revision,document,deleted_at) values(?,?,?,?,?::jsonb,?::timestamptz) on conflict(owner_id,id) do update set revision=excluded.revision,document=excluded.document,deleted_at=excluded.deleted_at,updated_at=now()",owner(),did,kind,doc.path("revision").asLong(),doc.toString(),doc.hasNonNull("deletedAt")?doc.path("deletedAt").asText():null);
  db.update("insert into exercise_audit(owner_id,event_id,mutation_id,document_id,revision,before_document,after_document) values(?,?,?,?,?,?::jsonb,?::jsonb)",owner(),UUID.randomUUID(),mutation,did,doc.path("revision").asLong(),before==null?null:before.toString(),doc.toString());return doc;
 }
 public ObjectNode mutate(ObjectNode request){
  UUID mid=id(request.path("mutationId").asText());String hash=hash(request);lock();
  var receipt=db.query("select payload_hash,response from exercise_mutations where owner_id=? and mutation_id=?",(r,n)->List.of(r.getString(1),r.getString(2)),owner(),mid);
  if(!receipt.isEmpty()){if(!receipt.getFirst().getFirst().equals(hash))throw new ExerciseError(409,"MUTATION_REUSE","같은 요청 번호로 다른 내용을 전송할 수 없습니다.");return object(receipt.getFirst().getLast());}
  var result=json.createObjectNode();var documents=result.putArray("documents");String action=request.path("action").asText("SAVE");
  if(action.equals("COPY_SNAPSHOTS")){
   LocalDate target=LocalDate.parse(request.path("targetDate").asText());ExerciseRules.require(request.path("documents").isArray(),"복사할 운동이 필요합니다.");
   for(var n:request.withArray("documents")){var doc=(ObjectNode)n.deepCopy();var source=get(id(doc.path("sourceSessionId").asText()));
    if(source==null||source.hasNonNull("deletedAt"))throw new ExerciseError(410,"SOURCE_MISSING","복사 원본이 삭제되어 내용을 다시 확인해주세요.");
    if(source.path("revision").asLong()!=doc.path("sourceRevision").asLong())throw new ExerciseError(409,"COPY_SOURCE_CHANGED","복사 원본이 변경되어 내용을 다시 확인해주세요.");
    ExerciseRules.require(doc.path("date").asText().equals(target.toString())&&doc.path("kind").asText().equals("SESSION")&&!source.path("date").asText().equals(target.toString()),"복사 대상 날짜를 확인해주세요.");
    ExerciseRules.require(get(id(doc.path("id").asText()))==null,"복사본 식별자가 중복되었습니다.");
    for(var ex:doc.withArray("exercises"))for(var set:ex.path("sets"))ExerciseRules.require(!set.path("done").asBoolean()&&!set.hasNonNull("actual")&&!set.hasNonNull("completedAt")&&!set.hasNonNull("completionEventId")&&!set.path("input").hasNonNull("rir"),"복사본의 수행값은 초기화해주세요.");
    documents.add(save(doc,null,mid));
   }
  }else if(action.equals("COPY_DATE")){
   LocalDate source=LocalDate.parse(request.path("sourceDate").asText()),target=LocalDate.parse(request.path("targetDate").asText());
   if(!source.equals(target))for(var n:state().withArray("documents")){var doc=(ObjectNode)n;if(doc.path("kind").asText().equals("SESSION")&&doc.path("date").asText().equals(source.toString())&&!doc.hasNonNull("deletedAt"))documents.add(save(ExerciseRules.copy(doc,target.toString()),null,mid));}
  }else{
   ObjectNode doc=(ObjectNode)request.path("document").deepCopy();UUID did=id(doc.path("id").asText());ObjectNode before=get(did);long expected=request.path("expectedRevision").asLong(-1);
   if(expected!=(before==null?0:before.path("revision").asLong()))throw new ExerciseError(409,"REVISION_CONFLICT","다른 기기에서 수정된 기록을 비교해주세요.",Map.of("serverSnapshot",before==null?json.createObjectNode():before));
   if(before!=null&&before.path("purged").asBoolean())throw new ExerciseError(410,"PURGED","영구 삭제된 기록은 다시 저장할 수 없습니다.",Map.of("serverSnapshot",before));
   if(before!=null&&before.hasNonNull("deletedAt")&&!Set.of("RESTORE","PURGE").contains(action))throw new ExerciseError(410,"TRASHED","휴지통 기록을 먼저 복원해주세요.",Map.of("serverSnapshot",before));
   ExerciseRules.require(Set.of("SAVE","TRASH","RESTORE","PURGE").contains(action),"지원하지 않는 변경 요청입니다.");
   if(!action.equals("SAVE")&&before==null)throw new ExerciseError(404,"NOT_FOUND","기록을 찾을 수 없습니다.");
   if(before!=null)ExerciseRules.require(before.path("kind").asText().equals(doc.path("kind").asText()),"문서 유형은 변경할 수 없습니다.");
   if(action.equals("TRASH")){doc=before.deepCopy();doc.put("deletedAt",Instant.now().toString());}
   if(action.equals("RESTORE")){ExerciseRules.require(before!=null&&before.hasNonNull("deletedAt")&&!Instant.parse(before.path("deletedAt").asText()).isBefore(Instant.now().minus(Duration.ofDays(30))),"복원 가능한 기간이 지났습니다.");doc=before.deepCopy();doc.remove("deletedAt");}
   if(action.equals("PURGE")){ExerciseRules.require(before!=null&&before.hasNonNull("deletedAt"),"휴지통에서 영구 삭제해주세요.");doc=json.createObjectNode().put("id",did.toString()).put("kind",before.path("kind").asText()).put("purged",true).put("deletedAt",before.path("deletedAt").asText());if(doc.path("kind").asText().equals("SESSION")){doc.put("date",before.path("date").asText());doc.putArray("exercises");}if(doc.path("kind").asText().equals("ROUTINE"))doc.putArray("exercises");if(doc.path("kind").asText().equals("EXERCISE")){doc.put("name","삭제됨").put("measurement","DURATION").put("basis","UNKNOWN_BASIS");}}
   documents.add(save(doc,before,mid));
  }
  result.put("mutationId",mid.toString());db.update("insert into exercise_mutations(owner_id,mutation_id,payload_hash,response) values(?,?,?,?::jsonb)",owner(),mid,hash,result.toString());return result;
 }
}
