# Sleep Web V1 계약 및 데이터 보호

LIFE OS는 표시명이다. `life`, `LIFE`, 내부 `LIFE CODE`, 기존 탭 ID/pin/order/storage version, `/life/categories`와 API identity는 유지한다. 기본 탭 제목의 정확한 기존 값만 LIFE OS로 복원하며 사용자 지정 제목은 보존한다.

Web 경로: `/life/sleep`, `/life/sleep/records`, `/life/sleep/statistics`, `/life/sleep/settings`. 탭에는 검증된 date/view/kind/period만 보관한다. 편집 내용과 인증 토큰은 shell preferences에 넣지 않는다.

주수면은 기존 `/api/sleep/v1/actions`를 사용한다. 사후 생성/수정은 `CORRECT_SESSION`, 삭제는 `DELETE_SESSION`, 수정 Undo는 `UNDO_EVENT`. `entryPoint=HISTORY_EDIT`, 변경한 endpoint만 전송한다. 수정하지 않은 certainty/source/timezone/offset/초 단위 facts는 보존한다. 조회는 today/sessions/detail/events/metrics/reminder-settings 원본 계약을 사용한다.

새 API:

| 경로 | 의미 |
|---|---|
| GET `/api/sleep/v1/naps` | from/to inclusive 시작 현지 날짜, cursor `date\|uuid`, limit 1–100; items/nextCursor/contextRevision/deletedNapIds |
| GET `/api/sleep/v1/naps/{id}` | 인증 owner의 canonical 낮잠 |
| GET `/api/sleep/v1/naps/summary` | from/to, 조회 timezone; 별도 count/totalIntervalMinutes/meanIntervalMinutes/days |
| POST `/api/sleep/v1/naps/actions` | CREATE_NAP / UPDATE_NAP / DELETE_NAP; napId/expectedRevision 및 기존 action capture envelope |

낮잠 payload는 startAt/endAt 및 startTimezone/endTimezone/startOffsetMinutes/endOffsetMinutes, confirmLongInterval를 사용한다. CREATE revision=0, UPDATE/DELETE 현재 revision. 양 끝은 필수이고 구간은 양수·5분 미래 허용·18h 이상 명시 확인이다. timezone 사실과 시작 현지 날짜를 저장한다. 확정된 24h 초과 구간도 허용한다.

낮잠 receipt는 resourceType=NAP, napId/nap/newRevision/eventId/deleted/contextRevision/serverCommittedAt이며 주수면 sessionId/session 의미를 바꾸지 않는다. JSON 의미가 같은 원본 요청의 재전송은 같은 receipt를 반환한다. 본문을 바꾼 같은 operationId는 409이다.

주수면과 낮잠은 같은 인증 owner advisory transaction lock을 사용한다. nap/nap 및 nap/main 겹침은 SESSION_OVERLAP 409와 conflictingResourceType/serverSnapshot/serverRevision/draftAccepted=false를 반환한다. OPEN은 `[bedtime,∞)`, 인접 endpoint는 허용한다. 기존 제외 및 main/main 정책을 보존한다. 자동 병합/삭제/제외/분류는 없다.

V78은 sleep_naps/sleep_nap_events/sleep_nap_tombstones만 추가한다. 기존 facts와 history에는 backfill/수정/삭제가 없다. 새 테이블은 RLS를 활성화하고 브라우저 직접 쓰기 정책을 제공하지 않는다. POS 서비스의 CurrentUserProvider·owner predicate·트랜잭션을 사용한다. 별도 인증 또는 서비스 토큰 우회는 없다.

삭제는 facts 및 cascade events를 제거하고 receipt facts를 hash와 최소 identity/revision으로 줄인다. tombstone에는 endpoint 사실을 넣지 않는다. 삭제한 ID는 새 operation으로 재생성할 수 없다. 정확한 과거 replay는 redacted deleted receipt를 반환한다.

낮잠은 main recordingStartDate/cycles/pending/settings/reminderDeviceId를 초기화하거나 변경하지 않는다. 기존 main metrics/coverage/OPS/ORBIT 계산에 합산하지 않는다. 공용 context revision은 UI 재조회 신호로 갱신한다.

Web 초안과 미확인 요청은 `sleep.web.v1:<owner>`에 최소 JSON으로 저장한다. 토큰은 저장하지 않는다. 서버 전송 직전 현재 정상 Supabase session owner와 초안 owner를 비교한다. 로그인이 만료되면 같은 계정의 입력을 보존하며, 다른 owner는 읽거나 전송하지 않는다. 실패/409/422에도 초안을 보존한다. 응답 불명은 정확한 operationId/body만 명시 재시도한다. 확정 충돌 후 재적용은 canonical revision과 새 operationId를 사용한다.

미확인 요청이 있으면 먼저 결과를 재확인해야 입력 폐기·명시 로그아웃할 수 있다. 일반 미저장 입력은 확인 후 삭제하고 로그아웃한다. 저장 성공 및 확정 삭제 뒤 요청/선택 snapshot/수정 이력을 브라우저 보관소에서 제거한다. 자동 background outbox는 없다.

상세와 목록은 canonical 재조회하며 세대 번호로 늦은 응답을 차단한다. 모든 cursor 페이지를 가져온다. 브라우저에서 누락 간격은 null로 표시한다. DST gap은 거절하고 fold는 UTC offset 선택을 요구한다. 상호 다른 endpoint timezone은 개별 사실로 보존한다.

Android 기존 409 경로는 operation/localDocument를 CONFLICT로 보존한다. 다른 리소스의 snapshot ID가 main ID와 다르면 원래 main 상세를 다시 조회한 뒤 비교하므로 nap snapshot을 main 캐시로 덮어쓰지 않는다. Android API envelope나 UI는 변경하지 않는다. 실기기 검증은 이 계약 검증과 별개이며 계속 보류한다.
