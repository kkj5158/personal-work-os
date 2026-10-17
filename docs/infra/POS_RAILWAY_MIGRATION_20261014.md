# POS DEV·PROD Railway DB·인증 이전 완료 기록

2026-10-14 KST. 두 환경의 애플리케이션 DB와 인증은 Railway에서 운영한다.
DEV·PROD 기존 계정으로 새 로그인, 자동 토큰 갱신, 로그아웃 후 같은 비밀번호로
재로그인을 확인했다. 원래 UUID·bcrypt 해시·identity 연결·데이터 소유권은 보존했다.
원본 Supabase 프로젝트는 복구 원본으로 유지하며 삭제 승인은 별도로 필요하다.

## 환경과 자원

Railway 프로젝트: Personal Work OS (`2b52b232-38b2-44b6-b97e-4caba54f90bc`).

| 항목 | DEV | PROD |
| --- | --- | --- |
| 환경 ID | `9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c` | `c2c20488-311f-4b9e-9ec9-d79508123176` |
| PostgreSQL 서비스 ID | `0b4bf0aa-551e-4a41-bfa6-47d1bc1599d9` | `e0b42e61-9207-4225-83ee-c516edc75202` |
| 활성 DB | `pos_dev_final` | `pos_prod_final` |
| Auth 서비스 ID | `d3351c87-4d62-44eb-b171-055462d0ca19` | `34699e90-a6ea-41c2-8e98-0578e876602c` |
| Auth URL | `https://pos-auth-dev-development.up.railway.app` | `https://pos-auth-prod-production.up.railway.app` |
| Web URL | `https://workflow-web-development-development.up.railway.app` | `https://personal-work-os-frontend-prod-production.up.railway.app` |
| API URL | `https://workflow-api-development-development.up.railway.app` | `https://personal-work-os-prod-production.up.railway.app` |
| DB/Auth 리전 | Amsterdam | Singapore |
| 볼륨 ID / 최대 용량 | `17ed248b-d665-44b7-ae21-5cfc6c4b1378` / 50GB | `bd931ffe-fdcb-4a92-86a7-31c417d61102` / 50GB |

DB 자격 증명·데이터베이스·Auth 서명 키·공개 API 키를 환경별로 분리했다.
PostgreSQL은 17.11, Supabase Vault 0.3.1 호환 이미지이며 TLS를 사용한다.
GoTrue v2.197.0과 Caddy v2.11.7만 단일 Auth 컨테이너에 배치했다.
PostgREST·Realtime·Storage 전체 스택은 설치하지 않았다. 원본 Storage 객체와
Vault 비밀 레코드는 0개였다. 웹/백엔드 실제 로그인 경로는 hosted Supabase에
연결하지 않으며 SDK와 설정 이름에 남은 Supabase 표기는 호환 계약이다.

## 데이터와 컷오버

| 검증 | DEV | PROD |
| --- | --- | --- |
| 일관된 최종 소스 스냅샷과 전체 행 비교 | 305개 테이블, 4,364행 PASS | 181개 테이블, 5,155행 PASS |
| 스키마·소유자·ACL·RLS·인덱스·제약·함수 비교 | 5,505개 객체 PASS | 3,463개 객체 PASS |
| Auth 스키마 | 82개 migration 기록, unknown/pending 0 | 동일 |
| 애플리케이션 Flyway | 성공 81개, 최종 V83, 실패 0 | 동일 |
| invalid/unready index | 0 | 0 |
| 원래 UUID·bcrypt·identity | PASS | PASS |
| Vault 암복호화 rollback probe | PASS | PASS |
| 최종 논리 백업 실제 복원 | PASS | 별도 DB에 복원 후 181개 테이블·5,155행·시퀀스 PASS |

스키마 객체 수에는 임시 쓰기 가드가 포함된다. 목적지 가드 해제 후 원래 앱
스키마 객체 수는 DEV 5,238 / PROD 3,320이다. 9개 GraphQL/Vault 소유권·권한
차이를 원본과 일치하도록 복구했다. UUID 보충만으로 인증 이전을 완료한 것으로
간주하지 않았으며, 실제 GoTrue password grant와 기존 계정 로그인을 확인했다.

