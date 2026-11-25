package com.kafka.backend.study;

import static com.kafka.backend.study.StudyException.*;
import static com.kafka.backend.study.StudyValidation.JSON;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@Component
class LearningRecords {
    final JdbcTemplate db;
    LearningRecords(JdbcTemplate db) { this.db=db; }

    record Session(UUID id,String status,String source,long started,Long ended,long revision,boolean deleted,
                   JsonNode summary,String provenance,JsonNode original,long effectiveStart,Long effectiveEnd) {}
    List<Session> sessions(UUID owner,String clause,Object... args) {
        var params=new ArrayList<Object>(); params.add(owner); Collections.addAll(params,args);
        return db.query("select * from study_learning_session where owner_id=? "+clause,
            (r,i)->new Session(r.getObject("id",UUID.class),r.getString("status"),r.getString("source"),
                r.getLong("started"),r.getObject("ended",Long.class),r.getLong("revision"),r.getBoolean("deleted"),
                JSON.readTree(r.getString("summary")),r.getString("provenance"),
                r.getString("original")==null?null:JSON.readTree(r.getString("original")),
                r.getLong("effective_start"),r.getObject("effective_end",Long.class)),params.toArray());
    }
    Session session(UUID owner,UUID id) {
        return sessions(owner,"and id=?",id).stream().findFirst().orElseThrow(StudyException::missing);
    }
    Optional<Session> open(UUID owner) {
        return sessions(owner,"and ended is null").stream().findFirst();
    }
    void lock(UUID owner) {
        // Exists even for a first-ever owner. All writers take this lock before checking revisions.
        db.query("select pg_advisory_xact_lock(hashtextextended(?::text, 133))",r->{},owner.toString());
    }
    long latest(UUID owner) {
        return db.queryForObject("select coalesce(max(at_second),0) from study_learning_operation where owner_id=?",Long.class,owner);
    }
    JsonNode receipt(UUID owner,UUID key) {
        return db.query("select response from study_learning_operation where owner_id=? and operation_key=?",
            (r,i)->JSON.readTree(r.getString(1)),owner,key).stream().findFirst().orElseThrow(StudyException::missing);
    }
    JsonNode checkpoint(UUID owner,UUID id) {
        return db.query("select payload from study_learning_checkpoint where owner_id=? and session_id=? order by revision desc limit 1",
            (r,i)->JSON.readTree(r.getString(1)),owner,id).stream().findFirst().orElse(JSON.nullNode());
    }
    LearningTime.Totals time(UUID owner,Session s,long end) {
        var obs=db.query("select started,ended,state from study_learning_observation where owner_id=? and session_id=?",
            (r,i)->new LearningTime.Span(r.getLong(1),r.getLong(2),r.getString(3)),owner,s.id());
        var pauses=db.query("select started,coalesce(ended,?) from study_learning_pause where owner_id=? and session_id=?",
            (r,i)->new LearningTime.Span(r.getLong(1),r.getLong(2),"MANUAL_PAUSED"),end,owner,s.id());
        return LearningTime.project(s.started(),end,obs,pauses);
    }
    static ObjectNode breakdown(LearningTime.Totals t) {
        var out=JSON.createObjectNode();
        out.put("elapsedSeconds",t.elapsedSeconds()).put("measuredSeconds",t.measuredSeconds())
            .put("idleSeconds",t.idleSeconds()).put("awaySeconds",t.awaySeconds())
            .put("manualPausedSeconds",t.manualPausedSeconds()).put("unobservedSeconds",t.unobservedSeconds())
            .put("measurementCoverage",t.measurementCoverage());
        var days=out.putArray("allocations");
        t.measuredDays().forEach((date,sec)->days.addObject().put("date",date.toString()).put("measuredSeconds",sec));
        return out;
    }
    static ObjectNode header(Session s) {
        var out=JSON.createObjectNode();
        out.put("sessionId",s.id().toString()).put("status",s.status()).put("source",s.source())
            .put("revision",s.revision()).put("deleted",s.deleted()).put("provenance",s.provenance())
            .put("startedAt",iso(s.started())).put("endedAt",iso(s.ended()))
            .put("effectiveStart",iso(s.effectiveStart())).put("effectiveEnd",iso(s.effectiveEnd()))
            .put("title",s.summary().path("title").asString("")).put("summarySchemaVersion",1);
        return out;
    }
    static String iso(Long t){return t==null?null:Instant.ofEpochSecond(t).toString();}
    ObjectNode detail(UUID owner,Session s,long now) {
        var out=header(s); out.set("summary",s.summary());out.set("checkpoint",checkpoint(owner,s.id()));
        if(s.original()!=null)out.set("original",s.original());
        var days=out.putArray("allocations");
        var entries=db.query("select day,seconds from study_learning_day where owner_id=? and session_id=? order by day",
            (r,i)->Map.entry(r.getString(1),r.getLong(2)),owner,s.id());
        long effective=0;
        for(var e:entries) {days.addObject().put("date",e.getKey()).put("effectiveSeconds",e.getValue());effective+=e.getValue();}
        out.put("effectiveSeconds",effective);
        if(s.ended()==null) {
            out.set("provisional",breakdown(time(owner,s,Math.max(s.started(),now))));
            var binding=db.query("select case when token_hash is null then 'UNBOUND' when lease_until>=? then 'CONNECTED' else 'DISCONNECTED' end from study_learning_binding where owner_id=? and session_id=?",
                (r,i)->r.getString(1),now,owner,s.id());
            out.put("bindingState",binding.stream().findFirst().orElse("UNBOUND")).put("asOf",iso(now));
        }
        return out;
    }
    void writeDays(UUID owner,UUID id, Map<LocalDate,Long> days,long end) {
        db.update("delete from study_learning_day where owner_id=? and session_id=?",owner,id);
        if(days.isEmpty()) days=Map.of(LearningTime.day(end),0L);
        days.forEach((date,sec)->db.update("insert into study_learning_day values (?,?,?,?)",owner,id,date,sec));
    }
    void checkSpan(UUID owner,UUID id,long start,long end) {
        if(start==end)return;
        var overlaps=db.query("""
            select id from study_learning_session where owner_id=? and id<>? and not deleted and status<>'CANCELLED'
            and effective_start < ? and (effective_end is null or effective_end > ? and effective_end > effective_start) limit 1
            """,(r,i)->r.getString(1),owner,id,end,start);
        if(!overlaps.isEmpty()) throw new StudyException(409,"OVERLAP","겹치는 대화 기록 "+overlaps.getFirst());
    }
}
