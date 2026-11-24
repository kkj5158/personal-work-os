package com.kafka.backend.study;

import static com.kafka.backend.study.StudyException.*;
import static com.kafka.backend.study.StudyValidation.JSON;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.JsonNode;

@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
class LearningQueries {
    final LearningCommands commands;
    final LearningRecords records;
    LearningQueries(LearningCommands commands,LearningRecords records){this.commands=commands;this.records=records;}
    UUID owner(){return commands.owner();}
    long now(){return commands.now();}
    public JsonNode current(){
        var out=JSON.createObjectNode(); UUID owner=owner();
        out.set("session",records.open(owner).map(s->records.detail(owner,s,now())).orElse(null));return out;
    }
    public JsonNode detail(UUID id){UUID owner=owner();return records.detail(owner,records.session(owner,id),now());}
    public JsonNode receipt(UUID key){return records.receipt(owner(),key);}
    public JsonNode context(int limit,String topic){
        require(limit>=0 && limit<=10 && topic.length()<=200);
        var out=JSON.createObjectNode();out.set("current",current().path("session"));
        var list=out.putArray("recent");
        for(var s:records.sessions(owner(),"""
            and status='COMPLETED' and not deleted and (position(lower(?) in lower(summary->>'title'))>0
            or position(lower(?) in lower((summary->'topics')::text))>0) order by effective_start desc,id desc limit ?
            """,topic,topic,limit)){
            var row=LearningRecords.header(s);row.set("summary",s.summary());list.add(row);
        }
        return out;
    }
    static void range(LocalDate from,LocalDate to){require(from!=null && to!=null && to.isAfter(from) && !to.isAfter(from.plusDays(93)));}
    public JsonNode list(LocalDate from,LocalDate to,String cursor,int limit,boolean includeDeleted){
        range(from,to);require(limit>0 && limit<=50);
        long start=Long.MAX_VALUE; UUID last=new UUID(-1,-1);
        if(!cursor.isEmpty()){
            try {var parts=cursor.split("/",-1);require(parts.length==2 && cursor.length()<=80);
                start=Long.parseLong(parts[0]);last=UUID.fromString(parts[1]);}catch(IllegalArgumentException e){throw invalid();}
        }
        UUID owner=owner();
        var rows=records.sessions(owner,"""
            and status='COMPLETED' and (? or not deleted)
            and ((effective_start < ? and effective_end > ?) or exists
            (select 1 from study_learning_day d where d.session_id=id and d.day>=? and d.day<?))
            and (effective_start,id)<(?,?) order by effective_start desc,id desc limit ?
            """,includeDeleted,LearningTime.midnight(to),LearningTime.midnight(from),from,to,start,last,limit+1);
        var out=JSON.createObjectNode();var list=out.putArray("items");
        for(var s:rows.stream().limit(limit).toList()){
            var item=LearningRecords.header(s);
            var total=records.db.queryForObject("select coalesce(sum(seconds),0) from study_learning_day where owner_id=? and session_id=? and day>=? and day<?",Long.class,owner,s.id(),from,to);
            item.put("sliceSeconds",total);list.add(item);
        }
        if(rows.size()>limit){var s=rows.get(limit-1);out.put("nextCursor",s.effectiveStart()+"/"+s.id());}
        return out;
    }
    public JsonNode statistics(LocalDate from,LocalDate to){
        range(from,to); UUID owner=owner();
        String join=" from study_learning_day d join study_learning_session s on s.owner_id=d.owner_id and s.id=d.session_id where d.owner_id=? and d.day>=? and d.day<? and not s.deleted and s.status='COMPLETED' ";
        var byDay=new HashMap<LocalDate,long[]>();
        records.db.query("select day,sum(seconds),count(*)"+join+"group by day",r->{byDay.put(r.getObject(1,LocalDate.class),new long[]{r.getLong(2),r.getLong(3)});},owner,from,to);
        var out=JSON.createObjectNode();var daily=out.putArray("daily");long total=0,count=0;
        for(var date=from;date.isBefore(to);date=date.plusDays(1)){
            var values=byDay.getOrDefault(date,new long[2]);
            daily.addObject().put("date",date.toString()).put("effectiveSeconds",values[0]).put("sessionCount",values[1]);
            total+=values[0];if(values[0]>0)count++;
        }
        return out.put("totalSeconds",total).put("studyDays",count).put("averageSeconds",count==0?0:total/count)
            .put("distinctSessionCount",records.db.queryForObject("select count(distinct d.session_id)"+join,Long.class,owner,from,to));
    }
}
