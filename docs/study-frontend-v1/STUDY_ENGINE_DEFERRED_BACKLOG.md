# STUDY deferred engine backlog

Date: 2026-10-27, Asia/Seoul. This frontend release does not make the Learning Agent operational.

1. **Authenticated persistence and attachments.** Implement StudyDataPort server adapter, versioned drafts/attempts, per-user ownership, idempotency and concurrency control. Add object storage, signed access, file signature validation, malware scanning and retention/deletion. Preserve hybrid question coverage; do not migrate sample state into real records.
2. **Sources and roadmap.** Connect source metadata, rights-aware ingestion, chapter/scope selection, parsing and indexing. Do not treat local file selection as ingestion or import protected textbook contents implicitly.
3. **Question generation and validation.** Add engine jobs and approved model/runtime selection separately. Validate allowlisted schemas on the server, separate answer-key delivery, bind sources/versions, and record quality/review status. Support variable order/count/options without renderer changes.
4. **Paired document artifacts.** Generate actual readable question and answer/explanation PDFs from the same immutable workbook snapshot. Atomically publish only matching validated pairs. Add real preview/download/print and an explicit versioned correction/reissue workflow.
5. **Weekly scheduling.** Prepare the next Monday–Sunday batch on Sunday evening, Asia/Seoul, without overwriting Sunday or historical progress. Exact Sunday time needs an owner decision. Add deduplication, retries, error visibility, missed-run recovery and an audited automation switch.
6. **Assessment and coach.** Add OCR/handwriting processing, model/rubric grading and confidence/review states only after storage and ownership are ready. Keep subjective self-review distinct from AI-evaluated scores. Analyze feedback into proposals; retain explicit approval/rejection and future-only effective scope.
7. **Notifications and email.** Implement opt-in delivery, recipient confirmation, preferences, rate limits and delivery status after real artifact publication. No messages or emails were sent by this frontend task.

Release gates: server authorization tests; historical binding and mixed-submission tests; PDF integrity/readability; KST boundary/scheduler recovery; uploaded-file lifecycle; hosted authenticated desktop/mobile smoke. Remove public sample exposure only through a clear product decision; never route a demo flag to privileged content.

Rollback: the current change adds no DB tables, backend routes, persisted learning data or external jobs. Reverting its frontend routes/navigation can disable the feature without learning-data rollback. A later persistence release needs its own migration, compatibility and data-preservation plan.
