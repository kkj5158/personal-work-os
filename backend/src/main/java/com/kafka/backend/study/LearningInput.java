package com.kafka.backend.study;

import static com.kafka.backend.study.StudyException.*;
import static com.kafka.backend.study.StudyValidation.JSON;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

final class LearningInput {
    static void fields(JsonNode n,String... names) { StudyValidation.fields(n,names); }
    static String string(JsonNode n,String key,int max) {
        String value=StudyValidation.text(n,key,max).strip();
        require(value.chars().noneMatch(c->(c<32 && c!=10 && c!=13 && c!=9)||c==127));
        return value;
    }
    static long number(JsonNode n,String key) {
        var v=n.path(key);
        require(v.isIntegralNumber() && v.canConvertToLong() && v.asLong()>=0);
        return v.asLong();
    }
    static UUID uuid(JsonNode n,String key) {
        try { String s=string(n,key,36); UUID id=UUID.fromString(s); require(s.equals(id.toString())); return id; }
        catch(IllegalArgumentException e) {throw invalid();}
    }
    static long instant(JsonNode n,String key) {
        try { Instant at=Instant.parse(string(n,key,40)); require(at.getNano()==0); return at.getEpochSecond(); }
        catch(DateTimeException e) {throw invalid();}
    }
    static void bounded(JsonNode n) {
        if(n.toString().getBytes(StandardCharsets.UTF_8).length>32768)
            throw new StudyException(413,"PAYLOAD_LIMIT","학습 요청 크기를 줄여주세요.");
    }
    static ObjectNode summary(JsonNode n) {
        fields(n,"title","topics","summary","keyTakeaways","userInsights","openQuestions","nextStudyPoint","summaryCoverage");
        var out=JSON.createObjectNode();
        out.put("title",string(n,"title",200));
        require(n.path("summary").isString() && n.path("summary").asString().length()<=8000);
        out.put("summary",n.path("summary").asString().isBlank()?"":string(n,"summary",8000));
        String coverage=string(n,"summaryCoverage",24);
        require(Set.of("AVAILABLE_CONTEXT","PARTIAL_CONTEXT").contains(coverage));
        out.put("summaryCoverage",coverage);
        for(String key:List.of("topics","keyTakeaways","userInsights","openQuestions")) {
            var list=n.path(key); require(list.isArray() && list.size()<=30);
            var dest=out.putArray(key);
            for(var item:list) {
                require(item.isString() && !item.asString().isBlank() && item.asString().length()<=500);
                dest.add(item.asString().strip());
            }
        }
        if(n.hasNonNull("nextStudyPoint")) out.put("nextStudyPoint",string(n,"nextStudyPoint",2000));
        return out;
    }
    static Map<LocalDate,Long> allocations(JsonNode list,long start,long end) {
        require(list.isArray() && !list.isEmpty() && list.size()<=93 && end>=start);
        var result=new TreeMap<LocalDate,Long>();
        for(var item:list) {
            fields(item,"date","effectiveSeconds");
            LocalDate date;
            try {date=LocalDate.parse(string(item,"date",10));} catch(DateTimeException e){throw invalid();}
            long value=number(item,"effectiveSeconds");
            long left=Math.max(start,LearningTime.midnight(date)), right=Math.min(end,LearningTime.midnight(date.plusDays(1)));
            require((left<right || date.equals(LearningTime.day(end)) && value==0) && value<=Math.max(0,right-left));
            require(result.put(date,value)==null);
        }
        result.values().removeIf(s->s==0);
        if(result.isEmpty())result.put(LearningTime.day(end),0L);
        return result;
    }
}
