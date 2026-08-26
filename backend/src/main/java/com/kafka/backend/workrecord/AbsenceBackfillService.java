package com.kafka.backend.workrecord;

import com.kafka.backend.common.AllUserIdsRepository;
import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.workschedule.EffectiveWorkScheduleService;
import com.kafka.backend.workschedule.PlannedStatus;
import com.kafka.backend.worksettings.WorkSettingsNotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Backfills explicit ABSENT {@link WorkRecord} rows for past dates that the
 * user's own Planning schedule ({@link EffectiveWorkScheduleService})
 * expected to be a work day, but which never received any record at all.
 * See docs/backend/work-record.md's absence-backfill section for the full
 * policy and the bounded-window rationale.
 *
 * A missing row on a date the user's schedule did NOT plan as a work day
 * (day off, annual leave, sick leave) is left alone — absence only applies
 * to a day the user was actually expected to work.
 */
@Service
public class AbsenceBackfillService {

    private final WorkRecordRepository workRecordRepository;
    private final AllUserIdsRepository allUserIdsRepository;
    private final EffectiveWorkScheduleService effectiveWorkScheduleService;
    private final AbsenceRecordWriter absenceRecordWriter;

    /**
     * How far back a single run will backfill, bounded so a very old or
     * long-dormant account never triggers an unbounded scan. Covers
     * realistic downtime/missed-run recovery (default ~3 months) without
     * being unbounded — see docs/backend/work-record.md for why this
     * specific bound was chosen (no canonical document specifies one).
     */
    @Value("${app.absence-backfill-window-days:90}")
    private int backfillWindowDays;

    public AbsenceBackfillService(
            WorkRecordRepository workRecordRepository,
            AllUserIdsRepository allUserIdsRepository,
            EffectiveWorkScheduleService effectiveWorkScheduleService,
            AbsenceRecordWriter absenceRecordWriter
    ) {
        this.workRecordRepository = workRecordRepository;
        this.allUserIdsRepository = allUserIdsRepository;
        this.effectiveWorkScheduleService = effectiveWorkScheduleService;
        this.absenceRecordWriter = absenceRecordWriter;
    }

    /** Entry point for the scheduled job — backfills every user, never today or a future date. */
    public int backfillAllUsers() {
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        LocalDate to = today.minusDays(1);
        LocalDate from = today.minusDays(backfillWindowDays);

        int created = 0;
        for (UUID userId : allUserIdsRepository.findAllUserIds()) {
            created += backfillForUser(userId, from, to);
        }
        return created;
    }

    /** Package-visible for focused testing of a single user's window without the full user scan. */
    int backfillForUser(UUID userId, LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            return 0;
        }

        List<WorkRecord> existing = workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(userId, from, to);
        Set<LocalDate> existingDates = existing.stream().map(WorkRecord::getWorkDate).collect(Collectors.toSet());

        int created = 0;
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            if (existingDates.contains(date)) {
                continue;
            }
            if (!wasPlannedAsWorkday(userId, date)) {
                continue;
            }
            if (absenceRecordWriter.createAbsenceIfMissing(userId, date)) {
                created++;
            }
        }
        return created;
    }

    private boolean wasPlannedAsWorkday(UUID userId, LocalDate date) {
        try {
            return effectiveWorkScheduleService.resolve(userId, date).plannedStatus() == PlannedStatus.WORK;
        } catch (WorkSettingsNotFoundException e) {
            // No yearly WorkSettings defined for this user/year at all —
            // there is no plan to compare against, so we cannot assert an
            // absence against an undefined expectation. Skip, don't guess.
            return false;
        }
    }
}
