package com.kafka.backend.exercise;
import java.time.*;
import java.util.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;

/** Validates actual facts separately from targets. Never infers performance from imported values. */
public final class ExerciseRules {
 private ExerciseRules(){}
 static final Set<String> TYPES=Set.of("WEIGHT_REPS","BODYWEIGHT_REPS","WEIGHT_DURATION","DURATION","DISTANCE_DURATION");
 static final Set<String> BASES=Set.of("TOTAL","PER_SIDE","ASSISTANCE","EXTERNAL_LOAD","UNKNOWN_BASIS");
 static void require(boolean ok,String message){if(!ok)throw new ExerciseError(422,"INVALID_DOCUMENT",message);}
 static void bounded(JsonNode n,String key,double max,boolean integer){var v=n.get(key);if(v==null||v.isNull())return;require(v.isNumber()&&Double.isFinite(v.asDouble())&&v.asDouble()>=0&&v.asDouble()<=max&&(!integer||v.asDouble()==v.asLong()),key+" 값을 확인해주세요.");}
 public static void validate(ObjectNode doc,String kind){
  require(doc.path("id").isTextual(),"식별자가 필요합니다.");
  bounded(doc,"globalRest",86400,true);
  if(kind.equals("SETTINGS"))require(doc.path("globalRest").isNumber()&&Set.of("kg","lb").contains(doc.path("unit").asText()),"기본 휴식과 중량 단위를 확인해주세요.");
  if(kind.equals("SESSION")){
   try{LocalDate.parse(doc.path("date").asText());}catch(Exception e){throw new ExerciseError(422,"INVALID_DATE","날짜를 확인해주세요.");}
  }
  if(kind.equals("SESSION")||kind.equals("ROUTINE")){
   require(doc.path("exercises").isArray(),"운동 목록이 필요합니다.");
   var ids=new HashSet<String>();var groups=new LinkedHashMap<String,List<Integer>>();int ei=0;
   for(var ex:doc.withArray("exercises")){
    require(ids.add(ex.path("id").asText())&&!ex.path("id").asText().isBlank(),"종목 식별자가 중복되었습니다.");
    String type=ex.path("measurement").asText(),basis=ex.path("basis").asText();
    require(TYPES.contains(type)&&BASES.contains(basis),"측정 유형과 중량 기준을 확인해주세요.");
    require(Set.of("kg","lb").contains(ex.path("unit").asText("kg")),"중량 단위를 확인해주세요.");
    String group=ex.hasNonNull("groupId")?ex.path("groupId").asText():"";if(!group.isBlank()){require(Set.of("SUPERSET","COMPOUND","CIRCUIT").contains(ex.path("groupType").asText()),"그룹 유형을 확인해주세요.");groups.computeIfAbsent(group,k->new ArrayList<>()).add(ei);}ei++;
    bounded(ex,"rest",86400,true);require(ex.path("sets").isArray(),"세트 목록이 필요합니다.");
    var earlier=new HashSet<String>();int order=0;
    for(var s:ex.path("sets")){
     String sid=s.path("id").asText(),st=s.path("setType").asText("NORMAL");
     require(!sid.isBlank()&&ids.add(sid),"세트 식별자가 중복되었습니다.");
     require(s.path("number").asInt()==++order,"세트 번호는 순서대로 지정해주세요.");
     require(Set.of("NORMAL","WARMUP","DROP","FAILURE").contains(st),"세트 유형을 확인해주세요.");
     if(st.equals("DROP"))require(earlier.contains(s.path("parentSetId").asText()),"드롭 세트는 같은 종목의 앞 세트에 연결해주세요.");
     earlier.add(sid);bounded(s,"rest",86400,true);
     for(String field:List.of("targetRepsMin","targetRepsMax"))bounded(s,field,100000,true);
     for(String field:List.of("targetRirMin","targetRirMax"))bounded(s,field,10,true);
     if(s.hasNonNull("targetRepsMin")&&s.hasNonNull("targetRepsMax"))require(s.path("targetRepsMin").asInt()<=s.path("targetRepsMax").asInt(),"목표 횟수 범위를 확인해주세요.");
     if(s.hasNonNull("targetRirMin")&&s.hasNonNull("targetRirMax"))require(s.path("targetRirMin").asInt()<=s.path("targetRirMax").asInt(),"목표 RIR 범위를 확인해주세요.");
     for(String field:List.of("target","input","actual")){
      var values=s.path(field);bounded(values,"weight",100000,false);bounded(values,"reps",100000,true);bounded(values,"duration",604800,true);bounded(values,"distance",10000000,false);bounded(values,"rir",10,true);
     }
     if(s.path("done").asBoolean()){
      require(!kind.equals("ROUTINE"),"루틴에는 완료 기록을 저장할 수 없습니다.");
      var a=s.path("actual");require(a.isObject(),"완료 세트의 실제 값이 필요합니다.");
      if(type.contains("REPS"))require(a.path("reps").isNumber()&&a.path("reps").asInt()>=(st.equals("FAILURE")?0:1),"실제 횟수를 입력해주세요.");
      if(type.startsWith("WEIGHT"))require(a.path("weight").isNumber(),"실제 중량을 입력해주세요.");
      if(type.contains("DURATION"))require(a.path("duration").isNumber()&&a.path("duration").asLong()>0,"실제 시간을 입력해주세요.");
      if(type.startsWith("DISTANCE"))require(a.path("distance").isNumber()&&a.path("distance").asDouble()>0,"실제 거리를 입력해주세요.");
     }else require(!s.hasNonNull("actual"),"미완료 세트에 실제 값을 저장할 수 없습니다.");
    }
   }
   for(var positions:groups.values())require(positions.size()>=2&&positions.getLast()-positions.getFirst()+1==positions.size(),"인접한 두 종목 이상을 그룹으로 묶어주세요.");
  }
  if(kind.equals("EXERCISE"))require(!doc.path("name").asText().isBlank()&&TYPES.contains(doc.path("measurement").asText())&&BASES.contains(doc.path("basis").asText()),"종목 이름과 측정 기준을 입력해주세요.");
 }
 public static ObjectNode copy(ObjectNode source,String date){
  var result=source.deepCopy();var remap=new HashMap<String,String>();
  result.put("id",UUID.randomUUID().toString());result.put("date",date);result.put("revision",0);result.put("sourceSessionId",source.path("id").asText());result.put("sourceRevision",source.path("revision").asLong());
  for(String key:List.of("deletedAt","purged","startedAt","finishedAt","elapsedSeconds","timer","updatedAt"))result.remove(key);
  for(var e:result.withArray("exercises")){var ex=(ObjectNode)e;String old=ex.path("id").asText();remap.put(old,UUID.randomUUID().toString());ex.put("id",remap.get(old));String group=ex.hasNonNull("groupId")?ex.path("groupId").asText():"";if(!group.isBlank())ex.put("groupId",remap.computeIfAbsent(group,k->UUID.randomUUID().toString()));
   for(var n:ex.withArray("sets")){var s=(ObjectNode)n;String id=s.path("id").asText();remap.put(id,UUID.randomUUID().toString());s.put("id",remap.get(id));var seed=s.hasNonNull("actual")?s.get("actual").deepCopy():s.path("input").deepCopy();if(seed instanceof ObjectNode o)o.remove("rir");s.set("input",seed);s.put("done",false);s.remove(List.of("actual","completedAt","actualRest","completionEventId"));}
   for(var n:ex.withArray("sets")){var s=(ObjectNode)n;if(s.hasNonNull("parentSetId"))s.put("parentSetId",remap.get(s.get("parentSetId").asText()));}
  }return result;
 }
}
