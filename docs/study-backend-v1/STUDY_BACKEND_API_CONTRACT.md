# STUDY Backend API Contract

Date: 2026-11-09, Asia/Seoul. Implementation: `backend/.../study`, `frontend/lib/study/serverPort.ts`.

## Authentication and ownership

All hosted `/api/study/**` routes use the existing Supabase/GoTrue JWT resource-server chain (`hosted-dev` or `prod`). Signature, issuer, expiration and authenticated audience are checked by existing security configuration. The owner comes exclusively from `CurrentUserProvider`. Request body, query and path parameters cannot select another user. Guessed foreign resource IDs return 404. Browser database access is not supported; the four STUDY tables enable RLS without browser-role access policies, including for private answer-key columns.

The existing loopback `dev` profile intentionally uses the project's configured synthetic user. Local browser evidence under that profile is not hosted authentication evidence. The module adds no login bypass, service credential or authentication mechanism.

All STUDY responses are `private, no-store`; content downloads add `nosniff`, attachment disposition and a restrictive sandbox CSP. Bearer tokens and upload URLs must not be logged, persisted in metadata, or included in evidence.

## Routes

| Method | Route | Request / result |
| --- | --- | --- |
| GET | `/api/study/snapshot` | Owner snapshot; initializes an empty workspace and v1 manual policy on first use |
| GET | `/api/study/capabilities` | Actual storage state, file limits, and disconnected engine flags |
| POST | `/api/study/commands` | Transactional command envelope below; returns current snapshot |
| POST | `/api/study/workbooks/{id}/{version}/review?part=required\|extension` | Explicit review; records a review event and returns only that part's answer keys |
| POST | `/api/study/workbooks/{id}/{version}/publish` | Envelope data `{questionAssetId,answerAssetId}`; atomically publishes a verified pair |
| GET | `/api/study/assets` | Owner metadata only, excluding deleted assets; never returns object keys or download URLs |
| POST | `/api/study/assets` | Upload-init envelope; returns metadata and short-lived PUT ticket |
| POST | `/api/study/assets/{id}/complete` | Finalization envelope; verifies private final bytes and returns asset status |
| POST | `/api/study/assets/{id}/remove` | Removal envelope; rejects attached files and still-active upload reservations |
| POST | `/api/study/assets/reconcile` | Owner-scoped reconciliation of expired interrupted/failed uploads and old staging copies |
| GET | `/api/study/assets/{id}/content` | Authenticated streaming original download; answer PDFs additionally require explicit review |

The body of review and reconcile may be `{}`. Other mutation bodies use the following envelope. Do not invent resource-specific REST routes that are not in this table.

```json
{
  "operationId": "a fresh UUID, retained verbatim for a retry",
  "expectedRevision": 12,
  "action": "draft.save",
  "data": {
    "binding": {
      "workbookId": "manual-2026-11-09", "workbookVersion": 1,
      "part": "required", "questionId": "q1", "questionVersion": 1
    },
    "response": {"value": false}
  }
}
```

`operationId` is unique per owner across mutation families. Receipts bind it to the exact serialized request and endpoint/resource scope. Retrying the same operation does not append another attempt, policy or workbook. Changed payload, revision or endpoint under an acknowledged operation ID returns 409. Keep the original request for uncertain network retries. An optimistic concurrency conflict requires reloading and a deliberate new save; the adapter does not silently overwrite another session's edits.

The global workspace revision serializes multi-record changes. Commands, asset mutations, review and reconciliation may advance it. Read a fresh snapshot before a new operation. The frontend queue serializes these operations and debounces draft writes by 500ms. Submit, discard and review flush pending draft edits first. A failed save is shown as failed, never acknowledged as durable.

## Command data

