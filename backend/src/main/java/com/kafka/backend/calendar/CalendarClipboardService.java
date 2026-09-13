package com.kafka.backend.calendar;

import com.kafka.backend.common.*;
import com.kafka.backend.plannedtimeblock.*;
import com.kafka.backend.calendarvisualgroup.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** One database transaction for each Calendar paste/delete/Undo. No projection-only copies. */
@Service
@Transactional
public class CalendarClipboardService {
    public enum Kind { PLAN, ACTUAL, GROUP }
    public record Item(Kind kind, PlannedTimeBlockRequest plan, ActualSourceType sourceType,
                       CalendarActualEditRequest actual, VisualGroupRequest group) {}
    public record Ref(Kind kind, UUID id, ActualSourceType sourceType) {}
    public record Paste(List<Item> items, boolean excludeConflicts) {}
    public record Result(int index, Ref created, String error) {}
    public record PasteResult(boolean committed, List<Result> results) {}
    public record DeleteResult(UUID undoToken) {}
    private record Restore(Ref ref, PlannedTimeBlockRequest plan, UUID token) {}
    private record Deleted(UUID owner, List<Restore> items, Instant expires) {}
    private final CalendarActualEditorService actuals;
    private final PlannedTimeBlockService plans;
    private final PlannedTimeBlockRepository planRows;
    private final CalendarVisualGroupService groups;
    private final CurrentUserProvider users;
    private final Map<UUID,Deleted> undo=new ConcurrentHashMap<>();

