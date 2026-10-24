# Calendar 주간 시간표 V1

2026-10-24. 제품 기준: 사용자 제공 `POS-TIMETABLE-V1` 및 `POS_TIMETABLE_GROUP_EDIT_FIX_20261024`.
생성 그룹 편집 결정이 이전의 다중 요일 블록 독립 편집 결정을 대체한다.

`/calendar?tab=timetable&timetable=<UUID>`는 날짜 없는 월~일 시간표다. 기존 날짜별
Plan/Actual/State/Reflection과 별개이며 반복 일정 엔진이나 날짜별 일정 가져오기가 아니다.
일/주 화면의 `date`, `view`, `mode` 쿼리는 보존한다. 글로벌 탭 복원도 이 경로를 지원한다.

## 저장과 API

V91은 `calendar_timetables`, `calendar_timetable_blocks`만 새로 만든다. 기존 기록이나
적용된 migration을 수정하지 않는다. 빈 상태로 시작하며 운영 예제를 자동 생성하지 않는다.

- Timetable: 인증 소유자, 이름, 여러 줄 설명·목표·메모, 기본색, 순서, 보관 시각,
  checklist JSON text, metadata version, 운영 철학 Markdown 원문과 별도 philosophy version.
- Block: 부모 시간표, 월요일=1~일요일=7, startMinute 0~1439, durationMinutes 1~1440,
  제목, 메모, nullable 명시색, version, soft deletedAt, nullable creationGroupId. 특정 날짜는 저장하지 않는다.
- Checklist: 시간표 소유 항목 UUID·제목·체크 상태와 배열 순서. 날짜별 초기화가 없다.
- 모든 읽기와 쓰기는 `CurrentUserProvider` 소유자를 확인한다. 클라이언트 owner 값은 무시한다.
  타 사용자 또는 다른 부모의 ID는 404, 보관된 부모의 콘텐츠 쓰기는 400, 낡은 version은 409다.
- 시각과 버전의 소수 입력을 반올림하지 않고 400으로 거절한다. 동시 쓰기는 부모 row lock으로
  직렬화한다. 철학 저장은 metadata version을 변경하지 않아 보조 정보 편집과 독립적이다.

Base: `/api/calendar/timetables`

| 메서드·경로 | 의미 |
| --- | --- |
| GET `/context` | 현재 인증 ownerId, 사용자별 기기 설정 namespace |
| GET `/`, GET `/{id}` | 소유자의 활성·보관 시간표 / 단일 정보 |
| POST `/` | 빈 시간표 생성, `Idempotency-Key: UUID` 필수 |
| PUT `/{id}` | 전체 metadata와 checklist, version 필수 |
| PUT `/order` | 활성 시간표의 전체 IDs를 중복 없이 정렬 |
| PUT `/{id}/archive` | `{version, archived}` 보관·복원 |
| POST `/{id}/duplicate` | `{version}` 전체 복제, Idempotency-Key 필수 |
| GET·PUT `/{id}/philosophy` | `{content, version, updatedAt}` / `{content, version}` |
| GET `/{id}/blocks` | 삭제되지 않은 블록 |
| POST `/{id}/blocks` | `{weekdays, block}` 원자적 다중 요일 생성, Idempotency-Key 필수 |
| PUT `/{id}/block-groups/{group}` | `{weekdays, block, members:[{id,version}]}` 그룹 원자적 조정, Idempotency-Key 필수; 해당 시간표 전체 활성 blocks 반환 |
| PUT `/{id}/blocks/{block}` | version 포함 블록 전체 수정 |
| DELETE `/{id}/blocks/{block}?version=N` | 복원 가능한 soft delete |
| POST `/{id}/blocks/{block}/restore` | `{version}` 같은 ID 복원 |

생성·복제는 기존 `CalendarCreationOperations`를 재사용한다. 인증 사용자 row lock과
같은 DB 트랜잭션 안에서 콘텐츠 및 응답 receipt를 커밋한다. operation 종류·대상·본문을
SHA-256으로 바인딩하므로 같은 키를 다른 요청에 재사용하면 거절한다. 요청 응답을 잃어도
같은 키로 재시도하면 최초 결과를 반환한다. UI의 생성·복제·다중 블록 폼은 실패 시 키를 유지한다.

복제는 metadata·운영 철학·전체 활성 블록·checklist의 상태와 순서를 복사하고 새 ID를 발급한다.
부분 실패 시 부모·자식·receipt가 함께 rollback된다. 보관된 시간표의 ID와 데이터는 유지된다.