| `action` | `data` |
| --- | --- |
| `material.save` | `{id,title,domain,weight,included,scope,status?,rights?,format?,progress?,active?}`. Weight/progress 0–100. Format `pdf`, `note` or `book`. Stored status `metadata`; version increments and old metadata versions remain in `MATERIAL_VERSION` records. |
| `material.delete` | `{id}`. Rejects referenced workbooks or live files; historical metadata versions remain. |
| `workbook.import` | `{workbook,answerKeys}`. New immutable version, structurally validated and answer data separated server-side. |
| `draft.save` | `{binding,response}`. Full five-field identity. Empty text or empty multi-selection deletes that draft. |
| `draft.discard` | `{workbookId,workbookVersion,part}`. Keeps attempts. |
| `attempt.submit` | `{workbookId,workbookVersion,part,mode,coverage,responses,attachments,note}` |
| `feedback.add` | `{text}`; 1–4000 characters, stored as `pending_analysis`. |
| `policy.propose` | `{change:"format"\|"explanation",scope?:"this_week"\|"next_week_only"\|"ongoing"}`; a clearly manual preset proposal. |
| `policy.decide` | `{id,approve:boolean}`; stale before-policy rejects, approval appends a policy version. |
| `policy.rollback` | `{version}`; creates another ongoing policy effective next week, retaining history. |
| `automation.configure` | `{enabled:boolean}`; preference only, does not schedule or send anything. |

`retryPreview` makes no generation request. The adapter reports that engine, automatic PDF generation, scheduling and email remain disconnected.

## Snapshot and StudyDataPort mapping

Snapshot contains `ownerId`, `revision`, `currentWeek`, `batches`, `packages`, `sources`, `roadmap`, `policies`, `proposals`, `feedback`, `drafts`, `attempts`, `automation`. Roadmap starts empty; no generated plan is invented. Current and archived batches are derived from stored workbook dates, Monday–Sunday in Asia/Seoul. All versions remain in `packages`. One logical workbook owns each date; corrections retain the date and increment its version.

The adapter exposes cached synchronous `getSnapshot` / `readPackage` and `subscribe`, backed by authenticated refresh and serialized mutations. Its mode is `server`. The explicit `demo=1` adapter remains isolated in shell memory and never imports into the real database. Connection states are loading, ready, saving, unauthorized and error. Retry retains uncertain operations; a 409 refreshes server state and asks the user to review/re-enter the conflicting change.

`readAnswerKeys` calls review. `updateSource`, `saveDraft`, `discardDrafts`, `recordAttempt`, feedback, proposal decisions, rollback and automation map directly to command actions. Additional manual controls use `importWorkbook`, `publishWorkbook`, `uploadFile`, `listAssets`, `downloadFile` and `reconcileFiles`. Private downloads obtain the current session token in memory. There are no presigned GET URLs in snapshots or browser route state.

## Questions, responses and attempts

Imported workbook has exactly `id`, `version`, `date`, `topic`, `policyVersion`, `required`, `extension`. Each part has 1–40 questions. Versions/orders are positive 32-bit integers; raw out-of-range values are rejected before conversion. Expected revision is a nonnegative bounded 64-bit integer and raw file sizes are checked before conversion. Version must be the next version for that ID; duplicate ID/version and changing a logical workbook's date reject. Source material IDs and policy versions must exist for the same owner. Unknown fields, kinds and schemas reject.

| Kind | Response schema | Valid response |
| --- | --- | --- |
| `single_choice` | `option` | `{"selected":"option-id"}` |
| `multiple_choice` | `options` | `{"selected":["option-a","option-b"]}`; unique, known IDs |
| `true_false` | `boolean` | `{"value":false}` or true |
| `short_answer`, `essay`, `case_analysis` | `text` | `{"text":"nonblank, at most 16000 characters"}` |
| `diagram` | `attachment` | No online response; handwritten coverage |

Question fields match the renderer: `id`, `version`, `order`, `kind`, `prompt`, `responseSchema`, `source:{materialId,section}`, optional context/guidance/rows. Choice questions require 2–6 unique options `{id,text}`. Case analysis requires context. Rows are 1–30. No executable components or HTML are accepted as a question kind.

`answerKeys` covers every question exactly once and separately contains `binding`, `model`, `explanation`, `rubric:string[]`, `followUp:string[]`, optional `incorrectReasons:{optionId:string}`. It is not included in the normal snapshot or public package.

Coverage entries are JSON strings encoding `[workbookId,workbookVersion,part,questionId,questionVersion]`. Online attempts require exactly the response set covered, with no attachment metadata. Handwritten attempts require 1–10 ready, owned, same-workbook files and no fabricated online responses. The server takes file name/type/size and order from stored assets and array order, ignoring client claims. Notes are at most 2000 characters. Attempts append with server UUID/time, `simulated:false`, `evaluation:submitted_ungraded`; there is no AI or objective score. Coverage is the union of version-bound question identities within each part, so repeat/hybrid attempts do not inflate completion and extension cannot complete required.

