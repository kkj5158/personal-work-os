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
 * Enforces the cross-domain Actual-overlap invariant (locked V1 policy §8):
 * a saved, scheduled Actual interval — WorkTimeEntry, SupplementalWorkEntry,
 * or LifeTimeEntry — must never double-book real time against another one,
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
        for (Interval other : scheduledIntervals(userId, date)) {
            if (other.sourceType() == excludeSourceType && other.sourceId().equals(excludeSourceId)) {
                continue;
            }
            if (overlaps(startAt, endAt, other.startAt(), other.endAt())) {
                throw new InvalidRequestException(
                        "다른 실제 기록(" + other.label() + ") " + formatRange(other.startAt(), other.endAt()) + "과 시간이 겹칩니다."
                );
            }
        }
    }

    /** All scheduled (start/end present) Actual intervals for one user/date, across every WORK/LIFE source. */
    public List<Interval> scheduledIntervals(UUID userId, LocalDate date) {
        List<Interval> intervals = new ArrayList<>();

        Optional<WorkRecord> workRecord = workRecordRepository.findByUserIdAndWorkDate(userId, date);
        if (workRecord.isPresent()) {
            UUID workRecordId = workRecord.get().getId();
            for (WorkTimeEntry entry : workTimeEntryRepository.findByWorkRecordIdOrderByPositionAsc(workRecordId)) {
                if (entry.getStartAt() != null) {
                    intervals.add(new Interval(ActualSourceType.WORK_TIME_ENTRY, entry.getId(), entry.getItem(), entry.getStartAt(), entry.getEndAt()));
                }
            }
            for (SupplementalWorkEntry entry : supplementalWorkEntryRepository.findByWorkRecordIdOrderByPositionAsc(workRecordId)) {
                if (entry.getStartAt() != null) {
                    intervals.add(new Interval(ActualSourceType.SUPPLEMENTAL_WORK_ENTRY, entry.getId(), entry.getItem(), entry.getStartAt(), entry.getEndAt()));
                }
            }
        }

        for (LifeTimeEntry entry : lifeTimeEntryRepository.findByUserIdAndEntryDateBetweenOrderByEntryDateAscStartAtAsc(userId, date, date)) {
            if (entry.getStartAt() != null) {
                intervals.add(new Interval(ActualSourceType.LIFE_TIME_ENTRY, entry.getId(), entry.getTitle(), entry.getStartAt(), entry.getEndAt()));
            }
        }

        return intervals;
    }

    /** Half-open interval overlap test (touching boundaries allowed), matching this codebase's existing convention. */
    private boolean overlaps(OffsetDateTime aStart, OffsetDateTime aEnd, OffsetDateTime bStart, OffsetDateTime bEnd) {
        return aStart.isBefore(bEnd) && aEnd.isAfter(bStart);
    }

    private String formatRange(OffsetDateTime startAt, OffsetDateTime endAt) {
        LocalTime start = AppTimeZone.toDisplay(startAt).toLocalTime();
        LocalTime end = AppTimeZone.toDisplay(endAt).toLocalTime();
        return start.format(TIME_FORMAT) + "~" + end.format(TIME_FORMAT);
    }

    public record Interval(ActualSourceType sourceType, UUID sourceId, String label, OffsetDateTime startAt, OffsetDateTime endAt) {
    }
}
