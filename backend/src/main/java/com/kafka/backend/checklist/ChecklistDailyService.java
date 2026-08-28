package com.kafka.backend.checklist;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.workrecord.WorkRecord;
import com.kafka.backend.workrecord.WorkRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class ChecklistDailyService {

    private final ChecklistDailyEntryRepository dailyEntryRepository;
    private final WorkRecordRepository workRecordRepository;
    private final CurrentUserProvider currentUserProvider;

    public ChecklistDailyService(
            ChecklistDailyEntryRepository dailyEntryRepository,
            WorkRecordRepository workRecordRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.dailyEntryRepository = dailyEntryRepository;
        this.workRecordRepository = workRecordRepository;
        this.currentUserProvider = currentUserProvider;
    }

    public ChecklistDailyResponse getForDate(LocalDate date) {
        UUID userId = currentUserProvider.getCurrentUserId();
        Optional<WorkRecord> record = workRecordRepository.findByUserIdAndWorkDate(userId, date);
        if (record.isEmpty()) {
            return new ChecklistDailyResponse(date, false, List.of());
        }

        boolean applicable = record.get().getStatus().isWorkday();
        List<ChecklistDailyEntryResponse> entries = dailyEntryRepository.findByWorkRecordIdOrderByPositionAsc(record.get().getId())
                .stream()
                .map(ChecklistDailyEntryResponse::from)
                .toList();
        return new ChecklistDailyResponse(date, applicable, entries);
    }

    /**
     * Checkbox toggle — saves immediately. Past + achieved=true means
     * "was achieved"; past + achieved=false means "was not achieved"; for
     * today, achieved=false simply means "not yet determined" — that
     * distinction lives entirely in how callers interpret the value, not in
     * a third stored state (see docs/backend/checklist.md).
     */
    @Transactional
    public ChecklistDailyEntryResponse setAchieved(UUID entryId, boolean achieved) {
        UUID userId = currentUserProvider.getCurrentUserId();
        ChecklistDailyEntry entry = dailyEntryRepository.findByIdAndUserId(entryId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Checklist daily entry not found: " + entryId));

        WorkRecord record = workRecordRepository.findById(entry.getWorkRecordId())
                .orElseThrow(() -> new ResourceNotFoundException("Work record not found for checklist entry: " + entryId));
        if (!record.getStatus().isWorkday()) {
            throw new InvalidRequestException("Checklist is not applicable for this date's current attendance status");
        }

        entry.setAchieved(achieved);
        return ChecklistDailyEntryResponse.from(dailyEntryRepository.save(entry));
    }
}
