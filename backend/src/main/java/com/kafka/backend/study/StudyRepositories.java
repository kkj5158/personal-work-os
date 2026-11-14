package com.kafka.backend.study;

import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;

interface StudyWorkspaces extends JpaRepository<StudyWorkspace, UUID> {
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select w from StudyWorkspace w where w.ownerId=:owner")
  Optional<StudyWorkspace> lock(UUID owner);
}

interface StudyWorkbooks extends JpaRepository<StudyWorkbook, UUID> {
  Optional<StudyWorkbook> findByOwnerIdAndWorkbookIdAndWorkbookVersion(
      UUID owner, String id, int version);

  List<StudyWorkbook> findByOwnerIdOrderByCreatedAtAsc(UUID owner);
}

interface StudyRecords extends JpaRepository<StudyRecord, UUID> {
  Optional<StudyRecord> findByOwnerIdAndKindAndRecordKey(UUID owner, String kind, String key);

  List<StudyRecord> findByOwnerIdOrderByCreatedAtAsc(UUID owner);

  List<StudyRecord> findByOwnerIdAndKind(UUID owner, String kind);
}

interface StudyAssets extends JpaRepository<StudyAsset, UUID> {
  Optional<StudyAsset> findByOwnerIdAndId(UUID owner, UUID id);

  List<StudyAsset> findByOwnerId(UUID owner);
}