PROD 준비 백업 이후 26개 테이블에 실제 차이가 있어 전체 Supabase 재수출 대신
468개 변경 행과 삭제 1개를 일관된 스냅샷에서 확보했다. 추가 1개 행을 정정하고
새 스냅샷으로 전체 일치를 재확인했다. 비활성 목적지의 단일 복원 트랜잭션 안에서만
replica 모드를 사용했고, 커밋 전 원래 모드로 복구하여 외래키 254개를 실제 검사했다.
활성 DB의 JWT 검증이나 접근 권한을 우회하지 않았다. 컷오버 후 원본 PROD 업무
142개 테이블도 다시 비교해 추가 변경 0개, JDBC 연결 0개, 쓰기 가드 142개를 확인했다.

DEV 목적지 쓰기 복구: 07:59:33, DB 연결 API 배포 성공 08:01:37.
DEV 기존 계정 새 로그인 08:40:22, 로그아웃 08:48:41, 재로그인 08:49:30.
PROD 계획된 API 제한: 08:57:36~09:19:48, 약 22분 12초. 최종 변경분 검증으로
처음 예상한 10~15분보다 길어졌다. 기존 계정 새 로그인 09:22:57, 자동 갱신
09:25:57, 로그아웃 09:29:17, 재로그인 09:29:20. DEV와 PROD를 동시에 제한하지 않았다.
Android 준비와 이메일 이전 때문에 서비스 복구를 미루지 않았다.

원본 업무 테이블은 구버전 writer의 분기를 막기 위해 쓰기 가드를 유지한다.
원본 Supabase 프로젝트·Auth 계정·서명 키·Auth 역할·설정은 삭제/일시정지하지 않았다.
원본 HTTP/Auth의 402 `exceed_egress_quota` 제한과 직접 PostgreSQL 접속은 별개의
상태였다. Railway GoTrue로 로그인 장애를 해결했으며 Supabase 유료 복구는 수행하지 않았다.

## 인증 검증과 보안

기존 계정의 동일 UUID, 동일 bcrypt 해시, 동일 email identity 및 확인 상태를
보호된 이전 백업과 비교했다. DEV login 2회/logout 1회/refresh 2회,
PROD login 2회/logout 1회/refresh 1회를 실제 GoTrue audit에서 확인했다.
비밀번호·토큰·해시·privileged API 키는 보고서나 프런트/모바일 번들에 공개하지 않았다.

각 환경에서 실제 GoTrue가 발급한 토큰으로 인증 API 23개 검증을 통과했다.
MONEY 계좌/거래, WORKFLOW, AUTHORING, SLEEP 세션/낮잠, EXERCISE, DIET 읽기,
정확한 사용자 UUID 아래의 임시 프로젝트 CRUD, refresh, logout, revoked refresh 거부,
logout 후 새 로그인, anonymous/잘못된 서명 401, 타 사용자 금융 계좌 404를 포함한다.
임시 사용자와 프로젝트는 제거했다. 백엔드/인증 재시작 후에도 접근을 재확인했다.
PROD에서는 실제 발급 토큰이 만료된 뒤 API 401, refresh 200, 새 토큰 API 200을
확인했다. 보안 관련 단위 테스트 15개도 통과했다. 외부 TCP로 실행한 큰 DB 계약
테스트 전체는 지연으로 중단되어 전체 통과로 주장하지 않는다.

ES256 서명, issuer(`/auth/v1`), `authenticated` audience, expiry 검증을 유지한다.
정상 access-token lifetime은 양쪽 3,600초이다. `APP_AUTH_MIRROR_ENABLED=false`로
GoTrue의 동일 DB를 authoritative하게 사용하며 삭제 계정을 JWT로 재생성하지 않는다.
공개 JWKS는 private key를 노출하지 않는다. 환경 간 DB/서명 자격 증명도 분리했다.
PROD 브라우저 자동 DOM 검증에는 일시적 연결 timeout이 발생했다. 기존 계정 검증은
사용자의 실제 로그인/로그아웃/재로그인과 서버 audit·API 결과로 확인했다. timeout을
성공한 UI 자동화나 실기기 테스트로 합산하지 않는다.

