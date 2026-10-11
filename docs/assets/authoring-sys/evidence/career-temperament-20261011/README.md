# AUTHORING — 나의 성향과 커리어 (2026-10-11)

Classification: **Implementation Evidence (DEV)**. These screenshots are not Final UI References.

Captured with headless Chromium (1440×900, mobile 390×844) against a local frontend and the feature backend (`feat/pos/authoring-career-temperament`, `37c9480`) on shared DEV. The round button at the left edge is the Next.js dev indicator, not part of the app.

All visible writing is `[QA]` test data. Home and Library shots are cropped to the 주제 글쓰기 cards and the new program block, so no other session is shown.

| File | Shows |
| --- | --- |
| `DEV_01_HOME_TOPIC_CARDS.png` | Home: the new card, fifth under 주제 글쓰기, with subtitle and card description |
| `DEV_02_STAGE01_GUIDANCE_OPEN.png` | Stage 01 with 프로그램 안내 opened (five approved paragraphs) |
| `DEV_03_STAGE02_GUIDE_AND_EDITOR.png` | Stage 02: main question, guide with the three indented sub-items, one editor |
| `DEV_04_STAGE03_HEALTH_NOTICE.png` | Stage 03: the fixed health notice under the guide; "지금은 쓰지 않겠습니다" as the answer |
| `DEV_05_CLOSE_OPTIONAL_FIELDS.png` | Close (07): three optional fields, only 다시 볼 시점 written |
| `DEV_06_FULL_CONTENT_VIEW.png` | 전체 내용 보기: seven stages, stage 04 unwritten |
| `DEV_07_COMPLETION_DIALOG.png` | 세션 완료: the six approved self-check sentences, nothing blocking |
| `DEV_08_COMPLETED_REPORT.png` | Report: raw text in stage order; the close shows only the written field |
| `DEV_09_LIBRARY_PROGRAM_BLOCK.png` | Library: the program block under 주제 글쓰기 with the completed session |
| `DEV_10_MOBILE_HOME_CARD.png` | Home card at 390px |
| `DEV_11_MOBILE_REPORT.png` | Report at 390px |
| `DEV_12_MOBILE_STAGE03.png` | Stage 03 at 390px |
| `DEV_13_MOBILE_STAGE05.png` | Stage 05 at 390px (guide with four sub-items) |
| `qa-results.json` | The 58 scripted checks of this run, all passed |

The run also checked, without a screenshot: text kept after a page refresh, 이어쓰기 from Home returning to the same stage, each stage saved under its own key, a late save to the completed session rejected, a session completed with nothing written (its report has six sections and no close heading), the completed session offered as a 변화와 방향 돌아보기 source, no horizontal overflow at 390px, browser requests only to the local frontend and backend, and no written text in any URL or backend log line. Existing completed `[QA]` reports of five other programs still opened with every section and were byte-identical before and after.

## Test data left in place

Sessions created by this run were not deleted. DEV (shared DEV owner), all `career-temperament`:

- `834aa9dc-b196-434b-b95a-6a0cf45ea96a` — completed, `[QA] career-temperament DEV 2026-10-11 — 삭제 가능`
- `766dec61-ee66-4e95-b0e4-f5d6330e7657` — completed with nothing written, `[QA] career-temperament DEV 빈 완료 2026-10-11 — 삭제 가능`
- `46662ef1-5bfe-4d07-b170-14dadf1af9a9` — in progress, `[QA] career-temperament DEV 작성 중 2026-10-11 — 삭제 가능`
