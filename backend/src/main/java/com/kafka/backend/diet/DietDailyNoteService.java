package com.kafka.backend.diet;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * One canonical Diet Daily Note per owner + date (V57). The note belongs to the
 * date only; Challenge context is derived by clients from the Challenge periods.
 * Reading never creates a note, blank content removes it, and versions reject
 * stale autosaves instead of overwriting newer text.
 */
@Service
@Transactional
public class DietDailyNoteService {
    public static final int MAX_LENGTH=20000;
    public record DailyNote(LocalDate date,String content,long version,Instant updatedAt) {
        static DailyNote empty(LocalDate date){return new DailyNote(date,"",0,null);}
    }
    public record NoteInput(String content,Long expectedVersion) {}
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    public DietDailyNoteService(JdbcTemplate db,CurrentUserProvider users){this.db=db;this.users=users;}
    private UUID owner(){return users.getCurrentUserId();}
    private static void require(boolean valid,String message){if(!valid)throw new InvalidRequestException(message);}
    private static DailyNote map(ResultSet r,int n)throws SQLException{return new DailyNote(r.getDate("entry_date").toLocalDate(),r.getString("content"),r.getLong("version"),r.getTimestamp("updated_at").toInstant());}

    @Transactional(readOnly=true)
    public List<DailyNote> range(LocalDate from,LocalDate to){
        require(from!=null&&to!=null&&!to.isBefore(from)&&ChronoUnit.DAYS.between(from,to)<=400,"조회 기간은 401일 이내입니다.");
        return db.query("select * from diet_daily_notes where owner_id=? and entry_date between ? and ? order by entry_date",DietDailyNoteService::map,owner(),from,to);
    }
    @Transactional(readOnly=true)
    public List<DailyNote> latest(int limit){
        require(limit>=1&&limit<=50,"최근 노트 개수는 1~50입니다.");
        return db.query("select * from diet_daily_notes where owner_id=? order by entry_date desc limit ?",DietDailyNoteService::map,owner(),limit);
    }
    @Transactional(readOnly=true)
    public DailyNote get(LocalDate date){
        var rows=db.query("select * from diet_daily_notes where owner_id=? and entry_date=?",DietDailyNoteService::map,owner(),date);
        return rows.isEmpty()?DailyNote.empty(date):rows.getFirst();
    }
    public DailyNote save(LocalDate date,NoteInput in){
        require(in!=null&&in.content()!=null&&in.content().length()<=MAX_LENGTH,"노트는 최대 "+MAX_LENGTH+"자입니다.");
        long expected=in.expectedVersion()==null?0:in.expectedVersion();
        boolean blank=in.content().isBlank();
        var current=db.queryForList("select version from diet_daily_notes where owner_id=? and entry_date=? for update",Long.class,owner(),date);
        long version=current.isEmpty()?0:current.getFirst();
        if(version!=expected)throw new OptimisticLockConflictException("다른 기기에서 이 날짜의 노트가 변경되었습니다. 최신 내용을 불러오세요.");
        if(blank){
            db.update("delete from diet_daily_notes where owner_id=? and entry_date=?",owner(),date);
            return DailyNote.empty(date);
        }
        if(current.isEmpty()){
            // A concurrent first write for the same date loses instead of duplicating.
            if(db.update("insert into diet_daily_notes(owner_id,entry_date,content) values(?,?,?) on conflict do nothing",owner(),date,in.content())==0)
                throw new OptimisticLockConflictException("다른 기기에서 이 날짜의 노트가 생성되었습니다. 최신 내용을 불러오세요.");
        } else db.update("update diet_daily_notes set content=?,version=version+1,updated_at=now() where owner_id=? and entry_date=?",in.content(),owner(),date);
        return get(date);
    }
}
