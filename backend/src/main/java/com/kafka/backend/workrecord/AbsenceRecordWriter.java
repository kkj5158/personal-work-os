package com.kafka.backend.workrecord;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Isolated per-row writer for the absence backfill scheduler. Kept as its
 * own bean (rather than a private method on {@link AbsenceBackfillService})
 * specifically so {@code REQUIRES_NEW} actually takes effect — Spring's
 * proxy-based {@code @Transactional} does not apply to self-invoked calls
 * within the same class, and one bad/racing row must never roll back the
 * whole backfill batch.
 */
@Service
public class AbsenceRecordWriter {

    private final WorkRecordRepository repository;

    public AbsenceRecordWriter(WorkRecordRepository repository) {
        this.repository = repository;
    }

    /**
     * Re-checks existence inside its own transaction (defends against a
     * race within the same backfill run across concurrent scheduler
     * instances) and treats a unique-constraint violation on save as "someone
     * else already created it" rather than a failure — both make repeated
     * and concurrent execution safe.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean createAbsenceIfMissing(UUID userId, LocalDate workDate) {
        if (repository.findByUserIdAndWorkDate(userId, workDate).isPresent()) {
            return false;
        }
        try {
            repository.saveAndFlush(WorkRecord.createAbsence(userId, workDate));
            return true;
        } catch (DataIntegrityViolationException e) {
            return false;
        }
    }
}
