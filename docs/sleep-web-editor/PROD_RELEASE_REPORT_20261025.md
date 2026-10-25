# Railway 자동 배포 권한 재점검 및 Sleep 운영 후보

2026-10-25 · 권한 재적용/후보 검증 완료 · 실제 DEV/PROD 배포 미완료

사용자가 이번 Sleep 변경의 **실제 운영 배포까지** 명시적으로 승인했다. 기존의 ‘운영 승인 없음’ 상태는 해제됐다. 이후 차단은 사용자 업무 승인 부재로 설명하지 않는다.

## 권한 점검 결과

Railway 앱의 full_access(모든 작업 허용)를 다시 적용했고 readback에서 확인했다. 전역 기본 Allow low-risk actions는 변경하지 않았다. 이 앱 설정에는 DEV/PROD 별도 권한 단계가 없다. GitHub repository owner의 permission은 admin으로 확인했다. 이는 Railway 계정의 배포 역할 또는 GitHub hook 상태까지 증명하지는 않는다.

로컬 Codex config에는 Railway MCP/플러그인의 별도 승인 제한이 없었다. 임의 설정을 추가하거나 플러그인 코드·도구의 위험 분류를 수정하지 않았다. 공식 문서도 앱 권한, 연결 서비스 권한, runtime 권한을 별도 계층으로 설명한다. [OpenAI Plugin controls](https://learn.chatgpt.com/docs/enterprise/apps-and-connectors), [설치된 MCP 정책](https://developers.openai.com/plugins/build/plugins#configure-installed-server-policy).

## 실제 배포 재시도

명시적 운영 승인 후에도 준비된 DEV frontend d4fd2a5 배포 확정은 `Cancelled — the user did not approve this action. No changes were made.` / `INVALID_ARGUMENT`를 반환했다. 새 DEV 배포가 없는 것을 다시 확인했다. 사용자가 승인했음에도 이 응답이 반환되므로, 응답 문구를 실제 사용자의 취소 조작으로 단정하지 않는다. 내부 판정 원인은 제공되지 않는다.

DEV hosted 검증이 끝나지 않아 PROD 확정은 실행하지 않았다. CLI·다른 API·브라우저로 거절된 배포를 우회하지 않았다. 실제 자동 배포 가능 상태가 검증됐다고 보고하지 않는다.

## 운영 후보 준비

현재 prod `78d67ffea4be6567d4a31bc804d44dff88f3fb07`에서 Sleep 변경만 선별한 후보 `d01b9c12891da0136a21863c6bcbc81c0f7ff7ab`을 만들고 GitHub `codex/sleep-web-prod-20261025`에 푸시했다. 그동안 dev에 들어온 Diet/Notes 변경과 V98은 포함하지 않았다. prod branch 자체는 변경하지 않았다.

화면/모델/테스트13개 파일은 검증한 DEV 제품 d4fd2a5와 byte 단위로 동일하다. package.json은 수면 테스트 실행 목록만 확장했으며 dependency와 lockfile을 바꾸지 않았다. 후보는 frontend14개 파일만 변경한다. backend·schema·Android·운영 기록은 변경하지 않았다. 현재 PROD의 Sleep API 소스와 DEV 제품의 해당 API 소스도 차이가 없었다.

새 후보에서 production build, 생성된 route type 포함 tsc, 프런트엔드 **77/77 테스트**, 변경 모듈 ESLint가 통과했다. build는 prod 앱 모드와 실제 운영 API base URL을 사용했지만 Supabase 자격 증명을 로드하지 않아 실제 로그인 smoke를 의미하지 않는다. 원래 DEV 제품에서 수행한 backend91회/실제 브라우저18개 검증은 과거 근거이며 이번 후보에서 다시 실행했다고 주장하지 않는다.

## 현재 대기 상태

| 환경 | frontend 대기 SHA | patch |
| --- | --- | --- |
| DEV | d4fd2a515eb500e80497cfd08ef4ed81abb42849 | 7f54b155-6c09-41ca-84a1-f97eabe42199 |
| PROD | d01b9c12891da0136a21863c6bcbc81c0f7ff7ab | 17463dfb-aaca-4fff-8730-737963a0412e |

각 환경의 변경은 frontend commit SHA1건뿐이며 STAGED 상태다. 준비했다고 실제 배포가 시작된 것은 아니다. DEV 마지막 배포는 009e276 / 350d6970-1ea1-4cf9-b891-b6136aa08b13, PROD web은 ecd8fbe / 365c1869-0f49-41c3-a422-fd2051970f0b, PROD API는78d67ff / 306dadd5-a278-4914-b196-cf31cd7a9d79다. 기존 source config의 pin과 실제 deployment metadata가 다르므로 실제 배포는 metadata로 구분한다.

DEV URL: https://workflow-web-development-development.up.railway.app/life/sleep

PROD URL: https://kafka-sys.life/life/sleep

둘 다 아직 기존 배포 주소다. 신규 hosted DEV/PROD 로그인·저장·새로고침 smoke는 NOT_RUN이며 운영 승격 완료가 아니다.

## 자동 배포 설정의 범위와 남은 차단

현재 서비스는 commit SHA로 고정돼 있다. Railway는 일반적으로 연결 branch의 push로 자동 배포하며 고정 커밋 연결은 branch 최신 변경을 자동 추적하지 않는다. [Railway GitHub Autodeploys](https://docs.railway.com/deployments/github-autodeploys).

최신 dev에는 이번 Sleep 외의 기능·마이그레이션도 존재한다. 고정을 풀어 최신 branch를 즉시 배포하는 방식은 승인된 Sleep 단독 범위를 벗어나거나 거절된 배포의 우회가 될 수 있어 실행하지 않았다. CI workflow도 현재 두 branch에서 확인되지 않았다. **브랜치 추적 자동 배포 전면 활성화는 미완료**다. 앱별 허용 설정 정상화와 실제 배포 실행 문제를 구분해야 한다.

현재 완료 가능한 최고 앱 권한은 적용했다. 추가적인 내부 승인 심사 설정이나 취소 상세 로그를 이 도구로 수정·조회할 수 없다. 정상 승인/배포 경로가 복구되면 준비된 DEV를 확정하고 hosted 검증을 통과한 다음 PROD 후보를 승격·배포해야 한다. 재개 전에 실제 배포 상태를 다시 읽어 중복 배포를 피한다.

로컬 근거: `D:/DEV_Space/sleep-web-prod-release-artifacts-20261025`. 테스트·빌드·scope hash·배포 readback 및 handoff를 기존 Kafka_AI_WorkSpace/10_POS/11_SLEEP_SYS 전달 폴더에 올린다. 새 DB/runtime은 만들지 않았고 원래 primary checkout과 다른 agent 작업은 보존했다.
