# 공유작업대 운영 감시 확인 — 2026-11-10

제품 소스는 `7abf420bf720de51542813133329e40421820df2`다. 이 문서는 운영 상태·사용량·알림 설정을 읽기 전용으로 확인한 증거다. 검토자는 Railway 설정을 변경하거나 알림을 발송하지 않았다. 계정·프로젝트의 기존 알림 기본값을 보존했다.

**자동 알림 전달 게이트: BLOCKED.** 제품 기능의 사용 가능 여부와 자동 감시·알림의 완결 여부를 구분한다. 정상 상태 조회와 백업 상태 명령의 성공만으로 알림 수신이 검증되지는 않는다. 운영 전환 필수 게이트를 면제하지 않는다.

## 직접 조회한 사실

아래는 2026-11-10 00:34–00:38 KST 무렵의 상태다. 이후 배포·정리 완료 여부는 최종 릴리스 보고서에 별도로 반영한다.

| 항목 | 관찰 결과 | 해석의 한계 |
|---|---|---|
| PROD 환경 상태 | 6개 서비스, unresolved warning 0, critical 0, recent failure 0 | 조회 시점의 상태이며 미래 장애 통보 증거가 아니다 |
| API·Web | 각각 online, replica 1/1 | 실제 사용자 흐름 검증은 별도 증거를 따른다 |
| 백업 서비스 | 실행 중인 native cron 관찰 | 해당 시점의 성공·다음 정시 실행을 뜻하지 않는다 |
| API 최근 1시간 HTTP | 456 requests, 5xx 0, 4xx 11 | 의도된 QA 거절과 실제 오류의 개별 원인은 이 집계로 확정하지 않는다 |
| 프로젝트 webhook | 0개 | 외부 수신 경로가 구성됐다고 주장할 수 없다 |
| PROD observability dashboard / widget / monitor | 각각 0개 | 이 조회 이후 새 설정은 포함하지 않는다 |
| 프로젝트 notification rule | 0개 | 계정의 기본 알림·이메일 수신까지 없다는 의미는 아니다 |
| 조회 가능한 workspace notification rule | 0개 | 사용자별 알림 기본값과 실제 전달은 검증하지 못했다 |
| workspace 사용량 제한 | `usageLimit: null` | 전역 예산·hard limit을 새로 설정하지 않았다 |
| workspace plan | PRO / TEAM | 공식 문서상 monitor 이용 요건에 해당하나 설정·수신 성공을 보장하지 않는다 |

공식 Railway CLI의 정상 인증과 연결된 Railway 도구를 사용했다. 사용량 조회의 금액·고객 식별자, 알림 주소·URL·header 값, 인증 정보는 이 문서에서 제외했다.

`notificationDeliveries`를 현재 프로젝트·`INAPP`·최대 30건으로 좁혀 조회했으나 **Not Authorized** 응답을 받았다. 따라서 owner의 in-app 수신함이나 전달 성공은 확인하지 못했다. 다른 토큰·계정·우회 endpoint로 재시도하지 않았다. 계정 이메일 수신 성공도 시험하지 않았다.

후속으로 같은 정상 CLI의 metadata만 한정 확인했다. 이 query의 공식 schema 설명은 “Gets notification deliveries for the authenticated user”다. 관리자 전용 전달 로그와 별도로 허용된 owner bell이 누락됐다고 볼 근거는 없다. notification query 검색 결과는 해당 목록·ID별 단건·rule의 세 개뿐이며, User의 28개 필드에도 별도 알림·preference·bell 필드가 없다. 공개 frontend의 bell도 같은 `notificationDeliveries`를 사용한다. 권한 거절된 자원을 재조회하지 않고 확인을 종료했다.

## 용량·전송량·정리 상태

기존 `/api/shared-desk/usage`는 인증된 owner의 보관 바이트·1 GiB quota·100 MiB 파일 상한·다운로드 바이트 추정·정리 실패 수·7일 휴지통을 제공한다. 업로드 예약과 보관량을 합산하는 서버 제한, owner별 최대 3개 동시 업로드가 있다.

