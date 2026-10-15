# Sleep Web V2 / LIFE OS 통합 캘린더 최종 검증·배포 보고서

2026-10-15 KST. **웹 수정·DEV 수락·PROD 배포 및 인증 smoke 완료. Android 실기기 양방향 동기화는 사용자 결정에 따라 NOT VERIFIED로 남긴다.**

기존 Sleep V2는 후속 POS 배포로 이미 PROD에 포함돼 있었다. 이번 작업은 기존 구현을 이어받아 실제 수락 검증을 수행하고 확인된 UI 결함 두 개와 오래된 테스트 기대값을 수정한 후 배포했다. 10월 13일 CLOSEOUT의 미배포 상태는 역사 기록이다.

## 구현 경로와 원본 소유권

| 경로 | 구현·검증 범위 |
|---|---|
| /life/sleep | 주간 기본 편집, 일별·주간·월간, 수면·낮잠·추천·원본 상세 |
| /life/sleep/records | 기존 주소 호환 구현 유지 |
| /life/sleep/statistics | 실제 기록 평균·낮잠 평균, 기존 7/30일 지표 |
| /life/sleep/settings | 기존 공유 알림·Android 기기 할당 계약 |
| /life/calendar | 세 Sleep 하위 메뉴와 분리된 LIFE OS 통합 조회·원본 편집 |

Sleep/Nap은 /api/sleep/v1/intervals·actions·naps/actions, Exercise는 /api/exercise/v1/state·mutations를 사용한다. 편집은 원래 ID·revision·operationId와 원본 도메인의 권한·충돌 처리를 따른다. Calendar SYS는 실제 /api/calendar의 persisted 계획·실행·상태를 조회하며 통합 화면에서는 읽기 전용이다. 캘린더용 수면·낮잠·운동 사본이나 별도 authoritative store를 만들지 않았다. 자정 경계 수면은 원본 한 건을 유지하면서 화면에서 날짜별 구간만 표시한다.

## 이번 변경과 Git

- 운동 카드: 96px 카드 내부 scrollHeight109/clientHeight94 잘림을 확인했다. 반복 안내를 공통 범례에 남기고 내부 글줄·간격을 조정했다. 30/45/60/75분 원본 시각과 별도 실제 점유선을 유지한다.
- 가로 스크롤 시간축: 공유 시간축과 KST 모서리를 sticky로 고정했다.
- GlobalTabs: 실제 LIFE OS 명칭을 확인한 뒤 오래된 LIFE CODE 테스트 기대값을 수정했다.

PROD 변경 파일은 frontend/components/life-calendar/TimeCalendar.tsx, frontend/components/life-calendar/calendar.css, frontend/components/GlobalTabs.test.tsx 세 개다. 기존 운영 Money0180a6b 대비 4줄 추가·3줄 삭제다. 추가 변경은 QA runner와 이 보고서·증거뿐이다.

수정 커밋 7b1b355·0fa0e62, 격리 릴리스에 대응하는 a06cf31·9a16bc0, 기존 Money 변경을 보존한 최종 PROD 커밋 **116b355305b199450d9e28002fa4a5e31bc225a8**. 증거 커밋 fb7d57f·e0111af·8b274a7과 마지막 closeout 커밋은 Git 이력에 보관한다.

## 검증 결과

