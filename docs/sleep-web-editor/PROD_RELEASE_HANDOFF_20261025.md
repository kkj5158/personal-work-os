# Sleep 운영 배포 인계 — 2026-10-25

사용자는 이번 Sleep 운영 배포를 명시적으로 승인했다. 같은 업무 승인을 다시 요구할 필요는 없다. Railway 앱 권한은 DEV/PROD 공통 full_access이며 전역 기본은 그대로다. 이 권한만으로 실제 배포 성공이 확인되지는 않았다.

## 소스

- repository: https://github.com/kkj5158/personal-work-os
- DEV 제품: d4fd2a515eb500e80497cfd08ef4ed81abb42849 (dev에 이미 통합됨)
- PROD 후보: d01b9c12891da0136a21863c6bcbc81c0f7ff7ab
- 후보 branch: codex/sleep-web-prod-20261025
- 후보 base: prod78d67ffea4be6567d4a31bc804d44dff88f3fb07
- frontend14개 변경, 그중 source/test13개는 DEV 검증본과 동일. backend·migration·Android 변경 없음
- 새 후보 build/typecheck/lint 및 테스트77/77 PASS. 과거 API/browser 증거와 새 검증을 구분한다.

## 배포 순서

1. DEV/PROD actual deployments와 pending patch를 읽는다. 이미 배포됐다면 반복 실행하지 않는다.
2. DEV patch7f54b155-6c09-41ca-84a1-f97eabe42199가 frontend d4fd2a5 한 건인지 확인한다. 정상 승인 경로에서 확정 후 실제 SHA/SUCCESS를 확인한다.
3. 새 DEV의 로그인·주간 지표·drag/resize·추가/저장/삭제·새로고침·WORK FLOW를 확인한다. 공유 사용자의 실제 수면 기록을 fixture로 수정하지 않는다.
4. 최신 prod를 다시 확인한다. 바뀌었으면 기존 사용자 변경을 보존해 후보를 갱신하고 관련 검증을 재실행한다. 현재 후보는 prod branch에 아직 합치지 않았다.
5. 필요한 승격 후 PROD patch17463dfb-aaca-4fff-8730-737963a0412e의 frontend d01b9c1 한 건을 정상 경로에서 배포한다. backend/DB/Auth는 이 릴리스 대상이 아니다. 실제 SHA/SUCCESS 및 focused 운영 smoke를 확인한다.

DEV 확정은 사용자의 명시 승인과 full_access 적용 후에도 `Cancelled — the user did not approve this action. No changes were made.` / INVALID_ARGUMENT를 반환했다. 원인은 내부 로그로 제공되지 않는다. 사용자 승인이 없었다고 해석하지 않는다. DEV gate가 막혀 PROD 확정은 실행하지 않았다. CLI/다른 도구로 이 차단을 우회하지 않는다.

## 자동화

연결 branch는 DEV=dev, PROD=prod이나 서비스가 각각 특정 commit SHA에 고정되어 있다. 앱 실행 허용과 Git push 자동 배포는 별개다. 최신 dev의 다른 작업·V98을 Sleep 운영 릴리스에 포함하지 않는다. 고정을 제거해 배포를 강제하는 우회나, 플러그인 위험 분류·내부 승인 검사를 수정하는 방식은 수행하지 않았다. 기존 CI workflow도 확인되지 않아 전체 branch 자동 배포를 활성화했다고 주장하지 않는다.

## 보존·정리

새 runtime/DB는 없고 PROD 데이터와 환경변수를 수정하지 않았다. 후보 branch는 운영 승격 전의 유효한 미병합 작업과 staged SHA를 보존하기 위해 유지한다. 최종 worktree 정리·문서 커밋·Drive metadata readback은 closeout에 기록한다.

[기존 Drive 전달 폴더](https://drive.google.com/drive/folders/1SrbfUMSxa9qohN72GyqdOso6SLAqseNp). 원본 구현·격리 QA 보고서와 이번 운영 후보 보고서를 함께 사용하되, 이전 ‘운영 승인 없음’ 설명은 이번 명시 승인 이전의 이력이다.