    public CalendarClipboardService(CalendarActualEditorService actuals, PlannedTimeBlockService plans,
            PlannedTimeBlockRepository planRows, CalendarVisualGroupService groups, CurrentUserProvider users) {
        this.actuals=actuals;this.plans=plans;this.planRows=planRows;this.groups=groups;this.users=users;
    }
    @Transactional(readOnly=true)
    public List<Item> snapshot(List<Ref> refs) {
        checkSize(refs);
        return refs.stream().map(ref->switch(ref.kind()) {
            case PLAN -> {
                var p=PlannedTimeBlockResponse.from(planRows.findByIdAndUserId(ref.id(),users.getCurrentUserId()).orElseThrow(()->new ResourceNotFoundException("Planning not found")));
                yield new Item(Kind.PLAN,new PlannedTimeBlockRequest(p.domainType(),p.title(),p.startAt(),p.endAt(),p.activityCategoryId(),p.lifeCategoryId(),p.phaseId(),p.memo()),null,null,null);
            }
            case ACTUAL -> {
                var a=actuals.get(ref.sourceType(),ref.id());
                yield new Item(Kind.ACTUAL,null,ref.sourceType(),new CalendarActualEditRequest(a.date(),a.categoryId(),a.title(),a.durationMinutes(),a.startTime(),a.endTime(),a.memo(),a.phaseId()),null);
            }
            case GROUP -> new Item(Kind.GROUP,null,null,null,groups.get(ref.id()).request());
        }).toList();
    }
    public PasteResult paste(Paste request) {
        checkSize(request.items());
        var results=new ArrayList<Result>();
        var accepted=new ArrayList<CalendarActualEditRequest>();
        for(int i=0;i<request.items().size();i++) {
            Item item=request.items().get(i);
            if(item==null || item.kind()==null)throw new InvalidRequestException("Calendar item kind is required");
            String error=null;
            if(item.kind()!=Kind.ACTUAL) {
                try {if(item.kind()==Kind.PLAN)plans.validateNew(item.plan());else groups.validateNew(item.group());}
                catch(InvalidRequestException | ResourceNotFoundException e){error=e.getMessage();}
            }
            if(item.kind()==Kind.ACTUAL) {
                if(item.actual()==null || item.sourceType()==null)throw new InvalidRequestException("Actual source and values are required");
                try {
                    actuals.validateNew(item.sourceType(),item.actual());
                    var value=item.actual();
                    if(value.startTime()!=null)for(var other:accepted) {
                        if(other.startTime()!=null && other.date().equals(value.date()) && value.startTime().isBefore(other.endTime()) && value.endTime().isAfter(other.startTime()))
                            throw new InvalidRequestException("붙여넣기 항목 "+other.startTime()+"–"+other.endTime()+" ("+other.title()+")과 겹칩니다.");
                    }
                    accepted.add(value);
                } catch(InvalidRequestException | ResourceNotFoundException e) { error=e.getMessage(); }
            }
            results.add(new Result(i,null,error));
        }
        if(results.stream().anyMatch(r->r.error()!=null && (!request.excludeConflicts() || request.items().get(r.index()).kind()!=Kind.ACTUAL)))return new PasteResult(false,results);
        // All valid candidates commit together, including explicit exclusion recovery.
        // Any save/flush/commit failure rolls every newly created row back.
        for(int i=0;i<results.size();i++)if(results.get(i).error()==null) {
            Item item=request.items().get(i);
            UUID id=switch(item.kind()) {
                case PLAN -> createPlan(item.plan());
                case ACTUAL -> actuals.save(item.sourceType(),null,item.actual()).id();
                case GROUP -> groups.create(item.group()).id();
            };
            results.set(i,new Result(i,new Ref(item.kind(),id,item.kind()==Kind.ACTUAL ? item.sourceType() : null),null));
        }
        return new PasteResult(true,results);
    }
    private UUID createPlan(PlannedTimeBlockRequest p) {
        if(p==null || p.startAt()==null || p.endAt()==null)throw new InvalidRequestException("Planning values and timing are required");
        return plans.create(p.domainType(),p.title(),AppTimeZone.toStored(p.startAt()),AppTimeZone.toStored(p.endAt()),p.activityCategoryId(),p.lifeCategoryId(),p.phaseId(),p.memo()).getId();
    }
    public DeleteResult delete(List<Ref> refs) {
        checkSize(refs);
        if(new HashSet<>(refs).size()!=refs.size())throw new InvalidRequestException("Duplicate selection");
        var saved=new ArrayList<Restore>();
        for(Ref ref:refs) {
            if(ref==null || ref.kind()==null || ref.id()==null)throw new InvalidRequestException("Invalid selection");
            switch(ref.kind()) {
                case PLAN -> {
                    var p=PlannedTimeBlockResponse.from(planRows.findByIdAndUserId(ref.id(),users.getCurrentUserId()).orElseThrow(()->new ResourceNotFoundException("Planning not found")));
                    saved.add(new Restore(ref,new PlannedTimeBlockRequest(p.domainType(),p.title(),p.startAt(),p.endAt(),p.activityCategoryId(),p.lifeCategoryId(),p.phaseId(),p.memo()),null));
                    plans.delete(ref.id());
                }
                case ACTUAL -> {if(ref.sourceType()==null)throw new InvalidRequestException("Actual source is required");saved.add(new Restore(ref,null,actuals.delete(ref.sourceType(),ref.id()).undoToken()));}
                case GROUP -> saved.add(new Restore(ref,null,groups.delete(ref.id()).undoToken()));
            }
        }
        UUID token=UUID.randomUUID();var snapshot=new Deleted(users.getCurrentUserId(),saved,Instant.now().plusSeconds(30));
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCommit(){undo.entrySet().removeIf(e->e.getValue().expires().isBefore(Instant.now()));undo.put(token,snapshot);}});
        return new DeleteResult(token);
    }
    public List<Ref> restore(UUID token) {
        var deleted=undo.get(token);
        if(deleted==null || !deleted.owner().equals(users.getCurrentUserId()) || deleted.expires().isBefore(Instant.now()) || !undo.remove(token,deleted))
            throw new ResourceNotFoundException("실행 취소가 만료되었거나 이미 사용되었습니다.");
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCompletion(int status){if(status!=STATUS_COMMITTED && deleted.expires().isAfter(Instant.now()))undo.putIfAbsent(token,deleted);}});
        var restored=new ArrayList<Ref>();
        for(var item:deleted.items()) {
            UUID id=switch(item.ref().kind()) {
                case PLAN -> createPlan(item.plan());
                case ACTUAL -> actuals.restore(item.token()).id();
                case GROUP -> groups.restore(item.token()).id();
            };
            restored.add(new Ref(item.ref().kind(),id,item.ref().sourceType()));
        }
        return restored;
    }
    private void checkSize(List<?> items){if(items==null || items.isEmpty() || items.size()>200)throw new InvalidRequestException("한 번에 1~200개 항목을 선택하세요.");}
}
