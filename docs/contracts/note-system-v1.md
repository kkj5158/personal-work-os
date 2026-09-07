# NOTE SYSTEM V1

## Ownership and identity

NOTE SYSTEM is a separate system. Its dynamic workspaces belong to the authenticated owner; JISEUNG is created on first use. WORK_OS and LIFE_OS remain separate navigation destinations. Every Note API authorizes the workspace through the existing CurrentUserProvider. No new authentication mechanism is introduced.

V24 adds only Note-owned tables. Existing Work Log, Checklist, Attendance and Planning tables are unchanged. All new tables enable RLS without public client policies; the authenticated backend mediates access. Applied migrations are immutable.

Notes have permanent UUIDs. Daily identity is `(workspace_id, journal_date)` with a database unique constraint. Reading a day, including a future day, does not create a note. First nonempty content creates it. Ordinary notes may be empty. Daily titles are dates. A unified normalized title/alias reservation table prevents ambiguity, including names held by Trash. Normalization is Unicode NFKC, trimmed/collapsed whitespace and lowercase. Renaming preserves previous names as aliases and existing UUID links.

Workspace archive is reversible and prevents content writes. V1 permanent deletion accepts only an archived workspace, an exact name confirmation, and zero notes/media, including Trash. Notes in Trash retain identity/content/reservations; they are excluded from normal discovery. Daily notes are cleared rather than trashed. Trash is never automatically emptied.

## Content, saving and media

Canonical content is Markdown text, including explicit `[[Title]]` links. Tiptap provides live rich editing and serializes back to Markdown. Code and escaped wiki syntax do not form connections. The original syntax, not a duplicate JSON document, remains the source of truth.

Image rows use this bounded Markdown extension:

```text
:::images {"images":[{"src":"media:<UUID>","caption":"","ratio":100}],"width":75,"align":"center"}
:::
```

Rows contain 1–3 images. Width is 25–100%; pairwise ratios and captions persist. Dragging a fourth image onto a full row makes another row. Upload, clipboard paste, file drop and private authenticated reads use stable media UUIDs. No expiring URL or base64 payload is saved in note content. The existing repository has no object-storage abstraction: V1 persists bounded raster bytes in PostgreSQL `journal_media`, behind workspace authorization. PNG/JPEG/GIF are sniffed server-side, limited to 10 MiB and 40 MP; WebP converts to PNG in the browser. Responses use no-store and nosniff. A future storage adapter may move bytes while keeping UUID references stable.

Autosave is debounced and serial per note, with optimistic versions on the backend and workspace row locks around writes. Composition events suspend saving and wiki commands during Korean IME input. Navigation flushes content and metadata operations; tab close warns while dirty. A stale save returns conflict rather than overwriting a newer document. Failed content remains in the editor and a session draft, with explicit retry/recovery/download. Backend response bodies never replace newer editor content.

## APIs and projections

Base path: `/api/note-system`. Settings and workspace registry are owner-scoped. Note operations live under `/workspaces/{workspaceId}`: daily ranges, notes/save, rename, pin, trash/restore, visits, library, resolve, references, tags, connections, graph, search and media. Controller records are the exact wire schema. Void mutations return 204. Invalid requests return 400, ownership misses 404, stale versions/name conflicts 409.

Each save reconciles explicit link occurrences in the same transaction as content. Occurrences retain source position/context and stable creation times while present; first connection history is retained separately. Pending links resolve when a title or alias appears. Backlinks are grouped by source with contextual navigation. Tags are independent classification relations, never inferred wiki links or Reflection entries.

| Metric | Meaning |
|---|---|
| Connected notes | Distinct active incoming/outgoing neighbors, excluding self |
| Daily dates | Distinct source Daily dates mentioning the target |
| Mentions | Explicit incident wiki occurrences, not plain-text mentions |
| Incoming / outgoing | Distinct directional active source/target notes |
| Recent growth | First formation of unique undirected relationships within 30 days |
| Last connection | Latest retained incident occurrence creation time |

Recent Notes retains 50 distinct latest visits. Library pages contain 50 lightweight summaries with batched tags, not full editor documents. Graph returns nodes/aggregated weighted edges; Daily and Orphan default to hidden. Orphan status is calculated before UI filters and includes pending relationships. Graph Lite supports pan/zoom/drag, neighborhood selection and previews; it is not an analytics dashboard.

Ctrl+K searches current-workspace titles, aliases, bodies, tags and dates with Korean literal substring matching. Results are bounded; the workspace index bounds the personal-scale scan. This deliberately does not claim a general full-text search index. Connections/graphs/backlinks use normalized relation tables, not body scans. Ctrl+F searches the active editor with match navigation.

## Reflection and date bridge

WORK_OS owns Reflection entry creation, editing, date uniqueness and frozen snapshots. No WORK_OS Reflection provider exists at this revision. The Note toolbar exposes COMPARE, ACTUAL_ONLY, PLAN_ONLY and TEXT_ONLY while insertion clearly remains unavailable. The backend rejects invented Reflection directives. There is no production fixture insertion or speculative WORK_OS table.

`notesystem/integration/ReflectionProvider.java` and `frontend/lib/notes/reflection.ts` define the narrow future adapter: owner/date lookup, create main entry, versioned update and frozen snapshot read. Snapshot data contains semantic planned/actual time blocks, IDs/categories, local times/durations, work and checklist summaries. Both plan and actual data remain in the snapshot regardless of display mode. Embeds carry entry ID/date/display mode; deduplication and unlinking never delete the underlying entry. The calendar renderer uses structured blocks, not a captured PNG. `/notes/fixture` exercises realistic data in development and returns not-found in production builds.

The current bridge is URL-only: `/worklog?date=YYYY-MM-DD` opens the selected local date without creating a WorkRecord; the reciprocal link opens JISEUNG Daily Notes in another tab to retain unsaved Work Log edits. Note-side navigation flushes pending saves first. No cross-domain foreign keys are introduced.

## Validation

`npm run test:notes` covers canonical editor roundtrips, media metadata, wiki/code parsing, date boundaries, graph filters, serialized/IME-paused autosave, failure retry and Reflection deduplication. Backend Note tests cover real PostgreSQL invariants and ownership in independent rolled-back workspaces, plus HTTP contracts and parsing. Integration tests require the existing DEV database environment and applied V24; they never apply migrations or retain test notes.

DEV browser QA covers workspace create/switch/archive/restore, module order/default/enable, persisted settings, Daily and normal notes, autosave/navigation, rename/aliases, tags, pin, Trash/restore, pending resolution/backlinks, metrics/graph, Ctrl+K/Ctrl+F, private media/paste/1–3 image rows/drag/fourth-image handling and Reflection modes/unlink. Korean text entry and composition queue guards are tested; automated browser typing does not constitute a physical Windows IME hardware test.

Deferred V1 exclusions: WORK_OS-owned Reflection adapter until its API exists, arbitrary plugins/modules, deep graph analytics, collaborative editing, public sharing, automatic Trash purge and object-storage migration. Deployment/smoke outcomes must be reported from actual evidence separately from this contract.