`downloadBytesEstimate`는 발급한 다운로드 ticket의 누적 바이트 추정이다. 실제 수신량, 월별 egress 또는 청구 금액과 같지 않다. 10 GiB 추정 경고 필드가 있지만, 현재 화면에서 자동 표시·전달되는 비용 경고를 검증한 것은 아니다.

최근 1시간 API·백업의 CPU, 메모리, `NETWORK_TX_GB` 지표는 조회 가능했다. sample의 current/average/max를 월별 청구 합계나 24시간 합계로 바꾸어 해석하지 않는다. monitor input에서 24시간 집계 설정을 확인하지 못했으므로 “5 GB/24h 자동 경고 구성 완료”라고 주장하지 않는다.

정리 작업은 기본 1시간 주기다. 실패를 저장하고 1시간 뒤 재시도하며 usage에 실패 개수가 노출된다. 이 코드 확인은 운영의 7일 만료 실시간 경과나 실제 객체 제거 시험을 대체하지 않는다. 최종 실제 정리 결과는 별도 운영 증거를 따른다.

## 백업 freshness 감시와 남은 검증

기존 runner의 `status`는 HMAC 인증된 완료 기록을 확인한다. 완료 백업이 없거나, 마지막 완료가 26시간보다 오래됐거나, 최신 상태가 SUCCESS가 아니면 실패 종료한다. 이 명령 자체는 독립적인 주기 실행이나 알림 전달을 제공하지 않는다.

Root가 후속 작업으로 보고한 별도 PROD 감시 서비스는 다음과 같다. 이 항목은 검토자의 직접 live 조회가 아니라 배포 담당자의 관찰을 인계받은 기록이다.

| 항목 | 배포 담당자 보고 |
|---|---|
| 서비스 | `f7c00bfc-dc0d-45a3-a63d-ec69bb0be864` |
| 이미지·명령 | 동일한 검증 소스 7ab 이미지, `/app/entrypoint.sh status` |
| UTC cron | `15 0-17,19-23 * * *` — 매시 15분, 18 UTC 백업 시간대 제외 |
| 한도 | 300초, 0.25 CPU, 0.5 GB |
| build | `bc801a4a` SUCCESS 보고 |
| 정상 수동 실행·안전한 실패 probe·복구 | 이 문서 시점 PENDING |

감시 서비스의 정상·실패 종료를 관찰해도 실제 알림 수신까지 확인한 것은 아니다. root는 승인된 알림 수신 경로를 사용자에게 요청했다. 수신 경로와 권한이 해결된 뒤 실패 조건 → 알림 생성 → 승인된 수신처 도착 → 정상 복구를 검증해야 한다. 그전까지 **EXTERNAL_ALERT_GATE_BLOCKED**로 기록한다. 외부 이메일·Slack·webhook 전달, owner INAPP 전달, 향후 정시 trigger, 외부 키 escrow, PITR을 완료로 표시하지 않는다.

## API 기능 확인의 한계

현재 정상 public GraphQL schema에 `NotificationDeliveryType.INAPP`는 존재한다. `notificationRuleCreate`의 입력은 workspace/project·eventTypes·severity·channelConfigs이며 service/environment 입력 필터는 없다. service 단위만 대상으로 하는 rule을 추정해 생성하지 않았다.

Railway가 공개 배포하는 현재 frontend JavaScript에서 `user` channel은 `{type:"user",userId:...}`이며 EMAIL/INAPP 선택은 별도의 사용자 필터임을 확인했다. 사용자 channel만 추가하면 in-app 전용 전달을 보장할 수 없다. 정상 CLI schema에는 frontend의 monitor 생성·사용자 전달 필터 입력이 노출되지 않았고, receipt 조회 권한도 거절됐다. 이 차이를 우회하거나 추정 payload를 적용하지 않고 조사를 종료했다.

공식 참고: [Observability](https://docs.railway.com/observability), [Production readiness checklist](https://docs.railway.com/overview/production-readiness-checklist), [Project webhooks](https://docs.railway.com/observability/webhooks), [Cost control](https://docs.railway.com/pricing/cost-control). 공식 문서의 제공 기능은 이 프로젝트에서 실제 설정·수신됐다는 증거가 아니다.
