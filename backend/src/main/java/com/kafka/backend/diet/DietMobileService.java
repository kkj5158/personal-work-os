package com.kafka.backend.diet;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import static com.kafka.backend.diet.DietTypes.*;

/** Bounded read views over existing facts and CAS over existing Challenge records. */
@Service @Transactional
public class DietMobileService {
    public record Calendar(Data data,List<DietDailyNoteService.DailyNote> notes) {}
    public record Entry(LocalDate date,DietDailyNoteService.DailyNote note,Double weight,int completed,int total,List<DietCameraMediaService.Media> photos) {}
    public record Page(List<Entry> entries,LocalDate nextCursor) {}
    public record Plan(Challenge value,String version) {}
    public record PlanInput(Challenge value,String expectedVersion) {}
    private final JdbcTemplate db; private final CurrentUserProvider users; private final DietService diet;
    private final DietDailyNoteService notes; private final DietCameraMediaService media; private final ObjectMapper json;
    public DietMobileService(JdbcTemplate db,CurrentUserProvider users,DietService diet,DietDailyNoteService notes,DietCameraMediaService media,ObjectMapper json){this.db=db;this.users=users;this.diet=diet;this.notes=notes;this.media=media;this.json=json;}
    private UUID owner(){return users.getCurrentUserId();}
    private static void require(boolean ok,String message){if(!ok)throw new InvalidRequestException(message);}
    @Transactional(readOnly=true) public Calendar calendar(LocalDate from,LocalDate to){
        require(from!=null&&to!=null&&!to.isBefore(from)&&ChronoUnit.DAYS.between(from,to)<=62,"캘린더는 최대 63일입니다.");
        return new Calendar(diet.dataRange(from,to),notes.range(from,to));
    }
    static boolean active(DietCameraMediaService.Media m){return m.deletedAt()==null&&!m.purgeRequested()&&m.purgedAt()==null&&m.imageRef()!=null;}
    @Transactional(readOnly=true) public Page journal(LocalDate before,LocalDate until,String month,int limit){
        require(limit>=1&&limit<=30,"일지 개수는 1~30입니다.");
        YearMonth selected=null;
        if(month!=null&&!month.isBlank()){try{selected=YearMonth.parse(month);}catch(RuntimeException e){throw new InvalidRequestException("월 형식을 확인하세요.");}}
        var params=new ArrayList<Object>();params.add(owner());params.add(owner());
        String where=" where 1=1";
        if(before!=null){where+=" and entry_date<?";params.add(before);}
        if(until!=null){where+=" and entry_date<=?";params.add(until);}
        if(selected!=null){where+=" and entry_date between ? and ?";params.add(selected.atDay(1));params.add(selected.atEndOfMonth());}
        params.add(limit+1);
        var dates=db.queryForList("select entry_date from (select entry_date from diet_daily_notes where owner_id=? and content<>'' union select captured_date from diet_camera_media where owner_id=? and deleted_at is null and not purge_requested and purged_at is null and image_ref is not null) d"+where+" order by entry_date desc limit ?",LocalDate.class,params.toArray());
        boolean more=dates.size()>limit; var visible=dates.subList(0,Math.min(limit,dates.size()));
        var entries=new ArrayList<Entry>();
        var data=visible.isEmpty()?null:diet.dataDates(visible);
        // Each page is bounded, including sparse histories spanning years. No all-note scan.
        for(var date:visible){
            var check=new HashMap<UUID,CheckState>();data.checks().stream().filter(c->c.date().equals(date)).forEach(c->check.put(c.itemId(),c.state()));
            int total=0,complete=0;
            for(var item:data.items())if(DietNoteProjection.activeOn(item,date,data.archivePeriods(),check.getOrDefault(item.id(),CheckState.MISSING)!=CheckState.MISSING)){total++;if(check.get(item.id())==CheckState.SUCCESS)complete++;}
            Double weight=data.days().stream().filter(d->d.date().equals(date)).map(DailyRecord::morningWeight).filter(Objects::nonNull).findFirst().orElse(null);
            entries.add(new Entry(date,notes.get(date),weight,complete,total,media.list(date).stream().filter(DietMobileService::active).toList()));
        }
        return new Page(entries,more?visible.getLast():null);
    }
    public record JournalMedia(UUID workspaceId,UUID id,String caption) {}
    /** Existing NOTE uploads in canonical diary order; bytes still use the owned NOTE media endpoint. */
    @Transactional(readOnly=true) public List<JournalMedia> journalMedia(LocalDate date){
        var result=new ArrayList<JournalMedia>();String body=notes.get(date).content();
        var rows=java.util.regex.Pattern.compile("(?m)^:::images ([^\\n]+)\\n:::[ \\t]*(?:\\n|$)").matcher(body);
        while(rows.find()){
            if(DietJournalContent.fenced(body,rows.start()))continue;
            try{var images=json.readTree(rows.group(1)).path("images");if(!images.isArray())continue;
                for(var image:images){String src=image.path("src").asText();if(!src.matches("media:[0-9a-fA-F-]{36}"))continue;UUID id=UUID.fromString(src.substring(6));
                    var owned=db.queryForList("select m.workspace_id from journal_media m join note_workspaces w on w.id=m.workspace_id where m.id=? and w.owner_id=?",UUID.class,id,owner());
                    if(!owned.isEmpty())result.add(new JournalMedia(owned.getFirst(),id,image.path("caption").asText("")));
                }
            }catch(RuntimeException ignored){/* A malformed user text directive never grants media access. */}
        }
        return result;
    }
    String version(Challenge value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsString(value).getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    @Transactional(readOnly=true) public List<Plan> plans(){return diet.dataRange(LocalDate.now(),LocalDate.now()).challenges().stream().map(c->new Plan(c,version(c))).toList();}
    private void lock(){db.update("insert into diet_settings(owner_id) values(?) on conflict(owner_id) do nothing",owner());db.queryForList("select owner_id from diet_settings where owner_id=? for update",owner());}
    private Challenge find(UUID id){return plans().stream().map(Plan::value).filter(c->c.id().equals(id)).findFirst().orElse(null);}
    public Plan save(UUID id,PlanInput input){
        require(input!=null&&input.value()!=null&&id.equals(input.value().id())&&input.expectedVersion()!=null,"계획 변경 내용을 확인하세요.");
        lock();var old=find(id);
        if(old!=null&&old.equals(input.value()))return new Plan(old,version(old)); // acknowledged-lost save retry
        if(old==null?!input.expectedVersion().equals("new"):!version(old).equals(input.expectedVersion()))throw new OptimisticLockConflictException("계획이 다른 화면에서 변경되었습니다. 초안을 보존하고 최신 계획을 확인하세요.");
        diet.challenge(id,input.value());var saved=find(id);return new Plan(saved,version(saved));
    }
    public void delete(UUID id,String expected){
        require(expected!=null,"삭제할 계획 버전을 확인하세요.");lock();var old=find(id);
        if(old==null)throw new ResourceNotFoundException("계획을 찾을 수 없습니다.");
        if(!version(old).equals(expected))throw new OptimisticLockConflictException("계획이 변경되었습니다. 최신 계획을 확인하세요.");
        diet.delete("challenges",id);
    }
}
