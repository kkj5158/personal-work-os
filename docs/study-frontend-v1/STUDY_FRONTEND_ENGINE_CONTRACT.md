# STUDY frontend / engine contract

Date: 2026-10-27, Asia/Seoul. Source of truth: `frontend/lib/study/model.ts` and `port.ts`.

## Adapter selection and trust boundary

`/study` starts with a disconnected adapter in every environment. It exposes the real integrated screens and honest empty states. Explicitly choosing **공개 샘플 체험 시작**, or opening `?demo=1`, selects authored public sample data. This is a deliberate extension of the attachment's DEV-only recommendation to satisfy the owner's production release request without presenting fixtures as real private learning content. It is not an authorization flag. No real answer keys, private documents or production user data belong in this adapter.

All sample state is held in the existing RouteStateProvider's browser memory. It survives in-app navigation, clears on refresh, and is discarded with the signed-in shell. Photos/PDF bytes and object URLs stay in the upload component and are revoked on removal/unmount. No localStorage/sessionStorage file bytes or server uploads. The existing global tab service stores only allowlisted route context, never responses or file names.

`StudyDataPort` is dependency injected into Today, Workbooks, History, Materials, Coach and the workspaces. Its surface includes snapshot reads/subscription, package reads, draft writes/discard, immutable attempt recording, deliberate answer-key reads, source configuration, feedback, proposal approval/rejection, policy rollback, automation configuration and disconnected generation retry status. Replace this port with an authenticated server adapter; keep the screens and renderer registry.

## Public question and response shapes

```json
{
  "id": "study-2026-10-27",
  "version": 1,
  "date": "2026-10-27",
  "topic": "린 스타트업 × AI 엔지니어링",
  "policyVersion": 1,
  "status": "preview",
  "required": [{
    "id": "choice-1", "version": 1, "order": 1,
    "kind": "single_choice", "prompt": "MVP로 먼저 확인해야 할 것은 무엇인가요?",
    "options": [{"id":"A","text":"기능을 모두 구현한다"},{"id":"B","text":"핵심 가설을 확인한다"}],
    "responseSchema": "option",
    "source": {"materialId":"lean-startup","section":"직접 작성한 샘플"}
  }],
  "extension": [],
  "questionPdf": {"workbookId":"study-2026-10-27","workbookVersion":1,"kind":"question","state":"preview"},
  "answerExplanationPdf": {"workbookId":"study-2026-10-27","workbookVersion":1,"kind":"answer","state":"missing"}
}
```

This abbreviated envelope illustrates fields; an accepted package needs nonempty, validated required and extension sets. Runtime validators reject unknown question fields/kinds, malformed identities/options/order/source, invalid response schemas and incorrectly published document pairs. Content renders as React text; no HTML, code, component names or executable data is accepted.

| Kind | Schema | Response |
| --- | --- | --- |
| single_choice | option | `{"selected":"B"}` |
| multiple_choice | options | `{"selected":["A","B"]}` |
| true_false | boolean | `{"value":false}` |
| short_answer / essay / case_analysis | text | `{"text":"..."}` |
| diagram | attachment | Handwritten coverage and attachment metadata; no online input |

Case analysis requires context. Text fields support optional guidance and rows (1–30), with a 16,000-character response limit. True boolean false is valid. Duplicate option selections, unknown option IDs and extra response fields reject. Empty text/selection removes a demo draft rather than retaining a stale answer.

## Stable version binding and attempts

```json
{
  "workbookId":"study-2026-10-27", "workbookVersion":1,
  "part":"required", "questionId":"choice-1", "questionVersion":1
}
```

The response key is a JSON tuple of those five values. Display order is not identity. Answer keys use the same binding, and are read only following an explicit review action. Their separate module contains public sample explanations, models, rubrics, incorrect-option reasons and follow-up questions. Browser separation is not real access control: enforce authorization on the future server.

Attempts append and are deeply frozen, together with package snapshots. Corrections create another workbook version. Online coverage requires matching, validated responses; handwritten coverage requires matching question bindings and attachment metadata. Daily completion counts the union of coverage for the same workbook version and part; repeated/hybrid attempts never double count a question, and extension cannot complete required.

Attachment metadata: `id`, `name`, `type`, `size`, `order`. UI validates matching JPG/JPEG/PNG/PDF extension and MIME, positive size up to 20MiB, and at most 10 files. This is usability validation only; a future backend needs byte inspection, scanning, ownership, object storage, signed retrieval and retention rules.

## Publication, policy and dates

Published status requires question/answer document kinds, IDs and versions to match, ready state and actual HTTPS URLs for both artifacts. Current samples remain previews because no actual paired PDFs exist. A missing-answer example is in the archived week's Sunday package. There are no fake PDF downloads or print buttons.

All weeks run Monday–Sunday in Asia/Seoul. Sunday evening is the only agreed automation time; exact execution time remains unspecified. Policy approval creates a new policy and new future preview workbook versions. Existing current/archive snapshots and attempts remain untouched. Rejection does not mutate policy. Rollback creates another policy version rather than erasing history. Free text is recorded as pending AI analysis; preset buttons deterministically propose changes and are labeled sample behavior.

## Future server integration

Implement authenticated reads/writes matching the port, not guessed frontend HTTP URLs. Suggested resource groups: immutable batches/packages/documents, version-bound drafts/attempts, attachment initiation/finalization, sources/roadmap, feedback/proposals/policy history, and job/automation status. No such endpoints were added in this phase. Add server-side validators, idempotent mutation keys, concurrency tokens, ownership checks, transactional document-pair publication and historical schema compatibility before selecting a connected adapter.
