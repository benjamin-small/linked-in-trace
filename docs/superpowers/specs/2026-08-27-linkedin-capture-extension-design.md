# linked-in-trace — LinkedIn Profile → MHTML Chrome Extension

**Date:** 2026-08-27
**Status:** Approved design (revised same day: MHTML via `pageCapture` replaces
PDF via `debugger`, per user review. Revised 2026-08-28: fixed settle delays
replaced by readiness watches after a real capture froze mid-hydration.)

## Purpose

A personal-archive Chrome extension. Every time the user visits a LinkedIn
profile page in their own browser, the extension saves that profile as a
single-file MHTML snapshot to disk, silently and automatically. It captures
only pages the user personally navigates to; it makes no requests of its own
beyond what the user's normal browsing (including scrolling) would trigger.

## Decisions (settled with the user)

| Question | Decision |
|---|---|
| Capture format | Single-file MHTML via `chrome.pageCapture.saveAsMHTML`. No debugger attach, so no "debugging this browser" banner. Full page text is preserved and searchable in-browser. Accepted trade-off: `.mhtml` opens mainly in Chromium browsers (Chrome/Edge) — less portable than PDF. *(Revision of the original PDF/debugger decision.)* |
| Save location | `~/Downloads/linkedin-profiles/` via `chrome.downloads` (extensions cannot write outside Downloads without a native host — out of scope) |
| Capture depth | Watch the page until essential content has loaded (readiness watch, below), auto-scroll so lazy-loaded sections (and their images) render, wait for the resulting updates to finish, then capture. *(Revision of the original fixed-delay settles.)* |
| Revisit policy | Once per profile per calendar day (local time); failed captures do not count and retry on next visit |

## Architecture

Manifest V3 extension, vanilla ES-module JavaScript, no bundler, no runtime
dependencies, loaded unpacked. One background service worker orchestrates
everything; a scroll routine is injected on demand with `chrome.scripting`
(no persistent content script).

### manifest.json

- `manifest_version`: 3
- `permissions`: `pageCapture`, `downloads`, `storage`, `scripting`, `webNavigation`
- `host_permissions`: `https://*.linkedin.com/*` (covers `www.` and regional
  subdomains like `de.linkedin.com`)
- `background`: `{ "service_worker": "background.js", "type": "module" }`
- `action`: present (needed for badge + toggle); no popup. Custom icons are a
  non-goal; the default icon is fine for a personal tool.

### Components

1. **`background.js`** — event wiring and the capture pipeline (Chrome API
   calls live here, kept thin).
2. **`lib/profile.js`** — pure, unit-tested logic with no Chrome APIs:
   - `profileSlugFromUrl(url)` → slug string or `null`. Accepts only main
     profile pages: pathname matching `^/in/<slug>/?$` on any `*.linkedin.com`
     host. Rejects subpages (`/in/jane/details/experience/`,
     `/in/jane/overlay/...`), other sections (`/feed/`, `/company/...`), and
     non-LinkedIn hosts. Ignores query string and hash.
   - `sanitizeSlug(slug)` → filesystem-safe name: percent-decoded, forbidden
     filename characters (`\ / : * ? " < > |` and control chars) replaced with
     `-`, runs of `-` collapsed, trimmed to 100 chars. Unicode letters are
     kept (LinkedIn slugs can contain them; filesystems and
     `chrome.downloads` handle them).
   - `captureFilename(slug, date)` → `linkedin-profiles/<slug>_YYYY-MM-DD.mhtml`.
   - `localDateString(date)` → `YYYY-MM-DD` in local time.
   - `shouldCapture(slug, savedMap, todayString)` → boolean (dedup rule).
3. **`lib/readiness.js`** — `waitForProfileReady({selector, quietMs, timeoutMs})`,
   the readiness watch injected into the page. Optionally waits for an
   essential element with non-empty text (the profile name, `main h1`), then
   uses a `MutationObserver` on `<main>` (body fallback) and resolves once no
   childList/characterData mutations occur for `quietMs` (attributes are
   ignored — animation class churn must not stall it). Returns
   `{ready:false}` at `timeoutMs`; capture proceeds anyway (login-wall
   policy). Fully self-contained (serialized by `chrome.scripting`); unit
   tests rebuild it from its own source to enforce this, under jsdom.

## Capture pipeline

Trigger: `chrome.webNavigation.onCompleted` **and**
`onHistoryStateUpdated` (LinkedIn is an SPA — profile-to-profile navigation
never reloads the page), both filtered to `{ hostSuffix: 'linkedin.com', pathPrefix: '/in/' }`.

For each event:

