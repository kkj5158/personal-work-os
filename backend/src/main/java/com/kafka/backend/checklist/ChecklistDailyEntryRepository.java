package com.kafka.backend.checklist;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChecklistDailyEntryRepository extends JpaRepository<ChecklistDailyEntry, UUID> {

    List<ChecklistDailyEntry> findByWorkRecordIdOrderByPositionAsc(UUID workRecordId);

    boolean existsByWorkRecordId(UUID workRecordId);

    Optional<ChecklistDailyEntry> findByIdAndUserId(UUID id, UUID userId);

    List<ChecklistDailyEntry> findByUserIdAndWorkDateBetween(UUID userId, LocalDate from, LocalDate to);

    List<ChecklistDailyEntry> findByUserIdAndItemIdAndWorkDateBetweenOrderByWorkDateAsc(UUID userId, UUID itemId, LocalDate from, LocalDate to);

    /**
     * Race-safe backfill insert for {@link ChecklistSnapshotService}: two
     * concurrent requests (e.g. the Day view's parallel
     * {@code getForDate}/{@code getMatrix} fetch) can both decide the same
     * (work_record_id, item_id) entry is missing at the same instant — an
     * ordinary {@code save()} there would race on the unique constraint and
     * surface as a 500. {@code ON CONFLICT DO NOTHING} makes the loser a
     * silent no-op instead, which is exactly the idempotent outcome
     * {@code ensureSnapshot} wants either way.
     */
    @Modifying
    @Query(value = """
            INSERT INTO checklist_daily_entries
                (id, work_record_id, item_id, user_id, work_date, name, emoji, priority, goal_percent, position, achieved, result)
            VALUES
                (:id, :workRecordId, :itemId, :userId, :workDate, :name, :emoji, :priority, :goalPercent, :position, false, 'UNSET')
            ON CONFLICT (work_record_id, item_id) DO NOTHING
            """, nativeQuery = true)
    void insertIfAbsent(
            @Param("id") UUID id,
            @Param("workRecordId") UUID workRecordId,
            @Param("itemId") UUID itemId,
            @Param("userId") UUID userId,
            @Param("workDate") LocalDate workDate,
            @Param("name") String name,
            @Param("emoji") String emoji,
            @Param("priority") String priority,
            @Param("goalPercent") int goalPercent,
            @Param("position") int position
    );
}
