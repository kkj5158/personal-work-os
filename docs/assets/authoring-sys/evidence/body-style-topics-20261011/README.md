# AUTHORING — 가벼운 몸, 자유로운 스타일 / REN / 내가 가지고 싶은 좋은 몸 (2026-10-11)

Classification: **Implementation Evidence (DEV)**. These screenshots are not Final UI References.

DEV files were captured with headless Chromium (1440×900, mobile 390×844) against a local production frontend and the feature backend on shared DEV (DEV user provider), on feature commit `9d978e8`.

All visible writing is `[QA]` test data. Home and Library screenshots are cropped to the 주제 글쓰기 section or shelf, and the Library was filtered to this run's titles, so no other writing in the DEV database appears.

| File | Shows |
| --- | --- |
| `DEV_01_HOME_TOPIC_CARDS.png` | Home: the three new cards, fifth to seventh under 주제 글쓰기 |
| `DEV_02_A_STAGE06_NOTICE.png` | 가벼운 몸, 자유로운 스타일 stage 06: the notice below the editor |
| `DEV_03_B_STAGE01_GUIDANCE.png` | REN stage 01: 프로그램 안내 open, the motto as its first paragraph |
| `DEV_04_C_STAGE02.png` | 내가 가지고 싶은 좋은 몸 stage 02: one question, guide and editor |
| `DEV_05_A_REPORT.png` | Completed Report: sections in order, the written Close field shown, the empty one hidden |
| `DEV_06_B_REPORT_EPIGRAPH.png` | REN Report: the epigraph above the report body, empty Close field hidden |
| `DEV_07_C_FULL_VIEW_COMPLETED.png` | 전체 내용 보기 after completion: all six stages, unwritten ones marked |
| `DEV_08_LIBRARY_TOPIC_SHELF.png` | Library: the three program blocks with custom titles, memo and 완료 badge |
| `DEV_09_MOBILE_A_STAGE06.png` | Stage 06 with the notice at 390px |
| `DEV_10_MOBILE_B_REPORT.png` | REN Report with the epigraph at 390px |
| `DEV_11_MOBILE_HOME_TOPIC.png` | Home 주제 글쓰기 at 390px |
| `DEV_12_MOBILE_LIBRARY.png` | Library Topic shelf at 390px |

## Test data left in place

The app has no session delete, so the sessions created by the DEV runs were not deleted. The scripted run was executed twice (the first stopped at its last step, see `docs/AUTHORING_V2_IMPLEMENTATION.md`), so there are ten. All are completed and titled `[QA] DEV … 2026-10-11 — 삭제 가능` (the second run adds `r2`), so none of them is offered as a card's 이어쓰기.

- `light-body-free-style` `79ffb475-3bff-449d-80dc-46623effe265`, `28ba375b-ddc2-411f-a33d-7acc430dc8ed` (written), `abb08d24-a1f0-43ef-a4a2-9db6903f42a1`, `c00746fc-b1a6-4546-8314-b3eaa2f728d4` (nothing written)
- `ren-daily-training` `4b92a0b7-dc95-4ffe-9894-4aab83278f6f`, `bcccd731-9b18-46eb-a443-13488385c001`
- `desired-physique` `154fab17-6876-4f00-9ebf-813371019d39`, `27f357a2-e46b-4fbf-9d64-c1aa1b60af63`
- `earning-a-living` `dd863372-a66b-45fa-bd2d-cec4571cbb4c`, `d95b48f7-65da-4f3f-ab61-907573472216` (regression runs)
