# MONEY Category 2-Depth

Source: Drive 125 policy > 126 UIREF > prior 75/80; visuals in 127; handoff 128.

- Categories retain identity and one selected categoryId per meaning. `parentId` belongs only to categories. Existing flat records remain roots.
- V62 adds same-owner parent FK, root/sibling name indexes and a depth/kind/owner trigger. No initialization, history remapping or financial changes in migration.
- `archived` is the row's own state; `effectiveArchived` includes its parent's state. Children retain their own state when a parent is disabled/re-enabled.
- POST `/categories/defaults` explicitly adds the 65-row canonical taxonomy (18 parents). Existing exact scoped names are reused; ambiguous existing names stop initialization rather than guessing. No PROD initialization in this track.
- GET `/categories/{id}/impact` gives distinct directly linked record count, rule count, children and version. PUT `/categories/{id}/move` requires same-kind root, versions, matching impact snapshot and explicit confirmation. It changes only the child's parent/order/version and appends meaning audit.
- PUT `/categories/order` requires every sibling once and current versions. Parents never become children. No destructive category delete UI.
- Category filter IDs mean subtree; `direct:<parent UUID>` means only parent-direct records. `uncategorized` remains null category. The direct bucket is virtual.
- Overview remains financial-fact based; its parent totals and amount-sorted child/direct drill-down derive from existing fact composition. Evidence links use the same period and financial category scope. Bookkeeping still respects override > rule projection > source.
- Shared picker uses session-scoped recents (five), search, keyboard navigation, distinct label/chevron actions. No browser storage of financial data.
- Category invalidation additionally covers category-filtered transaction lists. Unfiltered facts, account references and session freshness remain unchanged. Hierarchy mapping uses one in-memory category index, not row-by-row API calls.

Validation status: implementation/targeted stage. Final managed browser, affected regression, exact-candidate performance and DEV integration remain pending. PROD not promoted.
