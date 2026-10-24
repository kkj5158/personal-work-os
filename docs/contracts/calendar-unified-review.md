# Calendar 통합 입력·일/주/월 회고

기준: 소유자가 구현을 요청한 `POS_CALENDAR_UNIFIED_REVIEW_INPUT_CENTER_CODEX_20261024`.
범위: CALENDAR-MONTH-009, WEEKLY-010/011, DAY-012, INPUT-013.
이 문서는 이전 Calendar V1의 월/주간 회고 제외를 이번 범위에서 대체한다.
기존 시간표·Sleep/Android·추론 모델의 데이터 소유권은 변경하지 않는다.

## 사전 확인과 소유권

기반은 원격 DEV `ae6be7bc77600a0b97371d2506872b8da4f28845`다. 기본 checkout의 오래된
main, `.claude/settings.local.json`, package-lock 변경, 기존 MONEY/Sleep/auth worktree를 보존했다.
시간표의 V91/V94, 생성 그룹 수정 및 전용 NOTE editor를 확인했다. 선행 Sleep/Reflection 작업의
V92/V93은 현재 원격 DEV에 없고 인계에 작업 중이라고 기록돼 있어 이를 재구현하거나 반입하지 않았다.
V95는 이번 브랜치에서 사용하는 새 번호다. 공유 환경 반영 직전 실제 이력과 병렬 작업을 다시 확인한다.

| 현재 기능 | 데이터 소유자와 API | 이번 변경 | 주요 검증 위험 |
| --- | --- | --- | --- |
| Calendar day/week, Toolbar, TimeGrid, CalendarEditor | 기존 Calendar projection과 WORK/LIFE Actual API | 월 보기·일 입력 센터·주간 회고를 같은 쿼리 상태에 연결 | 날짜 경합, 이벤트 편집, 24h 좌표, 기존 시간표 |
| ReflectionModal, Metrics, NOTE embed | `reflection_entries`, `/api/reflections` | 같은 행에 제목·하루 점수·감정 추가, 기존 content를 메모로 사용 | 낡은 버전, 완료 상태, 기존 snapshot 보존 |
| WorkLog duration, attendance, score | `WorkRecord`, WorkTimeEntry, SupplementalWorkEntry | 기존 work_score의 부분 갱신 API, source ID별 집계 | 근태나 자식 기록 덮어쓰기 방지, 0과 null |
| CHECKLIST Journal/store/Grid/Mutations | 공통 4상태·선택·저장 큐·Undo | 같은 Grid의 singleDay 표시 옵션, 실패 재시도·flush | 기존 다일 그리드 회귀, 실패 후 날짜 이동 |
| WORK checklist | checklist-daily matrix/day/entry APIs | 기존 adapter 재사용, 분류·우선순위·메모 | 기존 entry/applicable만 편집, 보관 이력 |
| DIET checklist | 기존 useDietStore, `/api/diet/checks` | 같은 batch 경로, 상태를 덮어쓰지 않는 memo 부분 갱신 | 시작일/보관 기간/미래 제한, 상태와 메모 경합 |

## 화면과 계산

- `date`, `view=day|week|month`, `mode=all|actual|plan|review`를 기존 Calendar URL과 글로벌 탭에서 복원한다.
- 일 보기의 이벤트 필터와 무관하게 날짜별 입력 센터는 유지된다. 기존 편집기는 작은 overlay로 열린다.
- 아래쪽 시간 미지정 lane은 숨기고, 상단의 `시간 미지정 기록 열기`에서 기존 ID로 편집한다. 데이터는 삭제하지 않는다.
- 월요일부터 일요일까지 실제 4/5/6행을 계산한다. 월에 걸친 모든 주간 카드는 펼쳐서 표시하고 같은 Monday ID를 사용한다.
- 통합 근무시간은 WORK의 regular/supplemental Actual 및 untimed duration이다. Calendar sourceType+sourceId의
  중복 projection만 제거한다. 별도로 생성된 동일 내용의 실제 WORK 기록은 기존 WorkLog 정책대로 각각 합산한다.
  scheduled interval은 날짜 경계에서 나눈다. LIFE/Plan/State/Sleep 추정치는 근무시간에 넣지 않는다.
