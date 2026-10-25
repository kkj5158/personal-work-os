# Sleep 통합 운영 후보 인수인계 — 2026-10-25

> 후속 갱신: MONEY 운영 변경과 입력 포커스 핫픽스를 보존한 최신 후보는 e431a5a다. [최신 실행 인수인계](PROD_EXECUTION_HANDOFF_20261025_KO.md)를 우선한다. be919ba 단독 배포 지시는 대체됐다.

**d01b9c1 단독 후보를 운영에 배포하지 않는다.** 운영 웹에 먼저 반영된 DIET/NOTE를 보존한 후속 후보는 **be919ba20513c5051a8705f9ed2ade05a6a3f51d**다. 사용자에게 이번 Sleep 운영 배포 승인을 다시 요구할 필요는 없다. 플랫폼 승인 차단은 별도이며 우회하지 않는다.

## 소스와 검증

- repo https://github.com/kkj5158/personal-work-os
- branch codex/sleep-web-prod-20261025
- 보존 base prod08fe6767e1c42b6701502a5851ba753d77bc20a9
- source: be919ba20513c5051a8705f9ed2ade05a6a3f51d
- base 대비 Sleep frontend14개 및 기존 Sleep 문서만 다름. source/test13개는 d01b9c1과 동일.
- DIET/NOTE 웹·API·migration·dependencies·lockfile 보존. API 배포는 담당 채팅의 별도 작업이다.
- 이번 build/typecheck/targeted lint PASS, Sleep/WORK FLOW77, DIET/NOTE12, Daily Hub5 PASS 및 NOTE scripts PASS. 일부 suite가 겹치므로 합산하지 않는다.
- 신규 backend/DB/API/browser/hosted smoke는 미실행.

재현: frontend에서 npm ci, npm run build, npx tsc --noEmit.
Sleep77:
node --import tsx --test lib/sleep/model.test.ts lib/sleep/annotations.test.ts lib/sleep/weeklyAnalytics.test.ts lib/life-calendar/model.test.ts lib/life-calendar/editor.test.ts components/life-calendar/TimeCalendar.test.tsx lib/globalTabs.test.ts app/calendar/actualDrag.test.tsx app/calendar/qualityRegression.test.tsx app/calendar/postV1.test.tsx app/calendar/unified.test.tsx
DIET/NOTE12:
node --import tsx --test app/diet/ChallengeDetail.test.tsx app/notes/DailyFeed.test.tsx app/notes/editor/NoteEditor.test.tsx lib/notes/dietJournal.test.ts lib/notes/dietDay.preservation.test.mts lib/notes/dailyHub.test.ts
이후 npm run test:daily-hub, npm run test:notes. build의 공개 환경값은 운영 모드/API base만 사용했고 실제 인증 설정은 로드하지 않았다.

## 상태/배포 순서

1. 실제 Railway deployment SHA와 config pin을 각각 읽는다. 현재 실제 PROD web은08fe676 SUCCESS이며 config는d01b9c1이다. pin을 실제 배포로 해석하지 않는다.
2. production patch edcc4bd2-06fb-4c2c-8052-9b0dcb02ecba에는 API branch/commit 2건이 대기 중이다. 이 채팅에서 변경/accept하지 않았다. 다른 담당자의 변경을 섞지 않는다.
3. DEV actual은009e276, Sleep d4fd2a5가 patch7f54b155-6c09-41ca-84a1-f97eabe42199에 대기 중이다. 이전 accept가 플랫폼 승인 단계에서 취소됐다. 정상 경로 복구 전에 CLI/다른 API로 우회하지 않는다.
4. DEV hosted 기능 검증을 마친 뒤 최신 prod와 통합 후보의 차이를 확인하고 웹 릴리스만 직렬화한다. prod branch를 아직 전진시키지 않았다.
5. 새 운영 배포 SHA/SUCCESS와 로그인, 수면 지표, drag/resize/저장/새로고침, 인접 DIET/NOTE 읽기를 확인한다. 실제 사용자 기록을 테스트 fixture로 수정하지 않는다.

이번에는 소스 통합과 로컬 QA만 완료했다. 기존 API patch 및 운영 DB/Auth/변수는 그대로다. 신규 실제 배포/브랜치 자동 배포 활성화는 완료하지 않았다.

임시 worktree 정리·문서 커밋·원격 HEAD·Drive metadata는 같은 증거 폴더의 closeout/publication에 기록한다. 후보 branch는 미병합 운영 웹 릴리스 작업을 보존하기 위해 유지한다.