### 생성 그룹 편집

둘 이상의 요일을 함께 생성하면 한 creationGroupId를 저장한다. 단일 요일 생성은 null이다.
같은 제목·시각·색상·메모라도 별도 생성은 별개다. 그룹 멤버를 클릭하면 서버에서 최신 블록을
다시 읽고 기존 BlockDialog에 실제 멤버의 시작 요일과 공통 필드를 표시한다. 자정 조각은 같은 논리 블록이다.
폼은 `함께 만든 블록 N개 수정`을 표시하고 요일 다중 선택·저장·취소를 재사용한다.

저장은 기존 멤버 전체 ID와 version을 비교한다. 멤버 추가·분리·삭제나 버전 변경이 있으면 409이며
초안은 유지된다. 유지한 요일은 기존 ID를 갱신하고, 추가 요일은 새 ID를 만들며, 해제 요일은
soft delete와 그룹 분리를 수행한다. 한 요일만 남아도 그룹 ID를 유지한다. 최소 한 요일이 필요하다.
같은 사용자/부모의 row lock 및 CalendarCreationOperations receipt로 전체 쓰기와 응답을 원자적으로
커밋한다. 동일 본문 재시도는 같은 키, 실패 후 본문 변경은 새 키를 사용한다. 저장 중 중복 제출을 막는다.

개별 drag/resize/삭제는 그 블록만 원자적으로 그룹에서 분리한다. 실행 취소도 분리된 상태를 유지한다.
그룹 폼의 삭제는 `이 블록 삭제`다. 개별 복제는 미연결이며, 전체 시간표 복제는 원본과 다른 그룹 ID를
발급하고 복사본 내부 멤버 관계만 유지한다. 명시색 null의 기본색 상속 의미는 동일하다.

V94는 nullable column과 부모·그룹·시작 요일의 활성 멤버 unique index를 추가한다. V92/V93은
병렬 Sleep/Reflection 작업이 사용하므로 건드리지 않는다. V91의 다중 생성 receipt에 원본 ID 목록이
있으면 같은 owner/부모임을 확인해 version=0인 활성 멤버만 그룹을 복구한다. 개별 수정·삭제·복원 이력이
있는 멤버는 재결합하지 않는다. 원본 내용·ID·version·updatedAt은 변경하지 않는다. 신뢰 가능한 receipt가
없는 기존 블록과 과거 전체 복제 블록은 개별 편집 상태를 유지한다. 유사도·생성 시각 추정은 하지 않는다.

## 화면과 초안

왼쪽 상세 카드 / 중앙 7열 그리드 / 오른쪽 운영 철학과 보조 정보로 구성한다.
카드에는 설명·목표·메모를 여러 줄로 표시하고 긴 내용 펼치기를 제공한다.
보조 정보는 같은 metadata 초안을 미리보기하므로 좌우가 즉시 일치한다.
정보 저장·취소는 명시적이며 실패·409 시 초안이 남는다. 최신 버전 확인 후 사용자가
보존한 초안을 다시 저장할 수 있다. checklist는 항목 수정·정렬·체크·추가·제거를 지원한다.

좌우 패널의 독립 접힘 상태와 마지막 선택은 기존 browser UI preference 방식에 따라
`calendar.timetable.layout.v1:<ownerId>`에 저장한다. 이 기기의 사용자별 설정이며
콘텐츠를 localStorage에 저장하지 않는다. 최초 값 없음/기본 복원은 양쪽 펼침이다.
hidden 패널과 방문한 철학 편집기는 unmount하지 않아 초안·선택·저장 큐가 유지된다.
접기 후 중앙 토글로 포커스를 이동하며 aria-expanded/controls/라벨을 제공한다.

그리드는 00:00~24:00, 1분당 1px, 기본 드래그 15분 스냅이다. 작은 폭에서는 그리드 내부
가로 스크롤로 최소 열 폭을 보존한다. ResizeObserver가 폭 변경 중 제스처를 취소하고,
다음 포인터는 실제 최신 bounding rect에서 좌표를 얻는다. 접기 전후 세로 위치는 유지한다.
클릭·드래그 생성, 요일 이동, 길이 조절, 중앙 modal 폼, 복제·삭제를 지원한다.
드래그/리사이즈 실패는 이전 상태로 복구하고 서버를 재조회한다. 성공 변경과 삭제는
version을 검사하는 실행 취소를 제공하며 이후 변경을 조용히 덮어쓰지 않는다.