- 업무 점수는 근무 상태의 기존 WorkRecord 값만, 하루 점수·감정은 입력된 값만 평균낸다. null을 0으로 바꾸지 않는다.
  주간 점수와 감정은 사용자 독립 입력이다. 비교는 양쪽 최소 3일 및 동일 기록 수가 있을 때만 표시하고 coverage를 함께 표시한다.
- 패턴은 같은 TimeGrid와 lane/color 계산을 사용한다. 읽기 전용 7열/1440분이며 생성·이동·resize를 차단한다.
  civil clock 수학은 브라우저 DST에 영향을 받지 않는다.

## API와 저장

V95 `calendar_reviews`: `reflection_entries.title/day_score/mood` 추가 및 `calendar_weekly_reviews` 생성.
기존 content/snapshot/status/version, 적용된 migration 파일, 사용자 콘텐츠는 변경하지 않는다.
주간 유일성은 `(user_id, week_start)`이며 DB도 월요일·점수·감정 범위를 검증한다.

| API | 의미 |
| --- | --- |
| GET `/api/calendar/reviews?from&to` | 최대 63일의 일별 통계/회고와 해당 주간 회고. 조회만으로 생성하지 않음 |
| GET/PUT `/api/calendar/reviews/days/{date}` | 기존 Reflection의 구조화 필드 + content. 미존재는 version=-1의 빈 DTO |
| GET/PUT `/api/calendar/reviews/weeks/{monday}` | 단일 주간 회고. 미존재 GET은 204 |
| PUT `/api/work-records/{date}/score` | `{score,expectedVersion}`. 기존 근무일만 수정하며 다른 필드·자식은 보존 |
| PUT `/api/diet/checks/{date}/{itemId}/memo` | `{memo}`. 같은 provider의 메모만 갱신, 동시 상태 변경 보존 |

회고 PUT은 전체 편집 필드와 expectedVersion을 받는다. 최초 저장은 -1, 이후에는 읽은 버전이다.
조회에서 소유자는 인증 세션으로만 정하며, 쓰기는 SQL CAS/유일성 제약 또는 기존 JPA 버전 규칙을 따른다.
완료된 하루 회고는 기존 `/api/reflections/{date}/edit`로 명시적으로 다시 연다. 주간 회고는 별도 완료 확인을 요구하지 않는다.
제목 240자/한 줄, 메모 100000자, 심층 각 50000자, 점수 nullable 정수 0–100, 감정 nullable 정수 1–5다.

UI는 NOTE Autosave의 IME/직렬 큐를 재사용한다. 같은 날짜·주에 pending 또는 오류 초안이 있으면
Calendar/글로벌 탭 이동 전에 flush하며 실패 시 이동을 막고 초안을 보존한다. 409는 최신 기록을 먼저
보여준 뒤 사용자가 명시적으로 자신의 입력을 다시 저장한다. 자동 충돌 덮어쓰기는 없다.

WORK/DIET 결과는 CHECKLIST SYS 데이터로 복제하지 않는다. singleDay도 기존 pointer/keyboard/context/
multi-select/Undo/queue를 그대로 쓴다. 메모와 상태 저장은 분리한다. DIET은 현재 웹 provider가 제공하는
전체 read를 사용하며, 임의로 독립 캐시나 저장 테이블을 만들지 않는다.

## 릴리스 경계

격리된 PostgreSQL 테스트는 공유 DEV/PROD 이력을 인증하지 않는다. 실제 배포 SHA와 Flyway 이력,
V92/V93 선행 작업과의 필드 호환성, hosted DEV 검증 후에만 승격한다. 운영 데이터를 QA fixture로 쓰지 않는다.
Railway 커넥터 재인증이 필요한 경우 배포 미완료로 명시한다. 최종 검증·정리 근거는 같은 작업의 구현 보고서에 기록한다.
