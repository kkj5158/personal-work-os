package com.kafka.backend.study;

import static com.kafka.backend.study.LearningInput.*;
import static com.kafka.backend.study.LearningRecords.*;
import static com.kafka.backend.study.StudyException.*;
import static com.kafka.backend.study.StudyValidation.JSON;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.orbit.OrbitMoneyProofFilter;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@Service
class LearningCommands {
    final LearningRecords records;
    final CurrentUserProvider users;
    final Clock clock;
    @Autowired LearningCommands(LearningRecords r,CurrentUserProvider u){this(r,u,Clock.systemUTC());}
    LearningCommands(LearningRecords r,CurrentUserProvider u,Clock clock){records=r;users=u;this.clock=clock;}

    public UUID owner(){return users.getCurrentUserId();}
    public long now(){return clock.instant().getEpochSecond();}

    @Transactional
    public JsonNode execute(String action,UUID target,JsonNode body,boolean delegated) {
        bounded(body);
        UUID owner=users.getCurrentUserId(),key=uuid(body,"operationKey");
        records.lock(owner);
        String canonical=records.db.queryForObject("select (?::jsonb)::text",String.class,body.toString());
        String hash=OrbitMoneyProofFilter.digest(action+"/"+target+"/"+canonical);
        var replay=records.db.query("select request_hash,response from study_learning_operation where owner_id=? and operation_key=?",
            (r,i)->Map.entry(r.getString(1),r.getString(2)),owner,key);
        if(!replay.isEmpty()){
            if(!replay.getFirst().getKey().equals(hash))throw conflict();
            return JSON.readTree(replay.getFirst().getValue());
        }
        long now=clock.instant().getEpochSecond();
        if(now<records.latest(owner))throw new StudyException(503,"CLOCK_REGRESSION","서버 시계 복구 후 같은 요청으로 재시도하세요.");
        UUID id=target;
        if(action.equals("start")) {
            fields(body,"operationKey","title","topics");
            var init=JSON.createObjectNode();
            if(body.has("title"))init.put("title",string(body,"title",200));
            if(body.has("topics")){
                var topics=body.path("topics");require(topics.isArray()&&topics.size()<=30);
                for(var item:topics)require(item.isString() && item.asString().length()<=500);
                init.set("topics",topics);
            }
            var open=records.open(owner);
            if(open.isPresent())id=open.get().id();
            else {
                id=UUID.randomUUID();
                records.db.update("insert into study_learning_session(id,owner_id,status,source,started,effective_start,summary,provenance) values (?,?,'ACTIVE',?,?,?,?::jsonb,?)",
                    id,owner,delegated?"CHATGPT_MCP":"WEB",now,now,init.toString(),delegated?"AI_GENERATED":"USER_EDITED");
            }
        } else if(action.equals("manual")) {
            fields(body,"operationKey","effectiveStart","effectiveEnd","allocations","reason","summary");
            string(body,"reason",500);
            long start=instant(body,"effectiveStart"),end=instant(body,"effectiveEnd");
            require(end<=now && start>=0 && end>=start && end-start<=93L*86400);
            var days=allocations(body.path("allocations"),start,end);
            var summary=summary(body.path("summary"));
            id=UUID.randomUUID();records.checkSpan(owner,id,start,end);
            var original=JSON.createObjectNode().put("measurementCoverage","MANUAL").put("receiptId",key.toString());
            original.set("summary",summary);original.set("allocations",body.path("allocations"));
            records.db.update("""
                insert into study_learning_session(id,owner_id,status,source,started,ended,effective_start,effective_end,summary,original,provenance)
                values (?,?,'COMPLETED','MANUAL',?,?,?,?,?::jsonb,?::jsonb,'USER_MANUAL')
                """,id,owner,start,end,start,end,summary.toString(),original.toString());
            records.writeDays(owner,id,days,end);
        } else {
            var s=records.session(owner,id);
            if(number(body,"expectedRevision")!=s.revision())throw conflict();
            transition(owner,s,action,body,key,now,delegated);
            records.db.update("update study_learning_session set revision=revision+1 where id=? and owner_id=?",id,owner);
        }
        var result=records.detail(owner,records.session(owner,id),now);
        result.put("receiptId",key.toString()).put("operationKey",key.toString());
        records.db.update("""
            insert into study_learning_operation(owner_id,session_id,operation_key,at_second,action,request_hash,reason,response)
            values (?,?,?,?,?,?,?,?::jsonb)
            """,owner,id,key,now,action,hash,body.path("reason").asString(null),result.toString());
        return records.receipt(owner,key);
    }
    private void transition(UUID owner,Session s,String action,JsonNode body,UUID key,long now,boolean delegated) {
        UUID id=s.id();
        if(Set.of("update","delete","restore").contains(action)){
            if(!s.status().equals("COMPLETED") || s.deleted()!=action.equals("restore"))throw conflict();
            string(body,"reason",500);
            if(action.equals("update")){
                fields(body,"operationKey","expectedRevision","summary","allocations","effectiveStart","effectiveEnd","reason");
                require(body.has("summary")||body.has("allocations"));
                require(body.has("allocations")||(!body.has("effectiveStart")&&!body.has("effectiveEnd")));
                if(body.has("summary"))records.db.update("update study_learning_session set summary=?::jsonb,provenance='USER_EDITED' where id=? and owner_id=?",
                    summary(body.path("summary")).toString(),id,owner);
                if(body.has("allocations")){
                    long start=body.has("effectiveStart")?instant(body,"effectiveStart"):s.effectiveStart(),
                         end=body.has("effectiveEnd")?instant(body,"effectiveEnd"):s.effectiveEnd();
                    require(start>=0&&end<=now&&end>=start);
                    var days=allocations(body.path("allocations"),start,end);records.checkSpan(owner,id,start,end);
                    records.writeDays(owner,id,days,end);
                    records.db.update("update study_learning_session set effective_start=?,effective_end=? where id=? and owner_id=?",start,end,id,owner);
                }
            } else {
                fields(body,"operationKey","expectedRevision","reason");
                if(action.equals("restore"))records.checkSpan(owner,id,s.effectiveStart(),s.effectiveEnd());
                records.db.update("update study_learning_session set deleted=? where id=? and owner_id=?",action.equals("delete"),id,owner);
            }
            return;
        }
        if(s.ended()!=null)throw conflict();
        switch(action){
            case "pause","resume" -> {
                fields(body,"operationKey","expectedRevision");
                boolean pause=action.equals("pause");
                if(pause!=s.status().equals("ACTIVE"))throw conflict();
                if(pause)records.db.update("insert into study_learning_pause values (?,?,?,?,null)",owner,id,s.revision()+1,now);
                else endPause(owner,id,now);
                records.db.update("update study_learning_session set status=? where id=? and owner_id=?",pause?"PAUSED":"ACTIVE",id,owner);
            }
            case "checkpoints" -> {
                fields(body,"operationKey","expectedRevision","summary","lastQuestion");
                var cp=JSON.createObjectNode().put("revision",s.revision()+1).put("at",iso(now));
                cp.set("summary",summary(body.path("summary")));
                if(body.hasNonNull("lastQuestion"))cp.put("lastQuestion",string(body,"lastQuestion",2000));
                records.db.update("insert into study_learning_checkpoint values (?,?,?,?,?::jsonb)",owner,id,s.revision()+1,now,cp.toString());
            }
            case "complete","cancel" -> {
                boolean complete=action.equals("complete");
                fields(body,"operationKey","expectedRevision",complete?"summary":"reason");
                if(!complete)string(body,"reason",500);
                endPause(owner,id,now);
                if(complete){
                    var sum=summary(body.path("summary"));
                    var t=records.time(owner,s,now);
                    ObjectNode snapshot=breakdown(t).put("receiptId",key.toString()).put("completedAt",iso(now));
                    snapshot.set("summary",sum);
                    records.db.update("update study_learning_session set summary=?::jsonb,original=?::jsonb,provenance=? where id=? and owner_id=?",
                        sum.toString(),snapshot.toString(),delegated?"AI_GENERATED":"USER_EDITED",id,owner);
                    records.writeDays(owner,id,t.measuredDays(),now);
                }
                records.db.update("update study_learning_session set status=?,ended=?,effective_end=? where id=? and owner_id=?",
                    complete?"COMPLETED":"CANCELLED",now,now,id,owner);
                records.db.update("update study_learning_binding set token_hash=null,challenge_hash=null,lease_until=null where session_id=? and owner_id=?",id,owner);
            }
            default -> throw invalid();
        }
    }
    private void endPause(UUID owner,UUID id,long now){
        records.db.update("update study_learning_pause set ended=? where owner_id=? and session_id=? and ended is null",now,owner,id);
    }
}
