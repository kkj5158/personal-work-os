# Activity Categories

## 1. Purpose

`ActivityCategory` is the canonical user-owned category, shared across
Planning, Work Log work-time entries, the future time calendar, and future
plan-versus-actual analytics — it is not a module-specific concept, and there
is intentionally no separate category type or table per module.

## 2. Root vs. child semantics

The hierarchy is exactly two levels:

- **Root category** (`parent_id IS NULL`) — a grouping node only. A root is
  never itself assignable as a leaf category by any consumer.
- **Child category** (`parent_id IS NOT NULL`) — the assignable identity.
  Work Log, Planning, and the future time calendar are each expected to store
  only a child category's id in their own domain rows (e.g. a future
  `work_time_entries.category_id`), never a root id.

Consumer-side enforcement (e.g. rejecting a root id on `WorkTimeEntry`) is
each consumer's own responsibility, implemented in that consumer's own
vertical slice — this domain only guarantees the category data itself is
shaped correctly (a default can never be a root, see below).

## 3. `is_default` (migration `V6__add_default_child_to_activity_categories.sql`)

Each root category may designate **at most one of its own child categories**
as the default — the child a consumer should auto-select the moment its
parent is chosen (e.g. Work Log's two-level category selector).

Rules, all enforced at the database level:

- `is_default = TRUE` requires `parent_id IS NOT NULL` — a root can never be
  a default. Enforced by `chk_activity_categories_default_requires_active_child`.
- A default child must also be `is_active = TRUE` — the same CHECK constraint
  enforces this in one condition, since both columns live on the same row.
- At most one default per `(user_id, parent_id)` — enforced by the partial
  unique index `uq_activity_categories_default_child` (`WHERE is_default =
  TRUE`).

**No backfill/seed choice was made for existing rows.** The migration adds
the column with `DEFAULT FALSE`, so every pre-existing category — root or
child — simply has no default opinion recorded. No row was arbitrarily
promoted to default, and no placeholder category (e.g. a fake `기본` row) was
created. A parent may legitimately have zero default children until one is
chosen, either by the first-child-created rule below or an explicit
`PUT .../default` call.

## 4. First-child-becomes-default (creation)

`ActivityCategoryService.create`:

- A newly created **root** always receives `isDefault = false` (roots can
  never be defaults).
- A newly created **child** becomes its parent's default only if that parent
  (for the current user) has no existing default child yet — checked via
  `ActivityCategoryRepository.findByUserIdAndParentIdAndIsDefaultTrue`, scoped
  strictly to the current user and the exact parent. Every subsequent child
  under that same parent is created with `isDefault = false`.
- The existing `POST /api/activity-categories` request/response contract is
  otherwise unchanged — callers cannot supply `isDefault` directly; it is
  always derived server-side.

## 5. Set-default endpoint

`PUT /api/activity-categories/{id}/default` — no request body.

- `{id}` must belong to the current user (`CurrentUserProvider`), enforced
  the same way as every other lookup in this domain — a foreign-owned or
  missing id both return 404 (`ResourceNotFoundException`), never
  distinguishable from each other.
- The target must be a child (`parent_id IS NOT NULL`) — a root target is
  rejected with 400 (`InvalidRequestException`).
- The target must be active — an inactive target is rejected with 400.
- Already-default is idempotent: no database write happens, the current
  entity is returned as-is.
- Otherwise, the operation is transactional (`@Transactional` on
  `ActivityCategoryService.setDefault`): the previous default for the same
  `(user_id, parent_id)` (if any) is cleared and explicitly flushed
  (`saveAndFlush`) *before* the new target is marked default and saved. This
  ordering is what keeps the partial unique index from ever seeing two
  `is_default = TRUE` rows for the same `(user_id, parent_id)` at once within
  the transaction.
- Defaults under a different parent, or belonging to a different user, are
  never read or written by this operation.

No reorder/delete/bulk-default endpoint was added — those remain out of
scope. Rename and activate/deactivate were added later (Work Log MVP polish
batch) for the category-management UI — see §5a and §5b below.

## 5a. Rename endpoint

`PUT /api/activity-categories/{id}` — body `{"name": "..."}`.

- Same ownership/blank-name rules as `POST /api/activity-categories`
  (404 for missing/foreign-owned, 400 for a blank/whitespace-only name).
- Works on both root and child categories. Trims the name before persisting.
- Never touches `is_active`, `is_default`, `parent_id`, or `sort_order`.

## 5b. Activate/deactivate endpoint

`PUT /api/activity-categories/{id}/active` — body `{"isActive": true|false}`.

- Same 404 ownership rule as every other lookup in this domain.
- Activating is always side-effect-free and idempotent.
- Deactivating a category that is currently its parent's default child
  clears the default first, in the same transaction, before setting
  `is_active = FALSE` — required by
  `chk_activity_categories_default_requires_active_child`, which forbids
  `is_default = TRUE` with `is_active = FALSE` on the same row. Also
  idempotent when already inactive.
- No cascade: deactivating a root does not deactivate its children, and
  deactivating a child does not affect its parent. A consumer's own
  eligibility filtering (e.g. Work Log's `buildRootOptions`/
  `buildChildOptions`, which both already filter on `isActive`) is what
  keeps an inactive root's children from being newly selectable in
  practice, not a backend-enforced cascade.

## 6. Historical records are unaffected

Changing which child is a parent's default never rewrites any existing data
that already recorded a category selection. A future `WorkRecord` or
`work_time_entries` row is expected to keep storing only the `categoryId` the
user picked at the time — the default-child mechanism only affects what gets
auto-suggested for *new* selections going forward, exactly as it does today
in Work Log's own frontend-mock equivalent of this behavior.

## 7. Frontend status

Work Log now runs entirely on this real backend catalog (Work Log MVP
frontend integration, then the MVP polish batch's category-management UI) —
there is no mock catalog or frontend-local default-child map any more.
`frontend/app/worklog/activityCategory.ts` reads `isDefault` directly from
`GET /api/activity-categories`. `frontend/app/worklog/CategoryManagementModal.tsx`
(opened via the Work Log toolbar's "카테고리 관리" button) is the create/
rename/activate/deactivate/set-default UI, backed by
`frontend/lib/api/categories.ts`.

## 8. Next migration

Check `backend/src/main/resources/db/migration/` for the actual highest
existing `V*` file before assuming a number — this was `V7` when this
domain's own migration (`V6`) was the most recent, but later slices (e.g.
`WorkRecord`, `WorkTimeEntry`) have added more since.
