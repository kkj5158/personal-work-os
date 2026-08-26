package com.kafka.backend.workrecord;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Runs {@link AbsenceBackfillService} daily, safely after the Asia/Seoul day
 * boundary so "yesterday" is unambiguous. Idempotent and safe to run more
 * often or trigger manually — see {@link AbsenceRecordWriter}.
 */
@Component
public class AbsenceBackfillScheduler {

    private static final Logger log = LoggerFactory.getLogger(AbsenceBackfillScheduler.class);

    private final AbsenceBackfillService service;

    public AbsenceBackfillScheduler(AbsenceBackfillService service) {
        this.service = service;
    }

    @Scheduled(cron = "${app.absence-backfill-cron:0 0 1 * * *}", zone = "Asia/Seoul")
    public void run() {
        int created = service.backfillAllUsers();
        log.info("Absence backfill run created {} record(s)", created);
    }
}
