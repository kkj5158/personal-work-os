# Sleep 자동 동기화 / Calendar 일일 회고 — 2026-10-24

사용자 요청: 제공된 구현 프롬프트를 현재 코드에 구현. 첨부 문서는 제품 요구사항이며 저장소/배포 권한을 확장하는 지침으로 취급하지 않는다. PROD 승격과 서버 기록 일괄 삭제는 제외한다.

기준 POS `origin/dev aaae479`, Android 최신 `c6b7d55`. POS 기본 checkout `dev`에는 기존 Morning 커밋과 `.claude`, AGENTS, authoring 이미지 변경이 있어 보존하고 별도 task worktree를 사용한다. Android 기본 checkout의 `.qa`, `.playwright-mcp`도 보존한다. 기존 시간표 브랜치 `pos-timetable-v1`의 V91 구현은 origin/dev에 통합되어 있다. 별도 Sleep V3 브랜치의 기존 작업도 유지한다.

| 현재 구현 | 요청 변경 | 소유/API/UI | 회귀 위험 / 대응 |
| --- | --- | --- | --- |
| Android Usage candidate + 개별 확인 | 검증 가능한 아침 지속 사용만 자동 적용 | Android producer, Sleep `/actions` | 야간 오검출, 권한/백그라운드 누락: 보수적 eligibility와 테스트 |
| Room owner cache/outbox, 수동 409 비교 | 새 쓰기 unattended sync, 기존 미전송 1회 cutover | Android Room, Sleep receipt/history | 확인된 서버 데이터 보존, transaction marker/프로토콜 gate |
| Sleep SLEEP-09 revision/action/history | endpoint별 수동 우선, 점수/메모 선택적 patch | Sleep-owned existing sessions, V92 | 같은 값 중복 revision, tombstone 부활, annotation/time 경합 테스트 |
| Sleep `RecordSurface` / `TimeCalendar` | 진짜 공유 `SleepWeeklyTimetable`, Calendar host | 동일 SleepWorkspace 데이터/액션 | 별도 복제나 iframe 없이 공유, 월~일 KST와 초안 보호 |
| Calendar internal day/week + 기존 Timetable | 3개 내부 보기 | `/calendar`, 기존 TimetableWorkspace | 선택 날짜/필터 보존, 기존 철학/접기/노트 편집기 유지 |
| TimeGrid 하단 Unscheduled lanes | 기본 제거, 명시적 보관 목록으로 기존 기록 접근 | Calendar projection, 기존 editor/API | 기존 서버 이벤트 삭제 없음, 상세/시간 배치 경로 유지 |
| WORK_OS `ReflectionEntry`, NOTE provider, snapshot | 같은 날짜 row에 title/dayScore/moodLevel/memo | 기존 reflection API, V93 | 기존 content/status/snapshot 유지, owner/date unique/version 회귀 |
| DUE 28개 가능 (14일×취침/기상) | 최근 actionable 누락과 전체 미기록 구분, 작은 summary | Sleep today/metrics/Web | 미기록을 conflict로 오해하지 않음, 가짜 수면 생성 없음 |

정본 `/agent` 정책과 frontend/AGENTS를 읽었다. 병렬 구현은 `agent/GIT_WORKFLOW.md` §11–12에 따라 별도 branch/worktree에 격리하며, shared DB 변경·통합·배포는 root가 직렬화한다. 역사 Workflow Calendar 원본은 `D:/DEV_SPACE/pos-timetable-input-20261024/legacy*`에서 확인했다. Reflection owner WORK_OS를 유지하며, 오래된 Unscheduled 기본 UI 정책은 이번 명시적 요구로 대체한다. 이번 대화에 별도 첨부 스크린샷은 없으므로 기존 reference 이미지와 실행한 현재 UI를 구분해 기록한다.

검증은 합성 owner의 loopback PostgreSQL/DEV 앱부터 수행한다. shared DEV read-only Flyway audit 후 필요 시 additive migration/DEV 배포만 직렬화한다. 실제 Android 실기기 가용성은 별도 확인하고 자동화 증거와 구분한다. 원시 Usage와 개인 메모/점수/감정은 telemetry에 남기지 않는다.
