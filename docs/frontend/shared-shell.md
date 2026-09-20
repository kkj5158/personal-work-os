# Orbit shared shell

The system order is WORK OS, NOTE SYS, LIFE CODE, Calendar. The shared
`SystemSwitcher` owns identity and menu styling in `frontend/app/shell.css`.
LIFE CODE is a user-facing identity; existing LIFE domain identifiers remain valid.

AUTHORING also participates as an independent top-level system in SystemSwitcher
and Global Tabs. `/authoring/{program}/session/{id}`, `/full`, and `/report` share
one session tab identity. The runner flushes the existing serialized autosave
queue through `useShellNavigationGuard`; failed saves retain the current route
and local input. See [Authoring V1](../contracts/authoring-v1.md).

## Global Tabs V1

`GlobalTabsProvider` lives in the root layout. It renders one route tree and a
shared tab bar; inactive pages are not kept mounted. `orbit.globalTabs.v1` in local
app preference storage stores version, ordered tabs and active tab ID. Each tab
stores a generated stable ID, system, route, title and logical context key.
Storage is local to the browser and is not a cross-device content store.

Only supported application paths and allowlisted route parameters are restored:
WORK date; NOTE workspace/workspaceName, note, module, date and tag; Calendar
date/view/mode; LIFE category management. Document content, reference excerpts,
selection, cursor, modal and hover state are excluded. A refresh restores the
existing tab matching its URL; a different explicit deep link opens its target.
Opening the same workspace/document focuses its existing tab even if module
query context differs. Ordinary sidebar navigation replaces the active context.

The plus button opens a system in a new tab. Ctrl/Cmd-click on a system or shared
sidebar target also opens a new tab. Tabs support close, horizontal overflow and
pointer/keyboard drag ordering (Space, arrow keys, Space). Closing the last tab
returns to WORK OS. Tab order is persisted once on drop.

Domain pages register their existing leave operation through
`useShellNavigationGuard(proceed => ...)`. The shell changes route and active tab
only inside that continuation. Calendar registers `editor.leave`, retaining its
Actual save/discard/continue modal and Planning autosave; NOTE flushes existing
autosave queues before calling `proceed`. A cancelled or failed leave cannot close
the active tab or change system. Inactive tabs have no live editor to flush.
`useGlobalTabs().setTitle(title)` supplies document/workspace labels without
changing logical identity.