1. **Gate.** Skip unless: extension is enabled, URL parses to a slug, the
   slug passes `shouldCapture` against the stored map, and no capture for
   `${tabId}:${slug}` is already in flight (an in-memory Set absorbs the
   duplicate events LinkedIn's SPA fires for one navigation; captures are
   short-lived so in-memory is sufficient even though the service worker is
   ephemeral).
2. **Wait until ready.** Yield ~0.5 s so the SPA route swap begins, verify
   the tab still shows the same slug (abort silently if not), then run the
   readiness watch: profile name present, then DOM quiet for ~600 ms, capped
   at 12 s (a cap expiry logs and proceeds). Re-verify the slug.
3. **Auto-scroll.** `chrome.scripting.executeScript` injects an async
   function: step down by ~80% of the viewport every ~300 ms until the
   scroll height stops growing and the bottom is reached, hard cap 30 s,
   then restore the original scroll position. This is what forces lazy
   sections and images into the DOM so the MHTML contains them. Expanding
   "see more" buttons is out of scope.
4. **Wait until ready again** — the scroll just triggered lazy loads; run the
   readiness watch with no selector (DOM quiet ~750 ms, capped at 10 s);
   re-verify the slug.
5. **Capture.** `chrome.pageCapture.saveAsMHTML({ tabId })` → MHTML `Blob`
   of the page as currently rendered. No debugger, no banner.
6. **Save.** MV3 service workers cannot use `URL.createObjectURL`, so:
   `blob.arrayBuffer()` → chunked base64 encoding → `data:` URL →
   `chrome.downloads.download` with
   `filename: linkedin-profiles/<slug>_<date>.mhtml`,
   `saveAs: false`, `conflictAction: 'uniquify'`.
7. **Record.** On success only: write `slug → date` into
   `chrome.storage.local` and flash a per-tab badge `✓` for ~3 s. On any
   failure: badge `✗`, log the error to the service-worker console, do
   **not** record — the profile retries on the next qualifying visit.

## Storage schema (`chrome.storage.local`)

- `enabled`: boolean, default `true`.
- `savedProfiles`: `{ [slug]: "YYYY-MM-DD" }` — raw (unsanitized) slug as
  key, last successful save date as value.

## Controls / UX

- Clicking the toolbar icon toggles `enabled`; when disabled the badge shows
  `OFF` persistently. No popup, no options page.
- Feedback is badge-only (`✓` / `✗` / `OFF`). No notifications.

## Error handling

- Whole pipeline wrapped per-capture; any throw → badge `✗`, log, release
  in-flight guard.
- Navigation away or tab close mid-capture aborts that capture; nothing is
  recorded.
- If LinkedIn serves a login wall or error page at a profile URL, that is
  what gets captured — content detection is a non-goal.
- Known risk: MHTML inlines every image, so files run larger than PDFs
  (often several MB), and they travel through a base64 `data:` URL to the
  downloads API. If very large captures ever fail in practice, the
  documented fallback is an offscreen document creating a blob URL — not
  built in v1.

## File layout

```
manifest.json
background.js
lib/profile.js
lib/readiness.js
tests/profile.test.js
tests/readiness.test.js
package.json          # dev-only: vitest + jsdom
docs/superpowers/specs/2026-08-27-linkedin-capture-extension-design.md
```

## Testing

- **Unit (vitest):** `lib/profile.js` — URL variants (trailing slash, query
  string, hash, regional hosts, percent-encoded/unicode slugs, detail and
  overlay subpaths rejected, non-profile paths rejected), slug sanitization
  edge cases, filename format (`.mhtml`), dedup logic across day boundaries.
- **Unit (vitest + jsdom):** `lib/readiness.js` — resolves on quiet DOM,
  holds while mutations continue, `ready:false` at the cap, late-appearing
  selector, body fallback, and serialization self-containment.
- **Manual E2E checklist (load unpacked):** first visit saves an `.mhtml`
  file to `Downloads/linkedin-profiles/` with the correct name; opening it
  in Chrome shows the full profile including below-the-fold sections and
  images, with text findable via Ctrl+F; same-day revisit does not save;
  SPA navigation between two profiles saves both exactly once; toggle OFF
  suppresses capture and shows badge; navigating away mid-scroll aborts
  cleanly; no debugger banner appears at any point.

## Out of scope (v1)

PDF export (open the MHTML in Chrome and print if ever needed),
debugger-based capture, arbitrary save directories (native messaging host),
expanding "see more"/collapsed sections, capturing profile detail subpages,
retry queues, options UI, notifications, Firefox/Safari ports, custom icons,
any scraping or crawling of pages the user did not visit.
