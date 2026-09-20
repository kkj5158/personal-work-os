package com.kafka.backend.calendar;

import com.kafka.backend.common.*;
import com.kafka.backend.plannedtimeblock.*;
import jakarta.persistence.EntityManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

/** Relationship/coordination only. Content and timing remain in the owning source table. */
@Service
@Transactional
public class CalendarExecutionService {
    public record Execution(UUID planId, ActualSourceType sourceType, UUID sourceId, boolean running,
                            LocalDateTime startAt, CalendarActualEditorDto actual) {}
    public record Start(UUID finishRunningPlanId) {}
    public record History(LocalDateTime startAt, LocalDateTime endAt) {}
    private final JdbcTemplate db;
    private final EntityManager entities;
    private final PlannedTimeBlockRepository plans;
    private final CalendarActualEditorService actuals;
    private final CurrentUserProvider users;
    public CalendarExecutionService(JdbcTemplate db, EntityManager entities, PlannedTimeBlockRepository plans,
                                    CalendarActualEditorService actuals, CurrentUserProvider users) {
        this.db=db;this.entities=entities;this.plans=plans;this.actuals=actuals;this.users=users;
    }
    private void lock(UUID user) {
        // Transaction-scoped across instances; the partial unique index is the second guard.
        db.query("select id from auth.users where id=? for update", rs -> {}, user);
    }
    @Transactional(readOnly=true)
    public List<Execution> list() {
        UUID user=users.getCurrentUserId();
        return db.query("select plan_id, work_id, life_id, running from calendar_plan_executions where user_id=?", (rs,n)-> {
            UUID work=rs.getObject("work_id",UUID.class),life=rs.getObject("life_id",UUID.class);
            var type=work!=null ? ActualSourceType.WORK_TIME_ENTRY : ActualSourceType.LIFE_TIME_ENTRY;
            UUID id=work!=null ? work : life;
            OffsetDateTime start=db.queryForObject("select execution_start_at from "+table(type)+" where id=? and user_id=?",OffsetDateTime.class,id,user);
            return new Execution(rs.getObject("plan_id",UUID.class),type,id,rs.getBoolean("running"),
                    start==null ? null : AppTimeZone.toDisplay(start),actuals.get(type,id));
        },user);
    }
    public Execution start(UUID planId, Start request) {
        UUID user=users.getCurrentUserId();lock(user);
        var plan=owned(planId,user);
        LocalDateTime now=LocalDateTime.now(AppTimeZone.ZONE);
        if(planDate(plan).isAfter(now.toLocalDate()) || (plan.getStartAt()!=null && AppTimeZone.toDisplay(plan.getStartAt()).isAfter(now)))throw new InvalidRequestException("미래 계획은 미리 실행할 수 없습니다.");
        var all=list();
        if(all.stream().anyMatch(e->e.planId().equals(planId)))throw new InvalidRequestException("이 계획에는 이미 실행 기록이 있습니다.");
        var running=all.stream().filter(Execution::running).findFirst().orElse(null);
        if(running!=null) {
            if(request==null || !running.planId().equals(request.finishRunningPlanId()))
                throw new InvalidRequestException("다른 실행이 진행 중입니다. 기존 실행 종료를 확인한 뒤 다시 시작하세요.");
            finishLocked(running,now);
        }
        var type=plan.getDomainType()==PlanDomainType.LIFE ? ActualSourceType.LIFE_TIME_ENTRY : ActualSourceType.WORK_TIME_ENTRY;
        var result=actuals.save(type,null,new CalendarActualEditRequest(now.toLocalDate(),category(plan),plan.getTitle(),1,null,null,plan.getMemo(),plan.getPhaseId()));
        entities.flush();
        // A running source has no finalized interval/duration. Existing unscheduled source
        // representation stays compatible; the execution timestamp belongs to that source.
        db.update("update "+table(type)+" set execution_start_at=?, "+durationColumn(type)+"=0 where id=? and user_id=?",AppTimeZone.toStored(now),result.id(),user);
        db.update("insert into calendar_plan_executions(plan_id,user_id,work_id,life_id,running) values (?,?,?,?,true)",planId,user,type==ActualSourceType.WORK_TIME_ENTRY ? result.id():null,type==ActualSourceType.LIFE_TIME_ENTRY ? result.id():null);
        return new Execution(planId,type,result.id(),true,now,result);
    }
    public Execution finish(UUID planId) {
        lock(users.getCurrentUserId());return finishLocked(link(planId),LocalDateTime.now(AppTimeZone.ZONE));
    }
    private Execution finishLocked(Execution e,LocalDateTime end) {
        if(!e.running())throw new InvalidRequestException("이미 종료된 실행입니다.");
        if(!end.toLocalDate().equals(e.startAt().toLocalDate()))throw new InvalidRequestException("날짜가 바뀐 실행은 같은 날짜의 종료 시각을 직접 보정하세요. 자정 넘김은 아직 지원하지 않습니다.");
        return complete(e,end);
    }
    private Execution complete(Execution e,LocalDateTime end) {
        if(!end.isAfter(e.startAt()))throw new InvalidRequestException("종료는 시작 이후여야 합니다.");
        UUID user=users.getCurrentUserId();
        long duration=Math.max(1,Duration.between(e.startAt(),end).toMinutes());
        db.update("update "+table(e.sourceType())+" set start_at=?, end_at=?, "+durationColumn(e.sourceType())+"=?, execution_start_at=null where id=? and user_id=?",
                AppTimeZone.toStored(e.startAt()),AppTimeZone.toStored(end),duration,e.sourceId(),user);
        db.update("update calendar_plan_executions set running=false where plan_id=? and user_id=?",e.planId(),user);
        entities.clear();
        return new Execution(e.planId(),e.sourceType(),e.sourceId(),false,e.startAt(),actuals.get(e.sourceType(),e.sourceId()));
    }
    public void cancel(UUID planId) {
        UUID user=users.getCurrentUserId();lock(user);var e=link(planId);
        if(!e.running())throw new InvalidRequestException("종료된 실행은 일반 수정 또는 삭제를 사용하세요.");
        db.update("delete from calendar_plan_executions where plan_id=? and user_id=?",planId,user);
        actuals.delete(e.sourceType(),e.sourceId());
    }
    public Execution history(UUID planId,History request) {
        UUID user=users.getCurrentUserId();lock(user);var p=owned(planId,user);
        LocalDateTime now=LocalDateTime.now(AppTimeZone.ZONE);
        if(request==null || request.startAt()==null || request.endAt()==null || !request.endAt().isAfter(request.startAt()) || request.endAt().isAfter(now)
                || !request.startAt().toLocalDate().equals(request.endAt().toLocalDate()) || planDate(p).isAfter(now.toLocalDate()) || (p.getStartAt()!=null && AppTimeZone.toDisplay(p.getStartAt()).isAfter(now)))
            throw new InvalidRequestException("사후 기록은 같은 날짜의 실제 시작·종료 시각을 입력하세요. 미래 기록은 만들 수 없습니다.");
        var existing=list().stream().filter(e->e.planId().equals(planId)).findFirst().orElse(null);
        if(existing!=null) {
            if(!existing.running())throw new InvalidRequestException("이 계획에는 이미 실행 기록이 있습니다.");
            if(!request.startAt().equals(existing.startAt()))throw new InvalidRequestException("실행 중 시작 시각을 유지하고 종료를 보정하세요.");
            return complete(existing,request.endAt());
        }
        var type=p.getDomainType()==PlanDomainType.LIFE ? ActualSourceType.LIFE_TIME_ENTRY : ActualSourceType.WORK_TIME_ENTRY;
        var a=actuals.saveAllowOverlap(type,null,new CalendarActualEditRequest(request.startAt().toLocalDate(),category(p),p.getTitle(),(int)Math.max(1,Duration.between(request.startAt(),request.endAt()).toMinutes()),request.startAt().toLocalTime(),request.endAt().toLocalTime(),p.getMemo(),p.getPhaseId()));
        entities.flush();
        db.update("insert into calendar_plan_executions(plan_id,user_id,work_id,life_id,running) values (?,?,?,?,false)",planId,user,type==ActualSourceType.WORK_TIME_ENTRY ? a.id():null,type==ActualSourceType.LIFE_TIME_ENTRY ? a.id():null);
        return new Execution(planId,type,a.id(),false,request.startAt(),a);
    }
    public void restoreLink(Execution e) {
        if(e==null || e.running())return;
        UUID user=users.getCurrentUserId();
        if(plans.findByIdAndUserId(e.planId(),user).isEmpty())return;
        try {actuals.get(e.sourceType(),e.sourceId());}catch(ResourceNotFoundException missing){return;}
        entities.flush();
        db.update("insert into calendar_plan_executions(plan_id,user_id,work_id,life_id,running) values (?,?,?,?,false) on conflict do nothing",e.planId(),user,e.sourceType()==ActualSourceType.WORK_TIME_ENTRY ? e.sourceId():null,e.sourceType()==ActualSourceType.LIFE_TIME_ENTRY ? e.sourceId():null);
    }
    private Execution link(UUID id) {return list().stream().filter(e->e.planId().equals(id)).findFirst().orElseThrow(()->new ResourceNotFoundException("Execution not found"));}
    private PlannedTimeBlock owned(UUID id,UUID user) {return plans.findByIdAndUserId(id,user).orElseThrow(()->new ResourceNotFoundException("Plan not found"));}
    private LocalDate planDate(PlannedTimeBlock p) {return p.getPlanDate();}
    private UUID category(PlannedTimeBlock p) {return p.getDomainType()==PlanDomainType.LIFE ? p.getLifeCategoryId() : p.getActivityCategoryId();}
    private String table(ActualSourceType type) {return type==ActualSourceType.LIFE_TIME_ENTRY ? "life_time_entries" : "work_time_entries";}
    private String durationColumn(ActualSourceType type) {return type==ActualSourceType.LIFE_TIME_ENTRY ? "duration_minutes" : "minutes";}
}
