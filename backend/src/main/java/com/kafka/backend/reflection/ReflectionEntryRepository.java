package com.kafka.backend.reflection;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

public interface ReflectionEntryRepository extends JpaRepository<ReflectionEntry, UUID> {

    Optional<ReflectionEntry> findByUserIdAndEntryDate(UUID userId, LocalDate entryDate);

    /** Atomic create; an existing reflection's content, snapshot and version are never rewritten. */
    @Modifying
    @Query(value = """
            INSERT INTO reflection_entries (id, user_id, entry_date, content, status, version)
            VALUES (:id, :owner, :date, '', 'EDITING', 0)
            ON CONFLICT (user_id, entry_date) DO NOTHING
            """, nativeQuery = true)
    int insertIfAbsent(@Param("id") UUID id, @Param("owner") UUID owner, @Param("date") LocalDate date);
}
