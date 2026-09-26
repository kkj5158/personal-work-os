package com.kafka.backend.diet;

import tools.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Pattern;
import static com.kafka.backend.diet.DietTypes.*;

/**
 * DIET SYS -> NOTE SYS projection of one date. The projection is a single
 * DIET-managed atom block inside the NOTE SYS Daily note:
 *
 * <pre>:::diet {"v":1,"date":"2026-09-26",...}
 * :::</pre>
 *
 * The JSON stays on one line (the NOTE editor and backend link parser skip that
 * line), so it is replaced in place on every refresh and never appended twice.
 * Everything outside the block is the owner's own NOTE SYS content and is kept.
 * DIET SYS remains canonical: the block is a read-only snapshot, never parsed
 * back into DIET data.
 */
public final class DietNoteProjection {
    private DietNoteProjection() {}
    public static final String PREFIX=":::diet ";
    private static final Pattern BLOCK=Pattern.compile("(?m)^:::diet [^\\n]*\\n:::[ \\t]*(?:\\n|$)");
    private static final List<String> MEASUREMENTS=List.of("morningWeight","morningGlucose","morningBloodKetone","morningBreathKetone","bedtimeGlucose","bedtimeBloodKetone","bedtimeBreathKetone");
    private static final List<ChallengeRole> ROLE_ORDER=List.of(ChallengeRole.CURRENT_FOCUS,ChallengeRole.NEXT_FOCUS,ChallengeRole.FINAL_GOAL);

    /** Whether the date holds any canonical DIET content worth projecting. */
    public static boolean hasContent(LocalDate date,Data data,String note){
        if(note!=null&&!note.isBlank())return true;
        if(data.checks().stream().anyMatch(c->c.date().equals(date)&&c.state()!=CheckState.MISSING))return true;
        return data.days().stream().filter(d->d.date().equals(date)).anyMatch(d->!measurements(d).isEmpty());
    }

    private static Map<String,Object> measurements(DailyRecord d){
        var values=new LinkedHashMap<String,Object>();
        Double[] all={d.morningWeight(),d.morningGlucose(),d.morningBloodKetone(),d.morningBreathKetone(),d.bedtimeGlucose(),d.bedtimeBloodKetone(),d.bedtimeBreathKetone()};
        for(int i=0;i<all.length;i++)if(all[i]!=null)values.put(MEASUREMENTS.get(i),all[i]);
        return values;
    }

    /** Items live on the date: started, not inside an archive interval, or recorded that day. */
    static boolean activeOn(ChecklistItem item,LocalDate date,List<ArchivePeriod> periods,boolean recorded){
        if(recorded)return true;
        if(date.isBefore(item.startDate()))return false;
        var own=periods.stream().filter(p->p.itemId().equals(item.id())).toList();
        if(!item.active()&&own.stream().noneMatch(p->p.restoredOn()==null))return false;
        return own.stream().noneMatch(p->!date.isBefore(p.archivedOn())&&(p.restoredOn()==null||date.isBefore(p.restoredOn())));
    }

    public static Map<String,Object> snapshot(LocalDate date,Data data,String note){
        var block=new LinkedHashMap<String,Object>();
        block.put("v",1);block.put("date",date.toString());
        var day=data.days().stream().filter(d->d.date().equals(date)).findFirst();
        var measures=day.map(DietNoteProjection::measurements).orElseGet(LinkedHashMap::new);
        day.ifPresent(d->{if(d.morningMeasuredAt()!=null)measures.put("morningMeasuredAt",d.morningMeasuredAt().toString());if(d.bedtimeMeasuredAt()!=null)measures.put("bedtimeMeasuredAt",d.bedtimeMeasuredAt().toString());});
        block.put("measurements",measures);
        // 현재 체중: the latest recorded morning weight on or before this date (may be an earlier day).
        data.days().stream().filter(d->!d.date().isAfter(date)&&d.morningWeight()!=null).max(Comparator.comparing(DailyRecord::date))
            .ifPresent(d->block.put("currentWeight",ordered("value",d.morningWeight(),"date",d.date().toString())));
        var checks=new HashMap<UUID,CheckState>();
        data.checks().stream().filter(c->c.date().equals(date)).forEach(c->checks.put(c.itemId(),c.state()));
        var periods=data.archivePeriods()==null?List.<ArchivePeriod>of():data.archivePeriods();
        var items=new ArrayList<Map<String,Object>>();int success=0,failure=0,unrecorded=0;
        for(var item:data.items().stream().sorted(Comparator.comparing((ChecklistItem i)->i.importance().ordinal()).thenComparingInt(ChecklistItem::sortOrder)).toList()){
            var state=checks.getOrDefault(item.id(),CheckState.MISSING);
            if(!activeOn(item,date,periods,state!=CheckState.MISSING))continue;
            if(state==CheckState.SUCCESS)success++;else if(state==CheckState.FAILURE)failure++;else if(state==CheckState.UNRECORDED)unrecorded++;
            items.add(ordered("title",item.title(),"importance",item.importance().name(),"state",state.name()));
        }
        // Ordered keys keep the serialized block stable, so unchanged days never bump NOTE versions.
        block.put("checklist",ordered("total",items.size(),"success",success,"failure",failure,"unrecorded",unrecorded,"items",items));
        block.put("note",note==null?"":note);
        // Derived context: the Challenges whose current period covers this date.
        var focus=data.challenges().stream().filter(c->!date.isBefore(c.startDate())&&!date.isAfter(c.endDate()))
            .sorted(Comparator.comparingInt((Challenge c)->ROLE_ORDER.indexOf(c.role())).thenComparingInt(Challenge::sortOrder))
            .map(c->{var m=new LinkedHashMap<String,Object>();m.put("title",c.title());m.put("role",c.role().name());m.put("type",c.type().name());m.put("status",c.status().name());m.put("startDate",c.startDate().toString());m.put("endDate",c.endDate().toString());if(!c.keyPoint().isBlank())m.put("keyPoint",c.keyPoint());return (Map<String,Object>)m;}).toList();
        block.put("focus",focus);
        return block;
    }

    private static Map<String,Object> ordered(Object... pairs){
        var map=new LinkedHashMap<String,Object>();
        for(int i=0;i<pairs.length;i+=2)map.put((String)pairs[i],pairs[i+1]);
        return map;
    }

    public static String block(Map<String,Object> snapshot,ObjectMapper json){
        return PREFIX+json.writeValueAsString(snapshot)+"\n:::";
    }

    /**
     * Returns the NOTE content with exactly one managed block (or none when
     * {@code block} is null). The first existing block is replaced in place;
     * stray duplicates are removed; other text is untouched.
     */
    public static String merge(String content,String block){
        String source=content==null?"":content;
        var matcher=BLOCK.matcher(source);
        if(!matcher.find()){
            if(block==null)return source;
            return source.isBlank()?block:block+"\n\n"+source.stripLeading();
        }
        var result=new StringBuilder();int last=0;boolean first=true;
        do{
            result.append(source,last,matcher.start());
            if(first&&block!=null)result.append(block).append(matcher.group().endsWith("\n")?"\n":"");
            first=false;last=matcher.end();
        }while(matcher.find());
        result.append(source.substring(last));
        String merged=result.toString();
        // Removing the only block from an otherwise blank note clears it.
        return merged.isBlank()?"":merged;
    }
}
