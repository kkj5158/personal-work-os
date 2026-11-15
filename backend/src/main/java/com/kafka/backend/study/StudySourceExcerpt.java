package com.kafka.backend.study;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "study_source_excerpts")
class StudySourceExcerpt {
  @Id UUID id = UUID.randomUUID();

  @Column(name = "owner_id")
  UUID ownerId;

  @Column(name = "job_id")
  UUID jobId;

  @Column(name = "material_id")
  String materialId;

  @Column(name = "material_version")
  int materialVersion;

  @Column(name = "asset_id")
  UUID assetId;

  @Column(name = "source_hash")
  String sourceHash;

  @Column(name = "page_index")
  int pageIndex;

  int ordinal;

  @Column(name = "page_label")
  String pageLabel;

  @Column(columnDefinition = "text")
  String body;

  String quality;

  @Column(name = "parser_version")
  String parserVersion = "pdfbox-3.0.8/text-v1";
}
