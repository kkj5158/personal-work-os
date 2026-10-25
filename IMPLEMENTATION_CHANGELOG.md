# 구현 변경 내역 — DIET NOTE / Challenge / NOTE SYS

기준일: 2026-10-25 (Asia/Seoul). 검증한 제품 소스: POS `c9c460949ab020f97746f4981679f4706f574b4b`, 모바일 `c494f943d665a66a61ee45d25223b014eaa14692` (마지막 소스 변경은 `15dd9d6`, 이후 문서만 변경).

## 사용자 동작

- 챌린지: 카드 목록과 섹션별 편집기를 분리하고 유형·역할·상태 필터, 유형부터 시작하는 생성, 기존 초안/모두 저장, 메모·색상·마일스톤을 유지했습니다. 같은 편집기가 Daily Note의 모달에서도 열립니다. 실제 제목·삭제 결과를 확인한 뒤 기존 CAS API로 삭제합니다.
- Diet 대시보드: 날짜에 해당하는 챌린지, 아침/취침 전 측정 카드와 실제 체크리스트를 표시합니다. 체크리스트는 기존 공용 UI/저장 큐/API/집계 함수를 재사용하며 네 상태를 유지합니다. 임베드 안의 중복 일지 블록을 제거했습니다.
- 일지: 기존 NOTE SYS 본문과 모바일의 같은 사용자·날짜 일지를 연결했습니다. Markdown/사진 참조/캡션/순서를 보존하고 오래된 저장을 거절합니다. 대시보드만 갱신된 경우에는 일지 초안을 유지한 채 한 번 안전하게 재시도합니다.
- 운영 노트: 기존 일반 노트를 제목 목록으로 표시하고 생성·이름/본문 수정·휴지통 이동을 지원합니다. 실제 드래그와 키보드 순서 변경을 서버에 저장하며 실패하면 복원합니다.
- 비교: 왼쪽 날짜 목록과 오른쪽 운영 목록을 유지합니다. 중앙은 기본적으로 Daily Note 하나이며, 운영 노트를 선택하면 별도의 편집기가 오른쪽에 열립니다. 날짜 전환은 Daily Note에만 적용되고, 닫기/선택 해제 시 넓은 단일 편집기로 돌아갑니다.

## 주요 파일

| 경계 | 파일/역할 |
|---|---|
| 챌린지 UI | `frontend/app/diet/Planner.tsx`, `ChallengeDetail.tsx`, `Planner.css`, `useChallengeDrafts.ts` |
| 대시보드 | `frontend/app/notes/editor/DietDay.tsx`, `DietChecklist.tsx`, `diet-day-compact.css` |
| 기존 저장 경로 재사용 | `frontend/app/diet/store.ts`, `ChecklistRecord.tsx`의 공용 상태 어댑터 |
| NOTE 레이아웃 | `frontend/app/notes/DailyFeed.tsx`, `OperationalNotes.tsx`, `NoteSystem.tsx`, `notes.css` |
| 기존 편집기 | `frontend/app/notes/editor/NoteEditor.tsx`의 충돌/메타데이터 재적용, `frontend/lib/notes/dietJournal.ts` |
| 본문 연동 | `backend/.../diet/DietJournalBridge.java`, `DietJournalContent.java`, `DietNoteSync.java`, `DietNoteProjection.java` |
| 버전·미디어 | `DietDailyNoteService.java`, `DietCameraProjection.java`, `DietMobileService.java`, `DietMobileController.java` |
| 노트 API/정렬 | `backend/.../notesystem/NoteSystemService.java`, `NoteSystemController.java`, `NoteTypes.java`, `frontend/lib/api/notes.ts` |
| 모바일 | `src/core/journalBody.ts`, `src/v2/JournalContent.tsx`, `NoteEditor.tsx`, `Journal.tsx`, `Today.tsx`, `src/api/client.ts` |
| 검증 도구 | `qa/diet-note-owned-runtime.mjs`, `diet-note-seed.mjs`, `diet-note-api.mjs`, `diet-note-browser.mjs`, `diet-note-operations-browser.mjs` |

## API·저장소 호환성

- 기존 `PUT /api/diet/checks`, 날짜별 일지 API, NOTE 저장/편집/휴지통/미디어 API를 유지합니다.
- 기존 `GET/PUT/DELETE /api/diet/mobile/plans` 버전 검사를 웹 챌린지에서도 재사용합니다. 별도 챌린지 레코드는 없습니다.
- 추가: `GET/PUT /api/note-system/workspaces/{w}/operational-notes`. PUT은 `orderedIds`와 `expectedIds`를 요구합니다.
- 추가: `GET /api/diet/mobile/journal/{date}/media`. 소유권이 확인된 기존 NOTE 업로드 미디어와 캡션만 반환합니다.
- 추가 마이그레이션: `V98__diet_journal_delete_versions.sql`. 명시적 본문 삭제 뒤에도 빈 버전 레코드를 유지해 오래된 오프라인 초안의 복원을 막습니다. 기존 행의 데이터 변환은 없습니다.
- 동기화 OFF는 그대로 유지됩니다. 기존 활성 대상 Workspace만 본문 연동 대상입니다. 실제 사용자 데이터의 설정은 변경하지 않았습니다.
- 마이그레이션 적용/확인 범위는 격리된 로컬 DEV뿐입니다. 공유 DEV/PROD 적용이나 APK 배포를 수행하지 않았습니다.

## 소스 통합과 정리

POS와 모바일 변경을 각각 기존 `dev`에 통합하고 원격 push를 확인했습니다. 원래 POS `main` 작업 폴더의 `.claude/settings.local.json`, package-lock, AGENTS 변경은 보존했습니다. 병렬 POS 구현 작업트리 세 개는 정리했습니다. 통합 작업트리와 합성 DB/API/Web은 소유자 검토용 로컬 미리보기로 유지합니다. 모바일 임시 작업트리는 의존성 정션 삭제에 대한 자동 승인 검토 거절 때문에 남았습니다. 기존 모바일 의존성 폴더는 건드리지 않았습니다.

추가 보존 보완: 기존 사용자 소유의 공유 일지 사진은 연동 대상 Workspace를 변경해도 UUID를 복사/변경하지 않고 계속 읽을 수 있습니다. 이미 저장된 같은 사용자 사진 참조는 연동 OFF 뒤에도 유지됩니다. 일반 새 노트의 임의 외부 Workspace 참조를 허용하지 않으며 다른 사용자 미디어는 계속 거절합니다. Camera 기존 삭제·복원·원본/공유 참조 보존 경로와 함께 실제 PostgreSQL에서 재검증했습니다.