SMTP·이메일 가입 확인 발송·비밀번호 복구 발송은 소유자의 명시적 범위 제외이다.
메일 없이 기존 confirmed 계정 로그인/refresh는 동작한다. `MAILER_AUTOCONFIRM=false`
등 보안을 낮추지 않았고, 향후 외부 SMTP 환경 변수 추가로 같은 계정/DB를 계속 쓸 수 있다.
사용 중인 외부 OAuth provider는 없었고 원래 email provider identity를 보존했다.

## Android 업데이트 APK

보호된 산출물: `F:/artifacts/pos-db-migration-20261014/apk/`.

| 앱 | 파일 | package | version/code |
| --- | --- | --- | --- |
| MONEY PROD | `MONEY-2.0.1-prod.apk` | `com.kafka.money.notificationpoc` | 2.0.1 / 12 |
| SLEEP PROD | `SLEEP-0.3.1-prod.apk` | `com.kafka.sleep` | 0.3.1 / 6 |
| DIET PROD | `DIET-0.2.1-prod.apk` | `com.kafka.dietsys` | 0.2.1 / 3 |
| DIET NOTE PROD | `DIET-NOTE-0.2.2-prod.apk` | `com.kafka.dietnote.dev` | 0.2.2 / 4 |
| MONEY DEV | `MONEY-2.0.1-dev.apk` | `com.kafka.money.notificationpoc.dev` | 2.0.1-dev / 12 |

