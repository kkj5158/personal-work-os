package com.kafka.backend.reflection;

import com.kafka.backend.calendar.CalendarService;
import com.kafka.backend.common.*;
import com.kafka.backend.workrecord.WorkRecordRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import static com.kafka.backend.reflection.CalendarReviewTypes.*;

/** Read projections only; writes retain Reflection/WorkRecord source ownership. */
@Service
public class CalendarReviewService {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final CalendarService calendar;
    private final WorkRecordRepository work;
    public CalendarReviewService(JdbcTemplate db, CurrentUserProvider users, CalendarService calendar, WorkRecordRepository work) {
        this.db=db;this.users=users;this.calendar=calendar;this.work=work;
    }
    private static final RowMapper<Daily> DAILY=(r,n)->new Daily(r.getObject("entry_date",LocalDate.class),
            Objects.requireNonNullElse(r.getString("title"),""),r.getObject("day_score",Integer.class),r.getObject("mood_level",Integer.class),Objects.requireNonNullElse(r.getString("memo"),""),r.getString("status"),r.getLong("version"));
    private static final RowMapper<Weekly> WEEKLY=(r,n)->new Weekly(r.getObject("id",UUID.class),r.getObject("week_start",LocalDate.class),r.getString("title"),r.getObject("score",Integer.class),r.getObject("mood",Integer.class),r.getString("memo"),r.getString("strengths"),r.getString("regrets"),r.getString("next_week_direction"),r.getLong("version"),r.getObject("created_at",OffsetDateTime.class),r.getObject("updated_at",OffsetDateTime.class));

    @Transactional(readOnly=true)
    public Daily daily(LocalDate date) {
        return db.query("select * from reflection_entries where user_id=? and entry_date=?",DAILY,users.getCurrentUserId(),date).stream().findFirst()
                .orElse(new Daily(date,"",null,null,"","EDITING",-1));
    }
    @Transactional(readOnly=true)
    public Weekly weekly(LocalDate monday) {
        requireMonday(monday);
        return db.query("select * from calendar_weekly_reviews where user_id=? and week_start=?",WEEKLY,users.getCurrentUserId(),monday).stream().findFirst().orElse(null);
    }
    @Transactional
    public Weekly saveWeekly(LocalDate monday,WeeklyInput in) {
        requireMonday(monday);validate(in.title(),in.score(),in.mood(),in.memo());requireVersion(in.expectedVersion());
        for(String value:Arrays.asList(in.strengths(),in.regrets(),in.nextWeekDirection()))limit(value,50000);
        UUID owner=users.getCurrentUserId();
        if(in.expectedVersion()==-1) {
            if(db.update("insert into calendar_weekly_reviews(id,user_id,week_start,title,score,mood,memo,strengths,regrets,next_week_direction) values (?,?,?,?,?,?,?,?,?,?) on conflict(user_id,week_start) do nothing",
                    UUID.randomUUID(),owner,monday,text(in.title()),in.score(),in.mood(),text(in.memo()),text(in.strengths()),text(in.regrets()),text(in.nextWeekDirection()))!=1)throw conflict();
        } else if(db.update("update calendar_weekly_reviews set title=?,score=?,mood=?,memo=?,strengths=?,regrets=?,next_week_direction=?,version=version+1,updated_at=now() where user_id=? and week_start=? and version=?",
                text(in.title()),in.score(),in.mood(),text(in.memo()),text(in.strengths()),text(in.regrets()),text(in.nextWeekDirection()),owner,monday,in.expectedVersion())!=1)throw conflict();
        return weekly(monday);
    }
    @Transactional(readOnly=true)
    public Range range(LocalDate from,LocalDate to) {
        if(from==null||to==null||to.isBefore(from)||ChronoUnit.DAYS.between(from,to)>62)throw new InvalidRequestException("조회 기간은 63일 이내여야 합니다.");
        UUID owner=users.getCurrentUserId();
        Map<LocalDate,Daily> reflections=new HashMap<>();
        db.query("select * from reflection_entries where user_id=? and entry_date between ? and ?",DAILY,owner,from,to).forEach(d->reflections.put(d.date(),d));
        Map<LocalDate,Integer> scores=new HashMap<>();
        work.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(owner,from,to).stream().filter(r->r.getStatus().isWorkday()&&r.getWorkScore()!=null).forEach(r->scores.put(r.getWorkDate(),r.getWorkScore()));
        // Read one extra source day on either side for future midnight-compatible owners.
        var projection=calendar.findInRange(from.minusDays(1),to.plusDays(1));
        var minutes=CalendarReviewWorkMinutes.calculate(projection,from,to);
        List<DayMetrics> days=from.datesUntil(to.plusDays(1)).map(d->new DayMetrics(d,minutes.get(d),scores.get(d),reflections.get(d))).toList();
        LocalDate first=from.minusDays(from.getDayOfWeek().getValue()-1);
        return new Range(days,db.query("select * from calendar_weekly_reviews where user_id=? and week_start between ? and ? order by week_start",WEEKLY,owner,first,to));
    }
    static void requireMonday(LocalDate d){if(d==null||d.getDayOfWeek()!=DayOfWeek.MONDAY)throw new InvalidRequestException("주간 회고 기준일은 월요일입니다.");}
    static void requireVersion(Long v){if(v==null||v < -1)throw new InvalidRequestException("expectedVersion이 필요합니다.");}
    static String text(String s){return s==null?"":s;}
    static void limit(String s,int max){if(s!=null&&s.length()>max)throw new InvalidRequestException("입력 가능한 글자 수를 초과했습니다.");}
    static void validate(String title,Integer score,Integer mood,String memo){limit(title,240);limit(memo,100000);if(title!=null&&(title.contains("\n")||title.contains("\r")))throw new InvalidRequestException("제목은 한 줄로 입력하세요.");if(score!=null&&(score<0||score>100))throw new InvalidRequestException("점수는 0–100입니다.");if(mood!=null&&(mood<1||mood>5))throw new InvalidRequestException("감정은 1–5입니다.");}
    static OptimisticLockConflictException conflict(){return new OptimisticLockConflictException("다른 화면에서 변경되었거나 완료된 회고입니다. 입력을 보존했습니다. 최신 기록을 확인하세요.");}
}
