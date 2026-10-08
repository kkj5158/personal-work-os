# Sleep Web — 실사용 후 개선 인계

V1은 승인된 네 화면·주수면 사후 편집·별도 회상 낮잠·안전한 저장을 제공한다. 다음 변경은 실제 사용에서 재현되는 문제를 기준으로 정한다. 원본 facts, Android envelope, owner isolation, revision/replay/delete privacy, V78 적용 파일을 보존한다.

## 사용 관찰 기록

| 항목 | 기록할 내용 |
|---|---|
| 화면·상황 | 개요/기록/통계/설정, desktop/mobile, theme, 조회 날짜와 시간대 |
| 수행 동작 | 입력·저장·수정·삭제·재시도·충돌·이동 중 어떤 단계인지 |
| 기대와 실제 | 기대한 결과와 실제 표시/동작을 한 문장씩 |
| 재현 조건 | 같은 로그인 owner, 연결 상태, endpoint 시간대, 다른 클라이언트 쓰기 여부 |
| 자료 | 개인 기록을 가린 화면 또는 오류 code; bearer token/비밀번호는 기록하지 않음 |
| 수정·검증 | 수정 파일, 계약 영향, 필요한 focused 검사, DEV/PROD 후보 SHA |

## 다음 실행 후보와 현재 한계

- 정상 DEV owner 로그인 세션을 확보한 뒤 hosted DEV 인증 확인. 현재 DEV 토큰 우회는 하지 않았다.
- 실제 브라우저 200% 확대·사용자의 기기에서 날짜/시각 입력 가독성을 관찰한다. 현재 증거는 CSS content zoom 및 320/390/1280px desktop Chrome이다.
- 충돌·재시도 문구와 기록 밀도에서 반복되는 사용 불편이 있으면 합성 fixture로 재현하고 해당 화면만 검증한다.
- 공유 reminder의 고급 profile 표현과 UX polish는 실제 필요가 확인될 때 다룬다. Android 장치 할당·알림 권한은 Web에 가져오지 않는다.
- Flip6 물리 QA와 Android 낮잠 UI/sync는 별도 명시 범위로 재개한다. 이번 Web 완료를 그 검증 완료로 해석하지 않는다.

향후 데이터·마이그레이션 변경은 현행 POS release ownership과 safe forward 절차를 따른다. 저장된 낮잠을 지우는 rollback이나 과거 주수면 재분류는 후속 개선 수단이 아니다.
