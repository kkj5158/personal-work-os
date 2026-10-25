package com.kafka.backend.diet;

import java.util.*;
import java.util.regex.*;
import tools.jackson.databind.ObjectMapper;

/** Lossless Markdown body bridge. Managed dashboard/Camera rows never become mobile text. */
public final class DietJournalContent {
    private DietJournalContent() {}
    private static final Pattern BLOCK=Pattern.compile("(?m)^:::diet ([^\\n]*)\\n:::[ \\t]*(?:\\n|$)");
    public record Snapshot(String note, Long version) {}
    public static boolean hasDashboard(String content){var m=BLOCK.matcher(content);while(m.find())if(!fenced(content,m.start()))return true;return false;}
    public static Snapshot snapshot(String content,ObjectMapper json){
        var m=BLOCK.matcher(content==null?"":content);
        while(m.find()){
            if(fenced(content,m.start()))continue;
            try{var n=json.readTree(m.group(1));return new Snapshot(n.path("note").asText(""),n.has("noteVersion")?n.path("noteVersion").asLong():null);}catch(RuntimeException ignored){}
        }
        return new Snapshot("",null);
    }
    static boolean fenced(String source,int at){
        char fence=0;int length=0;
        for(String line:source.substring(0,at).split("\\n")){
            var m=Pattern.compile("^ {0,3}(`{3,}|~{3,})(.*)$").matcher(line);
            if(!m.matches())continue;String run=m.group(1);
            if(length==0){fence=run.charAt(0);length=run.length();}
            else if(run.charAt(0)==fence&&run.length()>=length&&m.group(2).isBlank())length=0;
        }
        return length>0;
    }
    public static String body(String content,Set<String> cameraRefs,ObjectMapper json){
        String source=content==null?"":content;var m=BLOCK.matcher(source);var out=new StringBuilder();int end=0;
        while(m.find()){out.append(source,end,m.start());if(fenced(source,m.start()))out.append(m.group());end=m.end();}
        out.append(source.substring(end));
        return separators(DietCameraImages.merge(out.toString(),cameraRefs,List.of(),json));
    }
    private static String separators(String value){return value.replaceAll("\\A(?:[ \\t]*\\r?\\n)+","").replaceAll("(?:\\r?\\n[ \\t]*)+\\z","");}
    /** The legacy web body is retained ahead of the shared text until the next explicit web save adopts it. */
    public static String projectBody(String body,String oldText,String text){
        String current=separators(body),old=oldText==null?"":separators(oldText),next=text==null||text.isBlank()?"":text;
        if(current.equals(old)||current.isBlank())return next;
        if(!old.isBlank()&&current.endsWith(old))return separators(current.substring(0,current.length()-old.length())+next);
        if(next.isBlank()||current.equals(next)||current.endsWith("\n\n"+next))return current;
        if(!old.isBlank())throw new com.kafka.backend.common.OptimisticLockConflictException("기존 웹 일지와 모바일 기록을 함께 확인한 뒤 저장하세요. 어느 내용도 덮어쓰지 않았습니다.");
        return current+"\n\n"+next;
    }
    public static String withSnapshot(String source,String text,long version,ObjectMapper json){
        var m=BLOCK.matcher(source);StringBuffer out=new StringBuffer();
        while(m.find()){
            if(fenced(source,m.start()))continue;
            try{var n=(tools.jackson.databind.node.ObjectNode)json.readTree(m.group(1));n.put("note",text);n.put("noteVersion",version);
                m.appendReplacement(out,Matcher.quoteReplacement(":::diet "+json.writeValueAsString(n)+"\n:::"+(m.group().endsWith("\n")?"\n":"")));
            }catch(RuntimeException ignored){}
        }
        m.appendTail(out);return out.toString();
    }
}