## File protocol

1. Load snapshot/capabilities. `STUDY_STORAGE_ENABLED=true` and valid existing provider configuration are required; otherwise storage is `BLOCKED` and file writes return 503.
2. POST asset-init data `{purpose,name,size,type,sha256,materialId? ,workbookId?,workbookVersion?}`. Purpose is material, handwritten, question or answer. Material binds to a material ID; the other purposes bind to a workbook version. Never send a user ID, bucket or object key.
3. Receive `{id,name,type,size,purpose,state,url,expiresAt,headers}` and PUT raw bytes with exactly the required headers, without application credentials. PUT tickets expire after ten minutes. Claims are provisional; they are not proof of upload.
4. Refresh revision, then POST complete. The provider copies to a fresh private final key; backend streams and checks actual length, digest, magic, complete image/PDF structure and active PDF content before READY. Malformed data becomes FAILED (HTTP 422). Network failure is not success. Duplicate completed finalization never overwrites final bytes.
5. Use authenticated content streaming. Final originals remain private and attachment-only. Answer PDFs require review. Order/remove local selections before submission; an immutable attempt stores the chosen order and file IDs.
6. Reconcile after ticket expiry plus a 60-second buffer. Failed/interrupted originals and staging copies are individually deleted; ready/attached final originals remain. Attached files cannot be removed. The Materials screen exposes reconciliation and adding PDFs to existing material records.

Handwritten: JPG/JPEG/PNG/PDF, 20 MiB per file, at most ten per attempt. Material/document PDFs: configurable `STUDY_MATERIAL_MAX_BYTES`, default/max 100 MiB; transfer goes directly to storage rather than through the JSON proxy. The module reserves at most ten unfinished uploads and 1 GiB of logical owned asset bytes. Temporary staging/final copies can consume additional physical space until reconciliation. Names are bounded and reject paths, control/format characters and ambiguous trailing characters. PNG/JPEG decode, terminal markers and a 40-million-pixel limit protect image handling. PDF parsing rejects encrypted, empty, truncated, embedded-file and executable-action PDFs. This is conservative format screening, not a malware-scanning service.

The adapter reuses the approved S3-compatible provider with a separate `study/{dev|prod}/{owner}` namespace. It creates no bucket, ACL, CORS rule, account or infrastructure. Provider environment must match the application DB environment. Existing Shared Desk keys and defaults stay unchanged. Original PDFs are private downloads; there is no OCR, extraction, indexer or automatic renderer.

## Manual pair publication

Upload actual question and answer/explanation PDFs for an unpublished workbook version. Each PDF's document information must contain these custom fields:

```text
StudyWorkbookId       = exact workbook ID
StudyWorkbookVersion  = decimal workbook version
StudyDocumentKind     = question OR answer
```

This is the manual producer's explicit byte/package binding, not semantic AI validation of the PDF's questions. Both PDFs are parsed and their bytes/digests re-read immediately before publication. Files must exist, be ready, owned and bound to that same version and purpose. Publication and attachment states change in one database transaction. Question-only, answer-only, mismatched, failed, inaccessible and missing pairs reject. Published packages and referenced files are immutable; corrections import a new version. The engine phase must preserve this gate.

## Errors and limits

| Status | Meaning |
| --- | --- |
| 400 | Invalid schema, response, identity binding, membership or state |
| 401 | Missing, expired or invalid authentication |
| 403 | Answer PDF review required |
| 404 | Missing or foreign resource |
| 409 | Revision/replay/immutable version conflict, referenced deletion or active ticket |
| 413 | JSON/file/logical quota limit |
| 422 | File verification/provider failure or invalid document pair |
| 429 | Ten active upload reservations reached |
| 503 | Durable private storage disabled/unavailable in configuration |

Domain errors have `{code,message}` with no provider error, SQL, object key, credentials or content. Existing malformed JSON handling returns a generic error. JSON request bodies are bounded at 2 MiB. No new global POS rate or security configuration is introduced.
