package com.kafka.backend.calendar;

import com.kafka.backend.common.*;
import com.kafka.backend.plannedtimeblock.*;
import jakarta.persistence.EntityManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import static com.kafka.backend.calendar.CalendarClipboardService.*;

/** Atomic logical state transitions. Actual content and statistics stay in their source domain. */
@Service
@Transactional
public class CalendarStateService {
    public record Change(Kind kind, UUID id, ActualSourceType sourceType, Kind targetState,
                         CalendarActualEditRequest actual, PlannedTimeBlockRequest plan) {}
    private final JdbcTemplate db;
    private final EntityManager entities;
    private final PlannedTimeBlockRepository rows;
    private final PlannedTimeBlockService plans;
    private final CalendarActualEditorService actuals;
    private final CurrentUserProvider users;
    public CalendarStateService(JdbcTemplate db, EntityManager entities, PlannedTimeBlockRepository rows,
            PlannedTimeBlockService plans, CalendarActualEditorService actuals, CurrentUserProvider users) {
        this.db=db;this.entities=entities;this.rows=rows;this.plans=plans;this.actuals=actuals;this.users=users;
    }
    public Ref change(Change r) {
        if(r==null || r.id()==null || r.kind()==null || r.targetState()==null || r.kind()==Kind.GROUP || r.targetState()==Kind.GROUP)
            throw new InvalidRequestException("Plan 또는 Actual 상태를 선택하세요.");
        UUID user=users.getCurrentUserId();
        db.query("select id from auth.users where id=? for update", rs->{},user);
        if(r.kind()==Kind.PLAN) {
            var p=rows.findByIdAndUserId(r.id(),user).orElseThrow(()->new ResourceNotFoundException("Plan not found"));
            if(r.targetState()==Kind.PLAN) return new Ref(Kind.PLAN,p.getId(),null);
            var legacy=db.query("select work_id, life_id from calendar_plan_executions where plan_id=? and user_id=?",(rs,n)->new Ref(Kind.ACTUAL,rs.getObject("work_id",UUID.class)!=null?rs.getObject("work_id",UUID.class):rs.getObject("life_id",UUID.class),rs.getObject("work_id",UUID.class)!=null?ActualSourceType.WORK_TIME_ENTRY:ActualSourceType.LIFE_TIME_ENTRY),p.getId(),user);
            if(!legacy.isEmpty()) return legacy.getFirst();
            if(p.getConvertedSourceId()!=null) {
                var type=ActualSourceType.valueOf(p.getConvertedSourceType());
                try {actuals.get(type,p.getConvertedSourceId());return new Ref(Kind.ACTUAL,p.getConvertedSourceId(),type);}
                catch(ResourceNotFoundException deleted) {p.convertToPlan();}
            }
            ActualSourceType type=p.getDomainType()==PlanDomainType.LIFE ? ActualSourceType.LIFE_TIME_ENTRY
                    : "SUPPLEMENTAL_WORK_ENTRY".equals(p.getPreferredActualSourceType()) ? ActualSourceType.SUPPLEMENTAL_WORK_ENTRY : ActualSourceType.WORK_TIME_ENTRY;
            var start=AppTimeZone.toDisplay(p.getStartAt());var end=AppTimeZone.toDisplay(p.getEndAt());
            Integer duration=p.getRetainedDurationMinutes();
            if(start!=null && end!=null) {
                if(!start.toLocalDate().equals(end.toLocalDate()))throw new InvalidRequestException("Actual은 같은 날짜의 시작·종료 시간이 필요합니다.");
                if(type!=ActualSourceType.SUPPLEMENTAL_WORK_ENTRY || duration==null)duration=(int)Duration.between(start,end).toMinutes();
            }
            var a=r.actual()!=null ? r.actual() : new CalendarActualEditRequest(p.getPlanDate(),p.getDomainType()==PlanDomainType.LIFE?p.getLifeCategoryId():p.getActivityCategoryId(),p.getTitle(),duration,start==null?null:start.toLocalTime(),end==null?null:end.toLocalTime(),p.getMemo(),p.getPhaseId());
            CalendarActualDateRule.requireAllowed(a.date());
            var saved=actuals.saveAllowOverlap(type,null,a);
            p.retainActualDefaults(type.name(),saved.durationMinutes());p.convertToActual(type.name(),saved.id());rows.save(p);
            entities.flush();
            return new Ref(Kind.ACTUAL,saved.id(),type);
        }
        if(r.sourceType()==null)throw new InvalidRequestException("Actual source is required");
        var a=actuals.get(r.sourceType(),r.id());
        if(r.targetState()==Kind.ACTUAL) {CalendarActualDateRule.requireAllowed(a.date());return new Ref(Kind.ACTUAL,a.id(),a.sourceType());}
        var old=rows.findByUserIdAndConvertedSourceTypeAndConvertedSourceId(user,r.sourceType().name(),r.id()).orElse(null);
        if(old==null) {
            String column=r.sourceType()==ActualSourceType.WORK_TIME_ENTRY?"work_id":r.sourceType()==ActualSourceType.LIFE_TIME_ENTRY?"life_id":null;
            if(column!=null) {
                var ids=db.query("select plan_id from calendar_plan_executions where "+column+"=? and user_id=?",(rs,n)->rs.getObject(1,UUID.class),r.id(),user);
                if(!ids.isEmpty())old=rows.findByIdAndUserId(ids.getFirst(),user).orElse(null);
            }
        }
        var values=r.plan()!=null ? r.plan() : planFromActual(r.sourceType(),r.actual()!=null?r.actual():request(a));
        if(old!=null && values.phaseId()==null && old.getPhaseId()!=null)
            values=new PlannedTimeBlockRequest(values.domainType(),values.title(),values.startAt(),values.endAt(),values.activityCategoryId(),values.lifeCategoryId(),old.getPhaseId(),values.memo(),values.date(),values.durationMinutes(),values.preferredActualSourceType());
        var p=plans.saveRequest(old==null?null:old.getId(),values);
        Integer retained=r.actual()!=null?r.actual().durationMinutes():a.durationMinutes();
        p.retainActualDefaults(r.sourceType().name(),retained!=null && retained>0?retained:null);p.convertToPlan();rows.save(p);
        entities.flush();
        // Only this explicitly converted Actual is removed, in the same transaction as its Plan.
        // No bulk history rewrite; legacy relationship FKs cascade on this source deletion.
        actuals.delete(r.sourceType(),r.id());entities.flush();
        return new Ref(Kind.PLAN,p.getId(),null);
    }
    public static CalendarActualEditRequest request(CalendarActualEditorDto a) {
        return new CalendarActualEditRequest(a.date(),a.categoryId(),a.title(),a.durationMinutes(),a.startTime(),a.endTime(),a.memo(),a.phaseId());
    }
    public static PlannedTimeBlockRequest planFromActual(ActualSourceType type, CalendarActualEditRequest a) {
        if(type==null || a==null || a.date()==null)throw new InvalidRequestException("Actual date is required");
        boolean life=type==ActualSourceType.LIFE_TIME_ENTRY;
        return new PlannedTimeBlockRequest(life?PlanDomainType.LIFE:PlanDomainType.WORK,a.title(),a.startTime()==null?null:a.date().atTime(a.startTime()),a.endTime()==null?null:a.date().atTime(a.endTime()),life?null:a.categoryId(),life?a.categoryId():null,a.phaseId(),a.memo(),a.date(),a.durationMinutes()!=null && a.durationMinutes()>0?a.durationMinutes():null,type.name());
    }
}
