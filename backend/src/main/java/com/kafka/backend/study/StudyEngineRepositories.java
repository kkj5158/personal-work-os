package com.kafka.backend.study;

import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;

interface StudyEngineJobs extends JpaRepository<StudyEngineJob, UUID> {
  Optional<StudyEngineJob> findByOwnerIdAndKindAndJobKey(UUID owner, String kind, String key);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select j from StudyEngineJob j where j.ownerId=:owner and j.id=:id")
  Optional<StudyEngineJob> lock(UUID owner, UUID id);

  List<StudyEngineJob> findByOwnerIdOrderByCreatedAtDesc(UUID owner, Pageable page);

  List<StudyEngineJob> findByOwnerIdAndKindAndStateOrderByCreatedAtDesc(
      UUID owner, String kind, String state, Pageable page);

  List<StudyEngineJob> findByOwnerIdAndKindInAndStateInOrderByCreatedAtAsc(
      UUID owner, Collection<String> kinds, Collection<String> states, Pageable page);

  List<StudyEngineJob> findByKindInAndStateInOrderByCreatedAtAsc(
      Collection<String> kinds, Collection<String> states, Pageable page);
}

interface StudySourceExcerpts extends JpaRepository<StudySourceExcerpt, UUID> {
  Optional<StudySourceExcerpt> findByOwnerIdAndId(UUID owner, UUID id);

  List<StudySourceExcerpt> findByOwnerIdAndJobIdOrderByPageIndexAscOrdinalAsc(
      UUID owner, UUID job, Pageable page);

  @Query(
      value =
          "select * from study_source_excerpts where owner_id=:owner and material_id=:material and"
              + " (cast(:job as uuid) is null or job_id=cast(:job as uuid)) and (:term='' or"
              + " to_tsvector('simple',body) @@ plainto_tsquery('simple',:term) or body ilike"
              + " concat('%',:term,'%')) order by page_index,ordinal limit :limit offset :offset",
      nativeQuery = true)
  List<StudySourceExcerpt> search(
      UUID owner, String material, String job, String term, int limit, int offset);
}

interface StudyEngineWorkers extends JpaRepository<StudyEngineWorker, UUID> {
  Optional<StudyEngineWorker> findByTokenHash(String hash);

  Optional<StudyEngineWorker> findByOwnerIdAndId(UUID owner, UUID id);

  List<StudyEngineWorker> findByOwnerId(UUID owner);
}

interface StudyEnginePreferences extends JpaRepository<StudyEnginePreference, UUID> {}
