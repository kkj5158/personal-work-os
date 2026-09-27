package com.kafka.backend.diet;

import java.util.*;
import java.util.regex.Pattern;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.node.ArrayNode;

/** Ordinary NOTE image rows; identity comes from DIET's copy bindings, never captions. */
public final class DietCameraImages {
    private DietCameraImages() {}
    private static final Pattern ROW=Pattern.compile("(?m)^:::images ([^\\n]+)\\n:::[ \\t]*(?:\\n|$)");
    public static String merge(String source,Set<String> owned,List<Map<String,Object>> images,ObjectMapper json){
        var matcher=ROW.matcher(source);var out=new StringBuilder();int end=0;
        while(matcher.find()){
            out.append(source,end,matcher.start());String original=matcher.group();
            // A literal example in fenced code is user text, not a projection.
            long fences=source.substring(0,matcher.start()).lines().filter(s->s.startsWith("```")||s.startsWith("~~~")).count();
            if(fences%2!=0){out.append(original);end=matcher.end();continue;}
            try {
                var row=json.readTree(matcher.group(1));var values=row.get("images");
                if(!(row instanceof ObjectNode object)||!(values instanceof ArrayNode array)){out.append(original);end=matcher.end();continue;}
                var keep=json.createArrayNode();boolean changed=false;
                for(var item:array){if(owned.contains(item.path("src").asText()))changed=true;else keep.add(item);}
                if(!changed)out.append(original);
                else if(!keep.isEmpty()){object.set("images",keep);out.append(":::images ").append(json.writeValueAsString(object)).append("\n:::");if(original.endsWith("\n"))out.append('\n');}
            } catch(RuntimeException e){out.append(original);}
            end=matcher.end();
        }
        out.append(source.substring(end));String remaining=out.toString();
        if(images.isEmpty())return remaining.isBlank()?"":remaining;
        var blocks=new ArrayList<String>();
        for(int i=0;i<images.size();i+=3){var row=new LinkedHashMap<String,Object>();row.put("images",images.subList(i,Math.min(i+3,images.size())));row.put("width",100);row.put("align","left");blocks.add(":::images "+json.writeValueAsString(row)+"\n:::");}
        String block=String.join("\n",blocks);
        // Removing generated rows leaves their separator: consume only the one
        // separator used by our insertion, so repeat projection is byte-stable.
        var diet=Pattern.compile("(?m)^:::diet [^\\n]*\\n:::").matcher(remaining);
        int at=diet.find()?diet.end():0;
        String tail=remaining.substring(at);
        if(tail.startsWith("\n"))tail=tail.substring(1);
        return remaining.substring(0,at)+(at>0?"\n":"")+block+(tail.isEmpty()?"":"\n"+tail);
    }
}
