# AUTHORING — 반복하고 싶은 현재와 도달하고 싶은 미래 (2026-10-01)

Classification: **Implementation Evidence (DEV and PROD)**. These screenshots are not Final UI References.

DEV files were captured with headless Chromium (1440×900, mobile 390×844) against a local frontend and the feature backend on shared DEV. PROD files were captured in the signed-in app after the Railway deployment of `prod` `4694568`.

All visible writing is `[QA]` test data. Nothing here is the owner's writing.

| File | Shows |
| --- | --- |
| `DEV_01_HOME_TOPIC_CARD.png` | Home: the new card, third under 주제 글쓰기, with 이어쓰기 / 새로 시작 |
| `DEV_02_FIVE_IDENTITIES.png` | Stage 03: five identity slots (name + optional one-line meaning) and the grouped stage list |
| `DEV_03_IDENTITY_DEEP_WRITING.png` | Stage 04-1: identity name bar and the four parts A–D |
| `DEV_04_INTEGRATED_LIFE.png` | Stage 05-A: one question, one guide, one editor |
| `DEV_05_FINAL_WRITING.png` | Stage 07: the long final editor with starters as helper text |
| `DEV_06_LIBRARY.png` | Library: program block under 주제 글쓰기 with a completed and an in-progress session |
| `DEV_07_COMPLETED_REPORT.png` | Completed Report: all five identities with raw text, in authored order |
| `DEV_08_MOBILE_IDENTITY_WRITING.png` | Stage 04-1 at 390px |
| `PROD_01_HOME_TOPIC_CARD.jpg` | PROD Home after deployment: the new card and the completed `[QA]` smoke session in 최근 작성 |
| `PROD_02_COMPLETED_REPORT.jpg` | PROD Report of the `[QA]` smoke session |

## Test data left in place

Sessions created by these runs were not deleted.

- DEV (shared DEV owner): five sessions. `present-future-identity` `a88b87fc-5e1c-4bde-9baf-e148f5ab3658` and `23529118-74a6-46c3-99a0-50ab0c1f9d25` (completed), `a055a123-cb22-4564-b9e8-280501131dd4` and `5c2fef43-5f5f-4203-a704-4626834e4121` (in progress), and `present-life` `2d22361b-c718-4c64-ae1d-48331614b1c7` (in progress).
- PROD: one completed session, `present-future-identity` `3ee9bea1-27c3-4a1f-bda4-9d55976295a6`, titled `[QA] PROD smoke 2026-10-01 — 삭제 가능`.
