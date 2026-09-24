# Personal OS desktop installation

`frontend/app/manifest.ts` uses Next.js 16 App Router metadata routing and serves
`/manifest.webmanifest`. Personal OS has stable app ID `/`, start URL `/worklog`, root
scope, `display: standalone`, and light shell colors. The root layout links the
manifest, application title, viewport theme and Apple standalone metadata.

The 192px and 512px PNG icons (plus 180px Apple icon and 32px browser favicon) are deterministic resized
derivatives of the existing approved `public/brand/personal-work-os-crow.png`.
The source is 236px square; the 512px derivative is an upscale of that identity,
not a replacement logo. Only these exact public icon paths and manifest are
excluded from the production login proxy. All application routes retain the
existing authentication gate and preserve a safe return path and query context.

Serve the app over HTTPS (localhost is suitable for development). Chrome and
Edge can install it through their browser app/install menus. Installation UI can
vary by browser policy and engagement; no automatic prompt is assumed.

No service worker, offline API cache, background sync or push subscription is
registered. This is intentional: modern Edge does not require a service worker
for installation, and Chrome removed the fetch-handler requirement for desktop
menu installation in version 112. Online domain persistence remains unchanged.
Global Tabs provides navigation inside the standalone window, while root scope
includes WORK OS, NOTE SYS, LIFE CODE, Calendar and login.

References verified September 2026:

- [Next.js manifest convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest)
- [Microsoft Edge PWA development](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/)
- [Chrome installability criteria](https://developer.chrome.com/blog/update-install-criteria)

## Independent windows and document revisions

The shell has a visible **새 창에서 열기 / Open in new window** action and the
same command in each tab menu. It opens a new top-level window with the current
allowlisted route context (including Workpad date, Calendar date/view/mode and
NOTE document/workspace), using `noopener` to isolate its browsing context.
The manifest requests `launch_handler.client_mode: navigate-new` so supporting
installed browsers create a new client for launches. Browser policy controls
whether the new window uses installed-app chrome or browser popup chrome; the
application does not reuse an existing editing window. Shell tabs are stored per
window in sessionStorage, while authentication and saved preferences remain shared.

`frontend/lib/windowSync.ts` publishes `{entityType, entityId, revision,
windowInstanceId, eventId}` after acknowledged saves. BroadcastChannel and a
storage-event fallback carry metadata only; receivers retrieve authoritative
server data. Same-window main/dock editors receive the same notifications.
Focus/visibility refresh closes gaps after suspended windows or restricted
storage. No hard editing lock or synchronized caret/selection is introduced.

Workpad compares the saved base, current local draft and fetched remote blocks
by stable ID. Non-overlapping edits merge; incompatible edits and ambiguous
concurrent structural changes preserve the complete local draft for explicit
resolution. Shared NOTE editors refresh clean documents, rebase metadata-only
changes, and retain conflicting bodies with Keep my changes / Load latest /
Compare and downloadable recovery. Every save still uses the server revision.
