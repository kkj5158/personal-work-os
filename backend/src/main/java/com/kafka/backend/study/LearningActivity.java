package com.kafka.backend.study;

import static com.kafka.backend.study.LearningInput.*;
import static com.kafka.backend.study.StudyException.*;
import static com.kafka.backend.study.StudyValidation.JSON;
import static com.kafka.backend.orbit.OrbitMoneyProofFilter.digest;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

@Service
class LearningActivity {
    final LearningRecords records;
    final LearningCommands commands;
    LearningActivity(LearningRecords records,LearningCommands commands){this.records=records;this.commands=commands;}
    record Binding(UUID owner,UUID session,long generation,long bound,long lease,long seq,long lastEnd){}
    static StudyException denied(){return new StudyException(403,"BINDING_INVALID","학습 연결을 다시 확인하세요.");}
    long now(){return commands.now();}
    @Transactional
    public JsonNode challenge(UUID id,JsonNode input){
        fields(input,"deviceHash");String device=string(input,"deviceHash",64);require(device.matches("[0-9a-f]{64}"));
        var owner=commands.owner();records.lock(owner);
        if(records.session(owner,id).ended()!=null)throw conflict();
        String code=UUID.randomUUID().toString();long expires=now()+300;
        records.db.update("""
            insert into study_learning_binding(owner_id,session_id,pending_device_hash,challenge_hash,challenge_until)
            values (?,?,?,?,?) on conflict(session_id) do update set pending_device_hash=excluded.pending_device_hash,
            challenge_hash=excluded.challenge_hash,challenge_until=excluded.challenge_until
            """,owner,id,device,digest(code),expires);
        return JSON.createObjectNode().put("challenge",code).put("expiresAt",LearningRecords.iso(expires));
    }
    @Transactional
    public JsonNode bind(String secret,JsonNode input){
        fields(input,"challenge");String hash=digest(uuid(input,"challenge").toString());
        var ids=records.db.query("select owner_id,session_id from study_learning_binding where challenge_hash=? and pending_device_hash=?",
            (r,i)->List.of(r.getObject(1,UUID.class),r.getObject(2,UUID.class)),hash,digest(secret));
        if(ids.isEmpty())throw denied();
        var owner=ids.getFirst().getFirst();var id=ids.getFirst().getLast();records.lock(owner);
        if(records.session(owner,id).ended()!=null)throw denied();
        long time=now();
        var generations=records.db.query("""
            update study_learning_binding set generation=generation+1,bound_at=?,last_end=?,last_seq=0,
            lease_until=?,token_hash=pending_device_hash,pending_device_hash=null,challenge_hash=null,challenge_until=null
            where owner_id=? and session_id=? and challenge_hash=? and challenge_until>? and pending_device_hash=?
            returning generation
            """,(r,i)->r.getLong(1),time,time,time+120,owner,id,hash,time,digest(secret));
        if(generations.isEmpty())throw denied();
        return ack(generations.getFirst(),0,time,time+120).put("sessionId",id.toString());
    }
    static tools.jackson.databind.node.ObjectNode ack(long generation,long seq,long now,long lease){
        return JSON.createObjectNode().put("generation",generation).put("ackSequence",seq).put("serverSecond",now).put("leaseUntil",lease);
    }
    Binding locked(String secret){
        String hash=digest(secret);
        var owners=records.db.query("select owner_id from study_learning_binding where token_hash=?",(r,i)->r.getObject(1,UUID.class),hash);
        if(owners.isEmpty())throw denied();
        records.lock(owners.getFirst());
        var rows=records.db.query("""
            select owner_id,session_id,generation,bound_at,lease_until,last_seq,last_end from study_learning_binding
            where owner_id=? and token_hash=?
            """,(r,i)->new Binding(r.getObject(1,UUID.class),r.getObject(2,UUID.class),r.getLong(3),
                r.getLong(4),r.getLong(5),r.getLong(6),r.getLong(7)),owners.getFirst(),hash);
        if(rows.isEmpty())throw denied();
        return rows.getFirst();
    }
    @Transactional
    public JsonNode ingest(String secret,JsonNode body,boolean heartbeat){
        bounded(body);
        if(heartbeat)fields(body,"generation","ackSequence");
        else fields(body,"generation","events","batchId");
        Binding b=locked(secret);long time=now();
        if(b.generation()!=number(body,"generation") || time<b.bound() || time>b.lease())throw denied();
        long seq=b.seq(),end=b.lastEnd();
        if(heartbeat){
            if(number(body,"ackSequence")!=seq)throw conflict();
        }else{
            uuid(body,"batchId");var events=body.path("events");require(events.isArray()&&!events.isEmpty()&&events.size()<=32);
            for(var event:events){
                fields(event,"sequence","start","end","state");
                long n=number(event,"sequence"),left=number(event,"start"),right=number(event,"end");
                String state=string(event,"state",16);require(Set.of("STUDYING","IDLE","AWAY").contains(state));
                if(n<=seq){
                    if(!Boolean.TRUE.equals(records.db.queryForObject("""
                        select exists(select 1 from study_learning_observation where owner_id=? and session_id=? and generation=?
                        and seq=? and started=? and ended=? and state=?)
                        """,Boolean.class,b.owner(),b.session(),b.generation(),n,left,right,state)))throw conflict();
                    continue;
                }
                if(n!=seq+1 || left<end)throw conflict();
                require(right>left && right-left<=65 && left>=b.bound() && left>=time-120 && right<=time);
                records.db.update("insert into study_learning_observation values (?,?,?,?,?,?,?)",
                    b.owner(),b.session(),b.generation(),n,left,right,state);
                seq=n;end=right;
            }
        }
        long lease=time+120;
        records.db.update("update study_learning_binding set last_seq=?,last_end=?,lease_until=? where owner_id=? and session_id=?",
            seq,end,lease,b.owner(),b.session());
        return ack(b.generation(),seq,time,lease);
    }
    @Transactional
    public void revoke(String secret){
        var b=locked(secret);
        records.db.update("update study_learning_binding set token_hash=null,lease_until=null where owner_id=? and session_id=?",b.owner(),b.session());
    }
}