자정 넘김은 한 블록을 두 요일의 segment로 표시한다. 일요일도 월요일로 순환한다.
양쪽 조각은 같은 ID를 편집·복제·삭제한다. 종료 경계에 닿는 블록은 겹침이 아니며,
실제로 겹치는 연결 그룹만 독립 레인으로 배치한다. 다음 날 같은 시각은 정확히 24시간이다.

## 기존 편집기와 색상 재사용

- `frontend/app/notes/editor/NoteEditor.tsx`의 기존 `NoteEditorSource` 어댑터를
  `frontend/app/calendar/timetable/PhilosophyEditor.tsx`에서 사용한다. 노트 문서를 생성하지 않는다.
- 본문은 기존 정규 Markdown 모델 그대로 저장한다. Tiptap StarterKit, Markdown, task-list,
  제목 1~3, 강조·기울임·취소선, 인용, 목록·체크, 링크, 인라인/블록 코드, 구분선,
  텍스트/HTML 붙여넣기, 키보드 Undo/Redo, 문서 검색과 기존 링크 정책을 재사용한다.
- 기존 `lib/notes/autosave.ts`의 직렬 저장, 800ms debounce, IME 보류, blur flush,
  실패 재시도, 버전 충돌 비교·명시적 해결, sessionStorage 복구 초안을 유지한다.
  editor와 queue를 시간표 ID별로 분리한다. 확대 편집은 같은 editor DOM을 넓히는 방식이다.
- Workspace 태그·이미지 업로드·위키 대상 탐색·노트 pin/trash는 기존 source 어댑터의
  경계에 따라 표시하지 않는다. 텍스트 붙여넣기와 본문 편집 기능을 대체하지 않으며
  시간표를 위해 가짜 NOTE Workspace나 파일을 만들지 않는다. 기존 NOTE 탭은 수정하지 않는다.
- `frontend/app/calendar/CategoryColorPicker.tsx`와 `appearance.ts`의 12색,
  최근 8색 중복 제거, native 직접 지정, 선택 표시·기본 복원을 재사용한다.
  색상 우선순위는 block.color > timetable.defaultColor > UNKNOWN_CATEGORY_COLOR.
  직접색에 대비되는 글자색을 계산한다. 폼 취소는 서버 색상을 바꾸지 않는다.
- picker는 native dialog의 top layer 안에 portal을 배치하고 scroll/resize 시 위치를 갱신한다.
  이 호환성 수정 외에 기존 날짜별 카테고리 색상 저장과 상속 의미는 유지한다.

## 검증과 운영

`qa/timetable-owned-runtime.mjs`는 합성 사용자와 loopback PostgreSQL 55444/API 13233/Web 13232를
소유한다. 실제 migration으로 전체 앱을 기동하고 시간표 PostgreSQL·PROD security·기존 중복
방지/인증 테스트를 실행한다. Web은 별도로 만든 실제 Next production build다.
`stop` 입력으로 소유한 프로세스·DB 디렉터리·포트만 정리한다. shared DEV/PROD를 이 runner에 넣지 않는다.

핵심 명령:

```powershell
cd frontend
npx eslint app/calendar/timetable app/calendar/CategoryColorPicker.tsx lib/api/timetables.ts lib/globalTabs.ts app/calendar/page.tsx
npx next typegen
npx tsc --noEmit
npx tsx --test app/calendar/timetable/model.test.ts lib/globalTabs.test.ts
npm run build
cd ..
node qa/timetable-owned-runtime.mjs
```

기존 NOTE editor 및 Calendar lane/color 테스트도 함께 확인한다. 브라우저는 소유자 정책의
TEAM KAFKA 공식 Playwright MCP를 사용한다. 브라우저에서 본 행위와 API/단위 테스트 결과를 구분한다.

배포는 API의 additive migration 성공과 health 확인 후 Web 순서다. 운영 후보는 PROD 현재 기준에
이번 변경만 적용한다. V94 이후 Web rollback은 이전 Web과 그룹 인식 API 조합을 사용한다.
이전 Web의 개별 저장도 새 API가 분리하므로 호환된다. 구 API는 그룹 분리를 모르므로 운영 중인
그룹에 쓰기가 가능한 상태에서 구 API로 단순 복귀하지 말고 호환 API의 forward fix를 우선한다.
V91/V94와 사용자 콘텐츠는 유지한다. down migration, 기존 기록 삭제, DB 복사는 하지 않는다.
실제 배포 커밋·상태·제한·Drive 인계는 `docs/calendar-timetable-v1/HANDOFF_20261024.md`에 기록한다.
