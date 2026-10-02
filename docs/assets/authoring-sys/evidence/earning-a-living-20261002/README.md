# AUTHORING — 돈을 벌며 살아가는 방식 (2026-10-02)

Classification: **Implementation Evidence (DEV)**. These screenshots are not Final UI References.

DEV files were captured with headless Chromium (1440×900, mobile 390×844) against a local frontend and the feature backend on shared DEV, on the tree that was merged as dev `e56341e`.

All visible writing is `[QA]` test data. Screenshots are cropped to the new program's own card, block or session so that no other writing in the DEV database appears.

| File | Shows |
| --- | --- |
| `DEV_01_HOME_TOPIC_CARD.png` | Home: the new card, fourth under 주제 글쓰기 |
| `DEV_02_STAGE04_INCOME_LEVELS.png` | Stage 04: three optional income levels (amount, reason, what to check), one level left empty |
| `DEV_03_STAGE07_SUPPORT_AND_GROWTH.png` | Stage 07: one main question and guide above two separate editors |
| `DEV_04_LIBRARY_IN_PROGRESS.png` | Library: program block with custom title, memo, 작성 중 badge and 이어쓰기 |
| `DEV_05_FULL_CONTENT_VIEW.png` | 전체 내용 보기 before completion: all nine stages in order |
| `DEV_06_COMPLETED_REPORT.png` | Completed Report: authored text in order; only the written income levels and fields |
| `DEV_07_MOBILE_HOME_CARD.png` | Home card at 390px |
| `DEV_08_MOBILE_LIBRARY.png` | Library program block at 390px |
| `DEV_09_MOBILE_REPORT.png` | Report at 390px |
| `DEV_10_MOBILE_STAGE04.png` | Stage 04 structured inputs at 390px |
| `DEV_11_MOBILE_STAGE07.png` | Stage 07 at 390px |

## Test data left in place

The app has no session delete, so the sessions created by the DEV run were not deleted. All seven are completed and titled `[QA] … 2026-10-02 — 삭제 가능`, so none of them is offered as a card's 이어쓰기.

- `earning-a-living` `567f4d95-ff53-4e56-aef1-a67bcd32fdc6` (full), `941151d7-f82a-48c9-b0e8-ebc915e8ee2c` (almost empty), `bebf7c22-d839-4b17-a030-d3b7d477480d` (mobile)
- `review` `bf816180-2b16-4375-befb-4e4b03b56360` (source: the first session above)
- `responsibility` `499599c2-1c5b-40db-9667-0e4d95b6f78b`, `present-future-identity` `8a959a92-c4bb-4f71-8752-6858c3bf0aa5`, `present-life` `07c59483-ee0b-4602-9a5b-ea3dff7361f4` (regression runs)
