package com.kafka.backend.calendar;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.lifetime.LifeTimeEntry;
import com.kafka.backend.lifetime.LifeTimeEntryRepository;
import com.kafka.backend.supplementalwork.SupplementalWorkEntry;
import com.kafka.backend.supplementalwork.SupplementalWorkEntryRepository;
import com.kafka.backend.workrecord.WorkRecord;
import com.kafka.backend.workrecord.WorkRecordRepository;
import com.kafka.backend.worktimeentry.WorkTimeEntry;
import com.kafka.backend.worktimeentry.WorkTimeEntryRepository;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Enforces general cross-domain Actual overlap with the approved identical-record exception:
 * a saved, scheduled Actual interval — WorkTimeEntry, SupplementalWorkEntry,
 * or LifeTimeEntry — rejects nonidentical overlapping real-time records,
 * for the same user and (same-day) date. State is excluded entirely; an
 * Actual record with no start/end is outside this check until scheduled.
 * <p>
 * Every entity here stores {@code workRecordId}/plain foreign ids rather
 * than JPA relationships (matching this codebase's existing style), so
 * gathering "every scheduled Actual on this date" is done by resolving the
 * date's WorkRecord first rather than a cross-entity join query.
 */
@Component
public class ActualOverlapChecker {

    @org.springframework.beans.factory.annotation.Autowired
    private org.springframework.jdbc.core.JdbcTemplate db;

    /** All ordinary writers acquire this before reading/mutating source rows, within their transaction. */
    public void lockOwner(UUID userId) {
        if(db!=null) db.query("select id from auth.users where id=? for update", rs->{},userId);
    }

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");

    private final WorkRecordRepository workRecordRepository;
    private final WorkTimeEntryRepository workTimeEntryRepository;
    private final SupplementalWorkEntryRepository supplementalWorkEntryRepository;
    private final LifeTimeEntryRepository lifeTimeEntryRepository;

    public ActualOverlapChecker(
            WorkRecordRepository workRecordRepository,
            WorkTimeEntryRepository workTimeEntryRepository,
            SupplementalWorkEntryRepository supplementalWorkEntryRepository,
            LifeTimeEntryRepository lifeTimeEntryRepository
    ) {
        this.workRecordRepository = workRecordRepository;
        this.workTimeEntryRepository = workTimeEntryRepository;
        this.supplementalWorkEntryRepository = supplementalWorkEntryRepository;
        this.lifeTimeEntryRepository = lifeTimeEntryRepository;
    }

    /**
     * Throws {@link InvalidRequestException} if [startAt, endAt) overlaps
     * any other scheduled Actual interval on {@code date} for {@code userId}.
     * {@code excludeSourceType}/{@code excludeSourceId} let an update ignore
     * the record's own pre-existing row.
     */
    public void assertNoConflict(
            UUID userId,
            LocalDate date,
            OffsetDateTime startAt,
            OffsetDateTime endAt,
            ActualSourceType excludeSourceType,
            UUID excludeSourceId
    ) {
        Content content=null;
        if(excludeSourceId!=null && excludeSourceType!=null) content=switch(excludeSourceType) {
            case LIFE_TIME_ENTRY -> lifeTimeEntryRepository.findByIdAndUserId(excludeSourceId,userId).map(Content::from).orElse(null);
            case WORK_TIME_ENTRY -> workTimeEntryRepository.findByIdAndUserId(excludeSourceId,userId).map(Content::from).orElse(null);
            case SUPPLEMENTAL_WORK_ENTRY -> supplementalWorkEntryRepository.findByIdAndUserId(excludeSourceId,userId).map(Content::from).orElse(null);
        };
        // WORK/LIFE scheduled duration follows the proposed interval; supplemental duration stays manual.
        if(content!=null && excludeSourceType!=ActualSourceType.SUPPLEMENTAL_WORK_ENTRY)
            content=new Content(content.label(),content.categoryId(),(int)Math.max(1,java.time.Duration.between(startAt,endAt).toMinutes()),content.memo(),content.phaseId());
        assertNoConflict(userId,date,startAt,endAt,excludeSourceType,excludeSourceId,content);
    }

    public void assertNoConflict(UUID userId, LocalDate date, OffsetDateTime startAt, OffsetDateTime endAt,
            ActualSourceType sourceType, UUID sourceId, Content content) {
        Interval candidate=new Interval(sourceType,sourceId,content==null?null:content.label(),startAt,endAt,content);
        for (Interval other : scheduledIntervals(userId, date)) {
            if (other.sourceType() == sourceType && other.sourceId().equals(sourceId)) {
                continue;
            }
            if (overlaps(startAt, endAt, other.startAt(), other.endAt()) && !identical(candidate,other)) {
                throw new InvalidRequestException(
                        conflictMessage(other)
                );
            }
        }
    }

    /** Validate the final aggregate after both Work Log lists have been replaced.
     * Queries see flushed replacements, never obsolete rows from the request's old lists. */
    public void assertDayHasNoConflict(UUID userId, LocalDate date) {
        assertDayHasNoNewConflict(userId,date,List.of());
    }
    public void assertDayHasNoNewConflict(UUID userId, LocalDate date, List<Interval> before) {
        List<Interval> intervals = scheduledIntervals(userId, date);
        for (int i = 0; i < intervals.size(); i++) {
            for (int j = i + 1; j < intervals.size(); j++) {
                Interval a = intervals.get(i), b = intervals.get(j);
                if (overlaps(a.startAt(), a.endAt(), b.startAt(), b.endAt()) && !identical(a,b) && !(unchanged(a,before) && unchanged(b,before))) {
                    throw new InvalidRequestException(conflictMessage(b));
                }
            }
        }
    }

    private boolean unchanged(Interval value,List<Interval> before) {
        return before.stream().anyMatch(old->old.sourceType()==value.sourceType() && old.sourceId().equals(value.sourceId()) && old.startAt().isEqual(value.startAt()) && old.endAt().isEqual(value.endAt()));
    }

    /** All scheduled (start/end present) Actual intervals for one user/date, across every WORK/LIFE source. */
    public List<Interval> scheduledIntervals(UUID userId, LocalDate date) {
        List<Interval> intervals = new ArrayList<>();

        Optional<WorkRecord> workRecord = workRecordRepository.findByUserIdAndWorkDate(userId, date);
        if (workRecord.isPresent()) {
            UUID workRecordId = workRecord.get().getId();
            for (WorkTimeEntry entry : workTimeEntryRepository.findByWorkRecordIdOrderByPositionAsc(workRecordId)) {
                if (entry.getStartAt() != null) {
                    intervals.add(new Interval(ActualSourceType.WORK_TIME_ENTRY, entry.getId(), entry.getItem(), entry.getStartAt(), entry.getEndAt(),Content.from(entry)));
                }
            }
            for (SupplementalWorkEntry entry : supplementalWorkEntryRepository.findByWorkRecordIdOrderByPositionAsc(workRecordId)) {
                if (entry.getStartAt() != null) {
                    intervals.add(new Interval(ActualSourceType.SUPPLEMENTAL_WORK_ENTRY, entry.getId(), entry.getItem(), entry.getStartAt(), entry.getEndAt(),Content.from(entry)));
                }
            }
        }

        for (LifeTimeEntry entry : lifeTimeEntryRepository.findByUserIdAndEntryDateBetweenOrderByEntryDateAscStartAtAsc(userId, date, date)) {
            if (entry.getStartAt() != null) {
                intervals.add(new Interval(ActualSourceType.LIFE_TIME_ENTRY, entry.getId(), entry.getTitle(), entry.getStartAt(), entry.getEndAt(),Content.from(entry)));
            }
        }

        return intervals;
    }

    /** Half-open interval overlap test (touching boundaries allowed), matching this codebase's existing convention. */
    private boolean overlaps(OffsetDateTime aStart, OffsetDateTime aEnd, OffsetDateTime bStart, OffsetDateTime bEnd) {
        return aStart.isBefore(bEnd) && aEnd.isAfter(bStart);
    }

    private String conflictMessage(Interval other) {
        String domain = other.sourceType() == ActualSourceType.LIFE_TIME_ENTRY ? "LIFE" : "WORK";
        return formatRange(other.startAt(), other.endAt()) + " 기존 " + domain + " 기록(" + other.label() + ")과 겹칩니다.";
    }

    private String formatRange(OffsetDateTime startAt, OffsetDateTime endAt) {
        LocalTime start = AppTimeZone.toDisplay(startAt).toLocalTime();
        LocalTime end = AppTimeZone.toDisplay(endAt).toLocalTime();
        return start.format(TIME_FORMAT) + "–" + end.format(TIME_FORMAT);
    }

    /** Equality permits overlap only; it never reuses, merges, or deletes a source identity. */
    public static boolean identical(Interval a,Interval b) {
        return a.sourceType()!=null && a.sourceType()==b.sourceType() && a.content()!=null && a.content().equals(b.content())
            && a.startAt().isEqual(b.startAt()) && a.endAt().isEqual(b.endAt());
    }
    public record Content(String label,UUID categoryId,Integer durationMinutes,String memo,UUID phaseId) {
        public Content {label=normalize(label);memo=normalize(memo);}
        private static String normalize(String value) {return value==null || value.isBlank()?null:value.trim();}
        public static Content from(LifeTimeEntry e) {return new Content(e.getTitle(),e.getLifeCategoryId(),e.getDurationMinutes(),e.getMemo(),null);}
        public static Content from(WorkTimeEntry e) {return new Content(e.getItem(),e.getCategoryId(),e.getMinutes(),e.getMemo(),e.getPhaseId());}
        public static Content from(SupplementalWorkEntry e) {return new Content(e.getItem(),e.getCategoryId(),e.getTotalMinutes(),e.getMemo(),e.getPhaseId());}
    }
    public record Interval(ActualSourceType sourceType, UUID sourceId, String label, OffsetDateTime startAt, OffsetDateTime endAt,Content content) {
        public Interval(ActualSourceType sourceType,UUID sourceId,String label,OffsetDateTime startAt,OffsetDateTime endAt) {this(sourceType,sourceId,label,startAt,endAt,null);}
    }
}