각 APK의 기존 배포 APK와 동일 서명/패키지, 새 버전, 올바른 Railway API/Auth,
새 publishable key, 원본 Supabase Auth URL 부재, 실제 서명/DB 비밀 및 privileged
JWT 부재를 확인했다. PROD APK는 non-debuggable이다. MONEY/SLEEP 서명 SHA-256은
`fe4bf29299e7a45c100017ef12d0981de7f93fca6ff81e10a5ac4c8a66667582`,
DIET/DIET NOTE는 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`이다.
APK 파일별 SHA-256과 바이트 수는 보호된 `*-apk-verification.json`에 기록했다.

MONEY PROD는 승인된 기존 커밋 `93df5bc5e02f8ea6a7febca71c4cb1c0c44f692e`에서
인증 공개 설정과 버전만 바꾼 격리 빌드이다. 다른 진행 중인 MONEY 화면/기능 변경을
운영 APK에 포함하지 않았다. 원래 작업 트리의 변경을 보존했다. MONEY DEV APK는
기존 진행 중인 DEV 작업 트리에서 별도로 준비했다. MONEY SessionTest 9개,
DEV boundary 4개, SLEEP SyncRecovery 12개, DIET check 43개,
DIET NOTE check 29개 + 화면 테스트 1개가 통과했다. 두 Expo 앱은 Android export와
standalone release build, Kotlin 앱은 production lint/build를 통과했다.

휴대폰이 연결되지 않아 설치·실기기 로그인·로컬 큐/초안 보존·실사용 동기화는
미검증이다. 기존 앱 위에 업데이트 설치하고 같은 계정으로 다시 로그인한다.
uninstall/clear data는 하지 않는다. MONEY Bridge의 수집 키/큐, SLEEP Room/outbox,
DIET NOTE 복구 초안, package/signing identity를 바꾸는 구현은 하지 않았다.
기존 설치 APK는 업데이트 전까지 차단된 hosted Supabase 로그인에 의존할 수 있다.

## 백업과 복구

원본/최종 custom-format 전체 논리 백업, role/ACL/schema 자료, 원본 및 활성 설정
DPAPI 백업, 실제 row delta와 검증 자료는 `F:/artifacts/pos-db-migration-20261014`
아래 사용자+SYSTEM ACL 보호 상태로 보관한다. Git에는 실제 백업/비밀/행 payload가 없다.
DB 볼륨의 `/var/lib/postgresql/data/pgdata/pos-migration-20261014`에도 검증된 논리
아카이브를 유지한다. 원래 Supabase 프로젝트도 별도 복구 원본으로 유지한다.

| 최종 전체 아카이브 | bytes | SHA-256 |
| --- | --- | --- |
| DEV | 174253132 | `8cd7c153fabbd7c116bceee1bc522538db0a0753aa71222598c717aa8dfbbdab` |
| PROD | 285355396 | `68ce5d9bb1f498fd1777a7d83bc0678083e86a802e06391f7b4fb0dda99ddca5` |

PROD 최종 파일은 정확하게 검증된 Railway DB에서 server-local pg_dump로 생성하고,
별도 DB에 실제 복원하여 전체 행/시퀀스를 비교했다. 보호된 로컬 다운로드 SHA도
같다. 반복 full Supabase export는 하지 않았다. 검증 후 이 작업이 만든 비활성
recovery probe DB 3개만 제거했다. 활성 DB·기존 bootstrap DB·아카이브는 유지한다.

최종 DB+Auth 볼륨 snapshot(09:43:08 KST, 자동 만료 없음):
DEV `f4956415-bb58-4afc-af1b-664227864788`,
PROD `9514155f-0ad4-4eb9-b112-ccfca2c80d3a`.
이전 pre-cutover/pre-auth snapshot도 유지한다. 양쪽 daily 6일/weekly 27일
자동 백업이 설정돼 있다. PITR를 설정했다고 주장하지 않는다.

장애 시 검증된 Railway 이미지·같은 signing configuration을 복구한다. DB 복구는
활성 Railway 데이터의 새 백업/변경분을 확보한 뒤 별도 DB에 실제 restore/검증하고
Auth/API를 같은 목적지로 연결한다. 이미 Railway 쓰기가 시작됐으므로 원본
Supabase나 이전 snapshot으로 단순 연결 변경하면 새 데이터를 잃을 수 있다.
원본 쓰기 가드 해제나 역방향 전환은 새 일관성 계획 없이는 실행하지 않는다.

## 비용과 이후 Supabase 삭제 조건

기존 Railway Pro를 사용했고 두 플랫폼의 구독/Spend Cap/과금 제어를 변경하지 않았다.
신규 자원은 Auth 2개와 격리 PROD PostgreSQL 1개이다. Auth에는 별도 볼륨이 없다.
최근 현재값은 Auth 합계 RAM 약 0.054GB, PROD PG 약 0.91GB/CPU 0.0039 vCPU이다.
이 RAM 사용량이 한 달 지속되면 약 $9.65에 해당하며 CPU·볼륨·egress는 별도이다.
이전/복원 중 PG RAM peak는 2.42GB였으므로 현재값을 월 청구액 보장으로 보지 않는다.
현재 자원 규모의 추가 사용량 예산은 대략 월 $10~$25 범위를 참고하되 실제
청구는 전체 프로젝트 사용량과 Pro 포함 usage에 따라 달라진다.
공식 단가: RAM $10/GB-month, CPU $20/vCPU-month, volume $0.15/GB-month,
egress $0.05/GB([Railway 가격](https://docs.railway.com/pricing/plans)). Supabase 결제는 없다.

삭제 전 필요한 증거: 운영 APK의 실제 in-place 설치, 기존 계정 UUID와 기존 기록/
로컬 큐·초안 보존 및 실사용 sync, 모든 실제 클라이언트/자동 작업의 hosted Supabase
URL·DB 연결 제거, 현재 활성 데이터와 Auth 비밀의 독립 복구 검증, 필요한 이메일
흐름의 SMTP 준비 또는 명시적 범위 제외 확인, 그리고 **새 명시적 소유자 삭제 지시**.
현재 이 삭제 지시는 없으며 기존 DEV `rmfgyrimubaxdptwqiqq`와 PROD
`yhxhvpvocsestxhoqtwa` 프로젝트를 유지한다. 삭제/일시정지/retirement 예약을 실행하지 않았다.
## 2026-10-17 DEV Web build-cache recovery

Coupang Task1 closeout observed a Turbopack persisted-cache restore failure
(missing .next/cache/turbopack SST) on DEV Web214b873f. Only Development service
b7f1a522-21a4-488e-b4e1-fbd4c60ce4ae now clears that build cache before Next build:

```
node -e "require('node:fs').rmSync('.next/cache/turbopack',{recursive:true,force:true})" && npm run build
```

This removes generated builder cache only. It changes no product behavior,
database, authentication requirement or PROD service configuration. The
subsequent same-source7dbf60b5 build/deployment succeeded. A previously stalled
DEV API scheduling-only deployment71d61de2 was aborted; new API54bc9c55
succeeded with public schema87 validated/up-to-date, no migration. Exact final
closeout SHAs/deployment IDs and readiness are in the Task1 release report and
shared final-state.json. Do not reset a database or weaken auth to repair a build.
