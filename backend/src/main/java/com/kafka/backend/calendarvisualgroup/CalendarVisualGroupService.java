package com.kafka.backend.calendarvisualgroup;

import com.kafka.backend.common.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Transactional
public class CalendarVisualGroupService {
    private final CalendarVisualGroupRepository repository;
    private final CurrentUserProvider users;
    private final Map<UUID,Deleted> undo=new ConcurrentHashMap<>();
    private record Deleted(UUID owner,VisualGroupResponse snapshot,Instant expires) {}
    public record DeleteResult(UUID undoToken) {}
    public CalendarVisualGroupService(CalendarVisualGroupRepository repository,CurrentUserProvider users){this.repository=repository;this.users=users;}

    @Transactional(readOnly=true)
    public List<VisualGroupResponse> list(LocalDate from,LocalDate to){
        validateRange(from,to);
        return repository.findIntersecting(users.getCurrentUserId(),from,to).stream().map(VisualGroupResponse::from).toList();
    }
    @Transactional(readOnly=true)
    public VisualGroupResponse get(UUID id){return VisualGroupResponse.from(owned(id));}
    public VisualGroupResponse create(VisualGroupRequest request){
        var normalized=normalize(request);
        var group=new CalendarVisualGroup(UUID.randomUUID(),users.getCurrentUserId());
        group.apply(normalized);
        return VisualGroupResponse.from(repository.saveAndFlush(group));
    }
    public VisualGroupResponse update(UUID id,VisualGroupRequest request){
        var group=owned(id);
        var normalized=normalize(request); // Invalid intermediate drafts never modify a managed row.
        group.apply(normalized);
        return VisualGroupResponse.from(repository.saveAndFlush(group));
    }
    public DeleteResult delete(UUID id){
        var group=owned(id);
        var deleted=new Deleted(users.getCurrentUserId(),VisualGroupResponse.from(group),Instant.now().plusSeconds(30));
        repository.delete(group);
        UUID token=UUID.randomUUID();
        afterCommit(()->{undo.entrySet().removeIf(e->!e.getValue().expires().isAfter(Instant.now()));undo.put(token,deleted);});
        return new DeleteResult(token);
    }
    public VisualGroupResponse restore(UUID token){
        Deleted deleted=undo.get(token);
        if(deleted==null || !deleted.owner().equals(users.getCurrentUserId()) || !deleted.expires().isAfter(Instant.now()))
            throw new ResourceNotFoundException("그룹 복원을 사용할 수 없거나 시간이 만료되었습니다.");
        if(!undo.remove(token,deleted))throw new ResourceNotFoundException("그룹 복원이 이미 진행 중입니다.");
        boolean transactional=TransactionSynchronizationManager.isSynchronizationActive();
        if(transactional)TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
            @Override public void afterCompletion(int status){if(status!=STATUS_COMMITTED&&deleted.expires().isAfter(Instant.now()))undo.putIfAbsent(token,deleted);}
        });
        try{
            if(repository.existsById(deleted.snapshot().id()))throw new InvalidRequestException("같은 그룹이 이미 존재합니다.");
            var group=new CalendarVisualGroup(deleted.snapshot().id(),deleted.owner());
            group.apply(deleted.snapshot().request());
            group.restoreCreatedAt(deleted.snapshot().createdAt());
            return VisualGroupResponse.from(repository.saveAndFlush(group));
        }catch(RuntimeException ex){if(!transactional&&deleted.expires().isAfter(Instant.now()))undo.putIfAbsent(token,deleted);throw ex;}
    }
    private CalendarVisualGroup owned(UUID id){return repository.findByIdAndUserId(id,users.getCurrentUserId()).orElseThrow(()->new ResourceNotFoundException("그룹 블록을 찾을 수 없습니다."));}
    private void afterCommit(Runnable action){
        if(!TransactionSynchronizationManager.isSynchronizationActive()){action.run();return;}
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCommit(){action.run();}});
    }
    private void validateRange(LocalDate from,LocalDate to){if(from==null||to==null||to.isBefore(from))throw new InvalidRequestException("종료 날짜는 시작 날짜 이후여야 합니다.");}
    private void validateTime(LocalTime time){if(time==null||!ActivityTiming.isFiveMinute(time))throw new InvalidRequestException("그룹 시간은 5분 단위로 입력하세요.");}
    private void validatePair(LocalTime start,LocalTime end){validateTime(start);validateTime(end);if(!end.isAfter(start))throw new InvalidRequestException("그룹 종료 시간은 시작 시간 이후여야 합니다.");}
    VisualGroupRequest normalize(VisualGroupRequest r){
        if(r==null||r.title()==null||r.title().isBlank()||r.title().trim().length()>200)throw new InvalidRequestException("그룹 제목을 1~200자로 입력하세요.");
        validateRange(r.startDate(),r.endDate());
        if(r.timeRule()==null)throw new InvalidRequestException("시간 규칙을 선택하세요.");
        if(r.color()==null||!r.color().matches("#[0-9a-fA-F]{6}"))throw new InvalidRequestException("올바른 그룹 색상을 선택하세요.");
        LocalTime start=null,end=null;
        List<Integer> weekdays=List.of();List<VisualGroupRequest.Day> days=List.of();
        switch(r.timeRule()){
            case ALL_DAY -> { }
            case SAME_TIME_EACH_DAY -> {
                validatePair(r.startTime(),r.endTime());start=r.startTime();end=r.endTime();
                if(r.weekdays()==null||r.weekdays().isEmpty()||r.weekdays().stream().anyMatch(d->d==null||d<1||d>7))throw new InvalidRequestException("요일을 하나 이상 선택하세요 (월요일 1 ~ 일요일 7).");
                weekdays=r.weekdays().stream().distinct().sorted().toList();
            }
            case PER_DAY -> {
                var normalized=new ArrayList<VisualGroupRequest.Day>();var dates=new HashSet<LocalDate>();
                for(var day:r.days()==null?List.<VisualGroupRequest.Day>of():r.days()){
                    if(day==null||day.date()==null||day.date().isBefore(r.startDate())||day.date().isAfter(r.endDate()))throw new InvalidRequestException("날짜별 설정은 그룹 기간 안에 있어야 합니다.");
                    if(!dates.add(day.date()))throw new InvalidRequestException("같은 날짜를 두 번 설정할 수 없습니다.");
                    if(day.enabled()==null)throw new InvalidRequestException("날짜별 사용 여부를 지정하세요.");
                    if(day.enabled())validatePair(day.startTime(),day.endTime());
                    normalized.add(new VisualGroupRequest.Day(day.date(),day.enabled(),day.enabled()?day.startTime():null,day.enabled()?day.endTime():null));
                }
                days=normalized.stream().sorted(Comparator.comparing(VisualGroupRequest.Day::date)).toList();
            }
            case CONTINUOUS -> {
                validateTime(r.startTime());validateTime(r.endTime());start=r.startTime();end=r.endTime();
                if(!r.endDate().atTime(end).isAfter(r.startDate().atTime(start)))throw new InvalidRequestException("연속 그룹의 종료 일시는 시작 일시 이후여야 합니다.");
            }
        }
        return new VisualGroupRequest(r.title().trim(),r.startDate(),r.endDate(),r.timeRule(),r.color().toLowerCase(Locale.ROOT),start,end,weekdays,days);
    }
}