| 검사 | 결과·증거 경계 |
|---|---|
| 프론트 회귀 | PASS41/41, fail·skip0. 릴리스116b355에서도 재확인 |
| TypeScript / scoped ESLint / Next production build | PASS. 초기 Next 생성 타입 경합·잘못된 test CWD는 수정된 실행으로 통과 |
| 현재 인증·owner 보안 | PASS18/18. JWT decoder·검증 subject·identity mirror·Sleep/Nap 보안. mock/local JWKS이며 실제 위조 JWT 공격 수락 검사로 과장하지 않음 |
| Android JVM | PASS54/54: Outbox18, Recorder7, Reminder4, SleepV2 13, SyncRecovery12. Android 소스 fc3e4a04, 변경 없음 |
| 기존 백엔드 회귀 | 원래96·추가 Exercise2·통합29건의 기존 증거 재사용. 이번 서버 계약 변경 없음 |
| 최종 hosted DEV 화면 | PASS50/50. 네 viewport1600/1366/1024/390, light/dark, 모드1/7/42, 시간축·넘침·포커스·실제 원본 카드·SYS 필터 검사. runner 자체 쓰기0 |
| 운동 실제 pointer | 이동64px=60분, 양끝16px=15분. 초·원래 date·elapsedSeconds·memo·exercises·ID 보존 |
| 운동 실제 충돌 | 선행 원본 수정 뒤 stale 저장409 REVISION_CONFLICT, 초안 보존, 최신 revision 비교·재적용 후 revision5 |
| 자정 수면 실제 pointer | 이동26px=60분, 시작 -13px=-30분, 종료 +13px=+30분. 원본ID1개·42/12초·offset540 유지. 최종 revision7, wakeAt만 변경 |
| 수면 취소·Undo | 취소 후 원본revision7 불변. Undo API200으로 revision4→5, 이전 정확한 양끝 시각 복구 |
| 낮잠·오프라인 복구 | 생성·수정 revision1→2→3. 자기 DEV 페이지 네트워크 실패2회 뒤 reload 초안 복원, 재시도 본문·operationId 완전 동일 |
| 평균·설정 | 실제 완료1건 평균554.5분을 9시간15분으로 표시, 낮잠50분. 설정의 Android 소유 안내 확인, 설정 UI 쓰기 없음 |
| Calendar SYS | 기존 persisted 계획4·실행148·상태10 조회. QA 계획도 원래 planned-blocks API에 저장. 카드30px·실제90분 점유96px, 수정 핸들·저장 명령0 |
| 최종 PROD smoke | PASS. 네 화면 인증·원본 API26개 GET200, 동일 Sleep/Exercise owner, 운동96px·잘림 없음,390px 시간축 고정. 페이지 오류0·운영 데이터 쓰기0 |
| Flip6 실기기 | NOT VERIFIED. 운영 앱0.3.1만 존재. 사용자가 DEV 앱 없음·미검증 유지를 명시. 앱 실행·재설치·데이터 초기화·대기열 재전송 없음 |

최종 스크립트는 qa/sleep-life-calendar-browser.mjs다. 최초 실행은 앞 화면의390px viewport가 다음 화면에 남아 desktop 전용 로그아웃 role 검사가 실패했다. 화면마다1600px으로 초기화한 후 50개 모두 통과했다. 제품 인증 결함으로 처리하지 않았다. 수면 종료 핸들은 하단 경계 중앙좌표가 카드 바깥을 찍는 초기 입력 실패가 있었고, 실제 elementFromPoint로 핸들 내부 좌표를 확인한 뒤 pointer·저장200·원본 재조회까지 통과했다.

기존 TEAM KAFKA Default, 공식 Playwright MCP0.0.83/확장0.4.0, loopback relay ::1:8188을 사용했다. 개인 Chrome·무관한 사용자 탭·그룹은 제어하지 않았다. 공식 provider의 소유 탭 예외만 적용했다. legacy Codex Phase2 validator는 공식 provider의 미노출 instance/browser ID로 인해 SUPPORTED_CONNECTION_REQUIRED로 종료했으며 PASS로 바꾸지 않았다. 실제 bootstrap·프로필·owned DOM/API/input/capture 결과를 별도 보관했다. tracing은 NOT VERIFIED다. 간헐적인 actionability/transport timeout은 환경 실패 이력으로 남겼으며 도구 왕복 시간을 화면 성능 수치로 보고하지 않는다.

## 실제 배포 상태

