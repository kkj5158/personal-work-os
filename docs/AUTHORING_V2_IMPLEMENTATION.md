# Authoring V2 implementation

Baseline: dev `8a707e6` (2026-09-21). Scope: DEV only.

## Reconnaissance

Existing `authoring_sessions` stores unrestricted program keys, JSONB answers,
frozen program definitions, progress, source session references and completed
report snapshots. Resume uses the latest updated incomplete session for each
program. No migration is needed for new program keys or structured JSON answers.
Old sessions retain their frozen definition and original answer keys; only new
sessions receive the new definitions. Completed sessions remain immutable.

The Home has no clickable parent card, but asynchronous React busy state does
not synchronously exclude competing handlers. Its navigation handlers also lack
a shared guard, and buttons can implicitly submit an enclosing form. Fix the
action boundary first, then add the V2 content and structured editors.
