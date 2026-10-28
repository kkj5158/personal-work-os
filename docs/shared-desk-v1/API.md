# 공유 작업대 Web V1 API

기존 POS 사용자 JWT와 `CurrentUserProvider`를 사용한다. `ownerId` 입력을 받지 않으며 서버 통합용 WORK FLOW credential 범위를 확장하지 않는다. 주소는 `/api/shared-desk`다.

## 요청과 재시도

모든 변경 요청은 `operationId`(UUID), `operationCreatedAt`(ISO UTC)를 포함한다. 수정·삭제·취소·복구에는 `expectedRevision`이 필요하다. 변경 payload는 flat JSON이다. 같은 owner·작업 ID·내용의 재시도는 원래 결과를 돌려주며, 내용 변경은 409다. 30일 지난 작업은 410으로 거절하고 만료 ID/해시를 재실행 방지 기록으로 남긴다. 결과 불명은 `/operations/{operationId}`로 먼저 조회한다. 파일 검증 중에는 `PENDING`, 그 밖의 저장된 결과는 `ACKNOWLEDGED`다.

`GET /capabilities`는 `enabled`, `filesEnabled`, `environment`, 인증된 `ownerId`를 반환한다. `SHARED_DESK_ENABLED`와 `SHARED_DESK_STORAGE_ENABLED` 기본값은 false다.

## 주요 경로

| 경로 | 메서드 | 내용 |
|---|---|---|
| `/clips`, `/memos` | GET, POST | 목록/생성. body 원문, title 선택, projectId 선택, 메모의 fileIds 선택 |
| `/clips/{id}`, `/memos/{id}`, `/files/{id}` | GET, PATCH, DELETE | 상세/리비전 수정/7일 휴지통 |
| `/memos/{id}/replies` | GET, POST | 한 단계 답글. 삭제된 root에는 410 |
| `/files` | GET | 준비/전송/실패 파일 메타데이터 |
| `/files/upload-tickets` | POST | displayName, sizeBytes, sha256, claimedMime, projectId 선택 |
| `/files/{id}/upload-tickets` | POST | 같은 파일 ID에 새 전송 티켓. 현재 유효한 전송은 먼저 취소 |
| `/files/{id}/complete` | POST | ticketId, expectedRevision. 서버 실제 바이트 검증 후 READY, 검증 실패 422/FAILED, 진행 중 202 |
| `/files/{id}/cancel` | POST | 전송 취소. 이미 발급한 URL의 만료까지 예약 용량 유지 |
| `/files/{id}/download-tickets` | POST | 소유자·READY·휴지통 상태 확인 후 60초 GET URL |
| `/trash`, `/items/{id}/restore` | GET, POST | 복구 목록/원래 ID 복구 |
| `/changes` | GET | after/until/limit. owner별 commit 순서 델타 |
| `/operations/{operationId}` | GET | 결과 불명 작업 조회 |
| `/usage` | GET | owner의 상태별 파일 수/바이트, 예약 포함 용량, 다운로드 추정, 정리 실패 수 |

목록은 `q`, `projectId`, `unlinked`, `cursor`, `limit`를 사용한다. projectId와 unlinked 동시 사용은 400이다. root 목록과 답글 목록 응답은 `{items,nextCursor,hasMore}`다. 불투명 커서는 owner·환경·필터에 묶이며 목록 커서는 1시간, 델타 커서는 최대 30일이다. 변경 이력 보존 경계보다 뒤처진 커서는 유효기간이 남아 있어도 410이다. 클라이언트는 초안·outbox를 유지하고 목록을 다시 읽는다.

본문은 UTF-8 1 MiB까지이며 저장할 때 trim하지 않는다. 미리보기는 일부만 반환하고 전체 본문은 상세에서 읽는다. 고정 후 최신 변경 순서로 정렬하며 목록은 변경별 불변 스냅샷으로 페이지 간 이동을 안정화한다. 파일과 Project 참조는 같은 owner만 허용한다. Project 삭제는 project_id만 null로 만들며 항목을 삭제하지 않는다.

## 파일 보안

단일 파일 100 MiB, 개인 1 GiB, 진행 중 전송 3개. READY/휴지통, staging 예약, 검증·실패 정리 대기 객체를 보수적으로 합산한다. 취소/실패만으로 서명 URL이 무효화되지 않으므로 객체 삭제 확인 전 용량을 풀지 않는다. 최종 검증 복사본의 여유도 먼저 확인한다.

PUT URL은 staging에만 발급한다. 서버는 새 final key로 복사한 스냅샷을 고정 버퍼로 읽어 실제 길이/SHA-256/UTF-8/파일 시그니처를 검사한다. 공급자의 HEAD 메타데이터나 클라이언트 digest만으로 READY를 만들지 않는다. APK/ZIP을 실행하거나 압축 해제하지 않는다. 이는 악성코드 검사 서비스가 아니다.

다운로드는 application/octet-stream, attachment, UTF-8 파일명, private/no-store로 전달한다. 실제 Railway 직접 응답에는 nosniff가 없음을 확인했다. 제공자 헤더를 임의로 보장하지 않으며, 엄격한 추가 응답 헤더가 필요한 배포는 `ObjectStorage.download`의 인증된 스트리밍 경로를 별도 연결해야 한다. 서명 GET은 발급 후 최대 60초 동안 유효할 수 있다.

본문·자격증명·서명 URL은 진단 로그/증거에 기록하지 않는다. 공개 오류는 고정된 message/code와 필요한 리비전 메타데이터만 포함한다.