| 환경/서비스 | 최종 배포 SHA | Railway 배포 ID·상태 |
|---|---|---|
| DEV Web workflow-web-development | 8b274a7 | 66cd7827-fb62-4244-b50b-276e6e46916e / SUCCESS |
| DEV API workflow-api-development | 0180a6b | f89fb901-52c0-4a7b-ba89-06d2afae322d / SUCCESS |
| PROD Web personal-work-os-frontend-prod | 116b355 | 7b3390f6-852a-46ae-8073-bae956dd1fa8 / SUCCESS |
| PROD API personal-work-os-prod | 0180a6b | d641da62-6ea4-43d7-9342-b3bdde974076 / SUCCESS |

DEV Web 설정의 commitSha는116b355인데 배포 metadata는8b274a7이다. Git에서 **전체 frontend tree가 동일**함을 확인했고 실제 배포본에서50개 수락 검사를 수행했다. 이를 동일 SHA 배포라고 표현하지 않는다. PROD는 설정·영수증 모두116b355다. API/Auth/DB의 배포 설정은 이번에 바꾸지 않았다.

DEV/PROD Apply는 각각 자동 승인 검토에서 사용자 승인 없음으로 거절됐다. 우회하지 않고 사용자의 해당 환경·후보에 대한 명시적 답변을 받았다. 재확인 시 대기 변경이 이미 적용되어 추가 Apply는 nothing_staged였고, 실제 영수증과 기능 smoke로 완료를 확인했다.

Money 공용 QA 잠금 인계를 기다린 후 sleep-life-acceptance-20261015/PID91720 lease를 원자적으로 획득해 최종 검증·승격을 직렬화했다. 앞선 DEV 업로드는 잠금을 늦게 확인해 Money 검증과 겹쳤으며 그 이력을 보존했다. 이후 후보를 덮어쓰지 않고 최신 운영 Money0180a6b를 포함했다. 최종 smoke 후 소유 lease를 정상 해제했고 사용자가 허가한 조율 채팅에 결과를 전달했다.

## 데이터와 정리

실제 DB는 DEV pos_dev_final / PROD pos_prod_final, 양쪽 Flyway V83이다. 현재 아홉 원본 테이블 계약과 migration catalog를 READ ONLY로 확인했다. 신규 migration/table/backfill·파괴적 SQL·운영 원본 데이터 수정은 없다.

DEV 검증용 수면1·낮잠1·운동8·Calendar 계획1건은 등록된 정확한 ID만 원본 DELETE_SESSION/DELETE_NAP/TRASH/PURGE/planned-blocks DELETE로 정리했다. 최종 수면·낮잠404, 운동8건purged·활성fixture0, Calendar 계획없음을 재조회했다. 원래 도메인 정책의 audit·receipt·tombstone은 남는다.

첫 QA 수면 생성 때 기존 ensureSettings가 이전에 없던 DEV 추적 설정을 revision1·recordingStartDate2026-10-15로 초기화한 메타데이터가 남는다(updatedAt00:26:46.297689Z). 안전한 reset API가 없어 SQL로 삭제·복원하지 않았다. 사용자 기존 설정을 덮어쓴 것으로 주장하지 않으며, 모든 QA 흔적이 완전 제거됐다고도 주장하지 않는다. PROD 설정과 휴대폰 데이터는 수정하지 않았다.

## 남은 한계·설계 차이

확인된 웹 결함의 미해결 항목은 없다. 실기기 양방향 동기화와 tracing은 미검증이다. 원래7/30일 지표·Undo8초·삭제 Undo 부재·시각 미지정/진행 운동의 원래 계약을 유지했다. 승인 V4의 정보 계층·블록 크기·실제 시간 점유·독립 경로를 확인했지만 기존 POS shell·실제 지표에 따른 간격 차이가 있어 픽셀 일치라고 주장하지 않는다.

기계 증거: evidence/resume-20261015/acceptance.json, final-browser.json, prod-smoke.json, cleanup.json, deployments.json, auth-security.json, android-unit.json, current-schema.json, browser-preflight.json, screenshots.json, final-screenshots.json. 최종 workout-density 캡처는 로딩 종료 후 밀집 카드 실제 표시를 확인했다. viewport 캡처 일부는 모드 전환의 재조회 표시를 포함하므로 정적인 픽셀 비교의 단독 증거로 쓰지 않는다.
