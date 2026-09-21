package com.kafka.backend.calendar;

import com.kafka.backend.activitycategory.ActivityCategoryRepository;
import com.kafka.backend.common.*;
import com.kafka.backend.lifecategory.LifeCategoryRepository;
import com.kafka.backend.lifetime.*;
import com.kafka.backend.supplementalwork.*;
import com.kafka.backend.workrecord.*;
import com.kafka.backend.worktimeentry.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Edits original source rows without replacing siblings or inventing attendance. */
@Service
@Transactional
public class CalendarActualEditorService {
    @jakarta.persistence.PersistenceContext
    private jakarta.persistence.EntityManager entityManager;
    @org.springframework.beans.factory.annotation.Autowired
    private com.kafka.backend.plannedtimeblock.PlannedTimeBlockRepository planRows;
    private final WorkTimeEntryRepository work;
    private final SupplementalWorkEntryRepository supplemental;
    private final LifeTimeEntryRepository life;
    private final WorkRecordRepository records;
    private final ActivityCategoryRepository workCategories;
    private final LifeCategoryRepository lifeCategories;
    private final CurrentUserProvider users;
    private final ActualOverlapChecker overlap;
    private final com.kafka.backend.project.PhaseRepository phases;
    private final Map<UUID, Deleted> undo = new ConcurrentHashMap<>();
    private record Deleted(UUID userId, ActualSourceType type, Object entity, com.kafka.backend.plannedtimeblock.PlannedTimeBlock retainedPlan, Instant expires) {}
    public record DeleteResult(UUID undoToken) {}
    public CalendarActualEditorService(WorkTimeEntryRepository work, SupplementalWorkEntryRepository supplemental,
            LifeTimeEntryRepository life, WorkRecordRepository records, ActivityCategoryRepository workCategories,
            LifeCategoryRepository lifeCategories, CurrentUserProvider users, ActualOverlapChecker overlap, com.kafka.backend.project.PhaseRepository phases) {
        this.work=work; this.supplemental=supplemental; this.life=life; this.records=records;
        this.workCategories=workCategories; this.lifeCategories=lifeCategories; this.users=users; this.overlap=overlap; this.phases=phases;
    }
    @Transactional(readOnly=true)
    public CalendarActualEditorDto get(ActualSourceType type, UUID id) { return dto(type,owned(type,id)); }
    public CalendarActualEditorDto save(ActualSourceType type, UUID id, CalendarActualEditRequest r) {
        return saveInternal(type,id,r,false);
    }
    public CalendarActualEditorDto saveAllowOverlap(ActualSourceType type, UUID id, CalendarActualEditRequest r) {return saveInternal(type,id,r,true);}
    private CalendarActualEditorDto saveInternal(ActualSourceType type, UUID id, CalendarActualEditRequest r, boolean allowOverlap) {
        UUID user=users.getCurrentUserId();
        Object existing=id==null ? null : owned(type,id);
        int duration=validate(type,id,r,existing,user,allowOverlap);
        if(existing instanceof WorkTimeEntry e) bumpRecord(e.getWorkRecordId());
        if(existing instanceof SupplementalWorkEntry e) bumpRecord(e.getWorkRecordId());
        OffsetDateTime start=stored(r.date(),r.startTime()), end=stored(r.date(),r.endTime());
        String title=r.title().trim(), memo=r.memo()==null ? null : r.memo().trim();
        if(memo!=null && memo.isEmpty()) memo=null;
        Object saved;
        if(type==ActualSourceType.LIFE_TIME_ENTRY) {
            LifeTimeEntry e=existing==null ? new LifeTimeEntry(user,r.date(),r.categoryId(),title,duration,start,end,memo) : (LifeTimeEntry)existing;
            e.moveToDate(r.date()); e.applyChanges(r.categoryId(),title,duration,start,end,memo);
            saved=life.save(e);
        } else {
            WorkRecord target=records.findByUserIdAndWorkDate(user,r.date())
                .orElseThrow(()->new InvalidRequestException("이 날짜의 근무 기록을 먼저 저장한 뒤 WORK 기록을 추가하거나 이동하세요."));
            bumpRecord(target.getId());
            if(type==ActualSourceType.WORK_TIME_ENTRY && !target.getStatus().isWorkday())
                throw new InvalidRequestException("정규 WORK 기록은 근무일의 근무 기록에만 추가하거나 이동할 수 있습니다.");
            if(type==ActualSourceType.WORK_TIME_ENTRY) {
                WorkTimeEntry e=existing==null ? new WorkTimeEntry(UUID.randomUUID(),user,target.getId(),null,null,null,null,nextWorkPosition(target.getId())) : (WorkTimeEntry)existing;
                int position=e.getWorkRecordId().equals(target.getId()) ? e.getPosition() : nextWorkPosition(target.getId());
                e.moveToWorkRecord(target.getId()); e.applyChanges(r.categoryId(),title,duration,memo,position); e.schedule(start,end);
                if(r.phaseId()!=null) e.setPhaseId(r.phaseId());
                saved=work.save(e);
            } else {
                validateSupplementalInterval(target,start,end);
                SupplementalWorkEntry e=existing==null ? new SupplementalWorkEntry(UUID.randomUUID(),user,target.getId(),null,null,null,null,null,null,nextSupplementalPosition(target.getId())) : (SupplementalWorkEntry)existing;
                int position=e.getWorkRecordId().equals(target.getId()) ? e.getPosition() : nextSupplementalPosition(target.getId());
                e.moveToWorkRecord(target.getId()); e.applyChanges(r.categoryId(),title,duration,start,end,memo,position);
                if(r.phaseId()!=null) e.setPhaseId(r.phaseId());
                saved=supplemental.save(e);
            }
        }
        return dto(type,saved);
    }
    /** Reuse new-source validation without writing or poisoning the batch transaction. */
    @Transactional(readOnly=true, noRollbackFor={InvalidRequestException.class,ResourceNotFoundException.class})
    public void validateNew(ActualSourceType type, CalendarActualEditRequest request) {
        validate(type,null,request,null,users.getCurrentUserId(),false);
    }
    public void validateNewAllowOverlap(ActualSourceType type, CalendarActualEditRequest r) {validate(type,null,r,null,users.getCurrentUserId(),true);}
    private int validate(ActualSourceType type, UUID id, CalendarActualEditRequest r, Object existing, UUID user, boolean allowOverlap) {
        if(r.date()==null || r.title()==null || r.title().isBlank())
            throw new InvalidRequestException("Date, title and a positive duration are required.");
        CalendarActualDateRule.requireAllowed(r.date());
        var previous=existing==null ? null : dto(type,existing);
        boolean sameTiming=previous!=null && previous.date().equals(r.date()) && Objects.equals(previous.startTime(),r.startTime()) && Objects.equals(previous.endTime(),r.endTime());
        int duration=(allowOverlap || sameTiming) && r.startTime()!=null && r.endTime()!=null && r.endTime().isAfter(r.startTime())
                ? (int)Math.max(1,Duration.between(r.startTime(),r.endTime()).toMinutes()) : ActivityTiming.duration(r.durationMinutes(),r.startTime(),r.endTime());
        if(type==ActualSourceType.SUPPLEMENTAL_WORK_ENTRY) duration=ActivityTiming.duration(r.durationMinutes(),(LocalTime)null,null);
        if((r.startTime()==null)!=(r.endTime()==null) || (r.startTime()!=null && !r.endTime().isAfter(r.startTime())))
            throw new InvalidRequestException("Start/end must be a same-day increasing pair, or both empty.");
        validateCategory(type,r.categoryId(),existing==null ? null : dto(type,existing).categoryId(),user);
        if(r.phaseId()!=null) phases.findByIdAndUserId(r.phaseId(),user).orElseThrow(()->new ResourceNotFoundException("Phase not found"));
        OffsetDateTime start=stored(r.date(),r.startTime()), end=stored(r.date(),r.endTime());
        if(start!=null && !allowOverlap && !sameTiming) overlap.assertNoConflict(user,r.date(),start,end,type,id);
        if(type!=ActualSourceType.LIFE_TIME_ENTRY) {
            WorkRecord target=records.findByUserIdAndWorkDate(user,r.date())
                .orElseThrow(()->new InvalidRequestException("이 날짜의 근무 기록을 먼저 저장한 뒤 WORK 기록을 추가하거나 이동하세요."));
            if(type==ActualSourceType.WORK_TIME_ENTRY && !target.getStatus().isWorkday())
                throw new InvalidRequestException("정규 WORK 기록은 근무일의 근무 기록에만 추가하거나 이동할 수 있습니다.");
            if(type==ActualSourceType.SUPPLEMENTAL_WORK_ENTRY) validateSupplementalInterval(target,start,end);
        }
        return duration;
    }
    public DeleteResult delete(ActualSourceType type,UUID id) {
        Object e=owned(type,id);
        if(e instanceof WorkTimeEntry w)bumpRecord(w.getWorkRecordId());
        if(e instanceof SupplementalWorkEntry w)bumpRecord(w.getWorkRecordId());
        var retainedPlan=planRows==null ? null : planRows.findByUserIdAndConvertedSourceTypeAndConvertedSourceId(users.getCurrentUserId(),type.name(),id).orElse(null);
        if(retainedPlan!=null)planRows.delete(retainedPlan);
        switch(type) {
            case WORK_TIME_ENTRY -> work.delete((WorkTimeEntry)e);
            case SUPPLEMENTAL_WORK_ENTRY -> supplemental.delete((SupplementalWorkEntry)e);
            case LIFE_TIME_ENTRY -> life.delete((LifeTimeEntry)e);
        }
        UUID token=UUID.randomUUID();
        Deleted value=new Deleted(users.getCurrentUserId(),type,e,retainedPlan,Instant.now().plusSeconds(30));
        afterCommit(()->{undo.entrySet().removeIf(x->x.getValue().expires().isBefore(Instant.now()));undo.put(token,value);});
        return new DeleteResult(token);
    }
    public CalendarActualEditorDto restore(UUID token) {return restoreInternal(token,false);}
    public CalendarActualEditorDto restoreAllowOverlap(UUID token) {return restoreInternal(token,true);}
    private CalendarActualEditorDto restoreInternal(UUID token,boolean allowOverlap) {
        Deleted d=undo.get(token);
        if(d==null || !d.userId().equals(users.getCurrentUserId()) || d.expires().isBefore(Instant.now()))
            throw new ResourceNotFoundException("Undo has expired or is unavailable.");
        // Claim before doing any persistence: only one caller may consume a token.
        if (!undo.remove(token, d)) throw new ResourceNotFoundException("Undo is already in progress or consumed.");
        boolean transactional = TransactionSynchronizationManager.isSynchronizationActive();
        if (transactional) TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED && d.expires().isAfter(Instant.now())) undo.putIfAbsent(token, d);
            }
        });
        try {
            return restoreClaimed(d,allowOverlap);
        } catch (RuntimeException failure) {
            if (!transactional && d.expires().isAfter(Instant.now())) undo.putIfAbsent(token, d);
            throw failure;
        }
    }
    private CalendarActualEditorDto restoreClaimed(Deleted d,boolean allowOverlap) {
        CalendarActualEditorDto view=dto(d.type(),d.entity());
        if(d.entity() instanceof WorkTimeEntry e)bumpRecord(e.getWorkRecordId());
        if(d.entity() instanceof SupplementalWorkEntry e)bumpRecord(e.getWorkRecordId());
        OffsetDateTime start=stored(view.date(),view.startTime()),end=stored(view.date(),view.endTime());
        if(start!=null && !allowOverlap) overlap.assertNoConflict(d.userId(),view.date(),start,end,d.type(),null);
        switch(d.type()) {
            case WORK_TIME_ENTRY -> {
                WorkTimeEntry e=(WorkTimeEntry)d.entity();
                if(!records.findById(e.getWorkRecordId()).orElseThrow(()->new ResourceNotFoundException("Work Log not found")).getStatus().isWorkday())
                    throw new InvalidRequestException("Regular Work Actual requires a working-day Work Log.");
                if(work.existsById(view.id())) throw new InvalidRequestException("Actual already exists");
                if(work.findByWorkRecordIdOrderByPositionAsc(e.getWorkRecordId()).stream().anyMatch(x->x.getPosition().equals(e.getPosition())))
                    e.applyChanges(e.getCategoryId(),e.getItem(),e.getMinutes(),e.getMemo(),nextWorkPosition(e.getWorkRecordId()));
                work.save(e);
            }
            case SUPPLEMENTAL_WORK_ENTRY -> {
                SupplementalWorkEntry e=(SupplementalWorkEntry)d.entity();
                validateSupplementalInterval(records.findById(e.getWorkRecordId()).orElseThrow(()->new ResourceNotFoundException("Work Log not found")),start,end);
                if(supplemental.existsById(view.id())) throw new InvalidRequestException("Actual already exists");
                if(supplemental.findByWorkRecordIdOrderByPositionAsc(e.getWorkRecordId()).stream().anyMatch(x->x.getPosition().equals(e.getPosition())))
                    e.applyChanges(e.getCategoryId(),e.getItem(),e.getTotalMinutes(),e.getStartAt(),e.getEndAt(),e.getMemo(),nextSupplementalPosition(e.getWorkRecordId()));
                supplemental.save(e);
            }
            case LIFE_TIME_ENTRY -> {if(life.existsById(view.id())) throw new InvalidRequestException("Actual already exists");life.save((LifeTimeEntry)d.entity());}
        }
        if(d.retainedPlan()!=null)planRows.save(d.retainedPlan());
        return view;
    }
    private void bumpRecord(UUID id) {
        if(entityManager!=null)entityManager.lock(records.findById(id).orElseThrow(()->new ResourceNotFoundException("Work Log not found")),jakarta.persistence.LockModeType.OPTIMISTIC_FORCE_INCREMENT);
    }
    private int nextWorkPosition(UUID recordId) {
        return work.findByWorkRecordIdOrderByPositionAsc(recordId).stream().mapToInt(WorkTimeEntry::getPosition).max().orElse(-1)+1;
    }
    private int nextSupplementalPosition(UUID recordId) {
        return supplemental.findByWorkRecordIdOrderByPositionAsc(recordId).stream().mapToInt(SupplementalWorkEntry::getPosition).max().orElse(-1)+1;
    }
    private void validateSupplementalInterval(WorkRecord record,OffsetDateTime start,OffsetDateTime end) {
        if(start!=null && record.getClockInAt()!=null && record.getClockOutAt()!=null
                && start.isBefore(record.getClockOutAt()) && end.isAfter(record.getClockInAt()))
            throw new InvalidRequestException(time(record.getClockInAt()) + "–" + time(record.getClockOutAt()) + " 기존 정규 근무시간과 겹칩니다.");
    }
    private void afterCommit(Runnable action) {
        if(!TransactionSynchronizationManager.isSynchronizationActive()) {action.run();return;}
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
            @Override public void afterCommit(){action.run();}
        });
    }
    private Object owned(ActualSourceType type,UUID id) {
        UUID user=users.getCurrentUserId();
        return switch(type) {
            case WORK_TIME_ENTRY -> work.findByIdAndUserId(id,user).orElseThrow(()->new ResourceNotFoundException("Work Actual not found"));
            case SUPPLEMENTAL_WORK_ENTRY -> supplemental.findByIdAndUserId(id,user).orElseThrow(()->new ResourceNotFoundException("Supplemental Actual not found"));
            case LIFE_TIME_ENTRY -> life.findByIdAndUserId(id,user).orElseThrow(()->new ResourceNotFoundException("Life Actual not found"));
        };
    }
    private CalendarActualEditorDto dto(ActualSourceType type,Object entity) {
        if(entity instanceof LifeTimeEntry e) return new CalendarActualEditorDto(type,e.getId(),e.getEntryDate(),e.getLifeCategoryId(),e.getTitle(),e.getDurationMinutes(),time(e.getStartAt()),time(e.getEndAt()),e.getMemo(),null);
        if(entity instanceof WorkTimeEntry e) return new CalendarActualEditorDto(type,e.getId(),date(e.getWorkRecordId()),e.getCategoryId(),e.getItem(),e.getMinutes(),time(e.getStartAt()),time(e.getEndAt()),e.getMemo(),e.getPhaseId());
        SupplementalWorkEntry e=(SupplementalWorkEntry)entity;
        return new CalendarActualEditorDto(type,e.getId(),date(e.getWorkRecordId()),e.getCategoryId(),e.getItem(),e.getTotalMinutes(),time(e.getStartAt()),time(e.getEndAt()),e.getMemo(),e.getPhaseId());
    }
    private LocalDate date(UUID id) {
        WorkRecord record=records.findById(id).orElseThrow(()->new ResourceNotFoundException("Work Log not found"));
        if(!record.getUserId().equals(users.getCurrentUserId())) throw new ResourceNotFoundException("Work Log not found");
        return record.getWorkDate();
    }
    private LocalTime time(OffsetDateTime value){return value==null ? null : AppTimeZone.toDisplay(value).toLocalTime();}
    private OffsetDateTime stored(LocalDate date,LocalTime time){return time==null ? null : AppTimeZone.toStored(date.atTime(time));}
    private void validateCategory(ActualSourceType type,UUID category,UUID previous,UUID user) {
        if(type==ActualSourceType.LIFE_TIME_ENTRY) {
            if(category!=null && !category.equals(previous)) {
                var value=lifeCategories.findByIdAndUserId(category,user).orElseThrow(()->new ResourceNotFoundException("Life category not found"));
                if(!Boolean.TRUE.equals(value.getIsActive())) throw new InvalidRequestException("Select an active Life category");
            }
        } else {
            if(category==null) throw new InvalidRequestException("Work category is required");
            if(category.equals(previous)) return;
            var value=workCategories.findByIdAndUserId(category,user).orElseThrow(()->new ResourceNotFoundException("Work category not found"));
            if(!Boolean.TRUE.equals(value.getIsActive())) throw new InvalidRequestException("Select an active Work category");
        }
    }
}
