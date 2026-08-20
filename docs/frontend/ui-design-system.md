# UI Design System

> Status: Phase 1 — foundation established. Applies to Work Log going forward.
> Planning has **not** been migrated to this system yet (see Rollout Status).

## 1. Visual principles

A calm, compact, information-dense productivity interface, inspired by
GitHub Primer's product design principles — not a clone of github.com's
branding or page structures. Primer is used as a reference for density,
semantic color, typography hierarchy, borders, controls, interaction
states, and accessibility, reimplemented natively with this project's
existing Tailwind v4 stack rather than by adopting `@primer/react`.

## 2. GitHub Light semantic tokens

Defined in `frontend/app/theme.css`, imported by `frontend/app/globals.css`
right after `@import "tailwindcss";`. Values are reference approximations
of GitHub Primer's public light color scale — treat as a starting palette,
not a pixel-verified port (this was built without live network access to
diff against a specific Primer package version).

Each token is a `:root` custom property, re-exposed through a
`@theme inline` block so Tailwind generates matching utilities
(`bg-*`, `text-*`, `border-*`). This mirrors the pattern already used for
`--background`/`--foreground`, so a future dark-mode override is a pure
addition (a `prefers-color-scheme: dark` block redefining the `:root`
values), not a restructuring.

| Token | Utility prefix | Purpose |
|---|---|---|
| `canvas-default`, `canvas-subtle` | `bg-canvas-default`, `bg-canvas-subtle` | App canvas vs. subtle panel backgrounds |
| `surface-default` | `bg-surface-default` | Content surfaces (cards, panels) |
| `fg-default`, `fg-muted` | `text-fg-default`, `text-fg-muted` | Primary vs. secondary text |
| `border-default`, `border-muted` | `border-border-default`, `border-border-muted` | Default vs. subtle 1px borders |
| `primary-fg`, `primary-emphasis`, `primary-subtle` | `bg-primary-*`, `text-primary-*` | Primary actions, focus, links (blue) |
| `success-fg`, `success-emphasis`, `success-subtle` | same pattern | Success / active-work states (green) |
| `warning-fg`, `warning-emphasis`, `warning-subtle` | same pattern | Warnings (amber) |
| `danger-fg`, `danger-emphasis`, `danger-subtle` | same pattern | Destructive actions, errors (red) |
| `focus-outline` | `outline-focus-outline` / custom ring | Keyboard focus ring color |
| `row-selected-bg`, `row-selected-indicator` | `bg-row-selected-bg` | Selected table row background + left indicator |
| `control-bg`, `control-border` | `bg-control-bg`, `border-control-border` | Inputs, selects, buttons |
| `disabled-fg`, `disabled-bg`, `disabled-border` | same pattern | Disabled control states |
| `shadow-overlay` | `shadow-overlay` | The **only** approved non-trivial shadow, for modals/popovers |

Category-tagging colors (`lib/categoryColor.ts`, used by Planning) are a
**separate, non-semantic palette** for distinguishing arbitrary categories
and must not be confused with the semantic status tokens above.

## 3. Typography

- Font: **Inter**, loaded via `next/font/google` in `frontend/app/layout.tsx`,
  applied globally through `--font-sans` → `body { font-family: var(--font-sans); }`.
- Body text: primarily **14px** (`text-sm`).
- Avoid oversized headings; keep hierarchy restrained and functional.

## 4. Spacing

Primarily **4px and 8px increments** (Tailwind's default spacing scale
already expresses this — `p-1`=4px, `p-2`=8px, etc.). No arbitrary
one-off spacing values.

## 5. Radius

**6px** as the primary radius. Tailwind's default `rounded-md` utility is
already exactly 6px, so no custom radius token was needed — use
`rounded-md` as the standard control/surface radius. Avoid oversized
radius values (no `rounded-xl`/`rounded-2xl`/"large rounded card" styling).

## 6. Shadows

Restrained. `--shadow-overlay` is the one sanctioned non-trivial shadow,
reserved for modals and popovers (overlay content that must visually
separate from the page). Inline surfaces should rely on
`border-border-default`/`border-border-muted`, not shadow, for separation.

## 7. Components and interaction states

Shared primitives live in `frontend/components/ui/`. Every interactive
component must define, where applicable:

- **Default**
- **Hover**
- **Active**
- **Focus** (see §8)
- **Disabled** (`disabled-fg`/`disabled-bg`/`disabled-border`)
- **Loading**
- **Destructive** (`danger-*` tokens, reserved for irreversible actions)

## 8. Focus-visible requirement

All interactive elements must show a visible focus indicator using
`focus-outline` (blue) when navigated via keyboard. Prefer
`:focus-visible` scoping so mouse clicks don't trigger the ring
unnecessarily.

## 9. Desktop viewport policy

- Primary target: **1280px and above**.
- Minimum supported width: **1024px**.
- Mobile-specific layout and testing are out of scope for this system in
  its current phase.

## 10. Prohibited patterns

- Gradients
- Glassmorphism / glass effects
- Oversized headings
- Excessive whitespace
- Large rounded cards
- Heavy shadows
- Decorative dashboard styling
- One-off colors and arbitrary spacing (always use the tokens above or
  Tailwind's default scale)
- Wrapping every section in its own visual card

## 11. Icons

Icon library: **`@primer/octicons-react`** (approved, installed).

- Default size: **16px**.
- Larger sizes only where semantically justified (e.g. an empty-state
  illustration, not a routine inline icon).
- Icon-only controls must have an accessible label (`aria-label` on the
  control, and/or a `title`/tooltip for sighted users).
- The existing Sidebar's emoji-glyph icons are **not** replaced in this
  phase — that migration is deferred; do not assume Octicons are in use
  there yet.

## 12. Rollout status

| Area | Status |
|---|---|
| Work Log | Approved baseline for new UI (Phase 1: tokens + font + Octicons established; page implementation not yet built) |
| Planning | **Not migrated.** Still on the pre-existing zinc-based ad hoc styling. Font rendering changed (Inter now applies globally — see verification notes), but no Planning component was restyled or restructured. |
| Sidebar | Font rendering changed globally (same as Planning); collapse/expand, persistence, and all existing behavior unchanged. |

## 13. Open business rules (not UI blockers)

The following are **not yet defined** and must not be hardcoded into any
UI built against this system. They are recorded here so static UI work
(e.g. Work Log) can proceed without them, deferring the actual logic to
a later data-integration phase:

- The source and threshold used to calculate lateness.
- The rule used to determine early leave.
- Whether early leave counts toward weekly workdays.
- Whether lateness or early leave affects the work score.
