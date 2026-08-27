# linked-in-trace — LinkedIn Profile → PDF Chrome Extension

**Date:** 2026-08-27
**Status:** Approved design

## Purpose

A personal-archive Chrome extension. Every time the user visits a LinkedIn
profile page in their own browser, the extension saves that profile as a
searchable PDF to disk, silently and automatically. It captures only pages the
user personally navigates to; it makes no requests of its own beyond what the
user's normal browsing (including scrolling) would trigger.

## Decisions (settled with the user)

| Question | Decision |
|---|---|
| PDF type | Real searchable/text PDF via `chrome.debugger` + `Page.printToPDF` (accepting the brief "debugging this browser" banner during capture) |
| Save location | `~/Downloads/linkedin-profiles/` via `chrome.downloads` (extensions cannot write outside Downloads without a native host — out of scope) |
| Capture depth | Auto-scroll the page first so lazy-loaded sections render, then capture |
| Revisit policy | Once per profile per calendar day (local time); failed captures do not count and retry on next visit |

## Architecture

Manifest V3 extension, vanilla ES-module JavaScript, no bundler, no runtime
dependencies, loaded unpacked. One background service worker orchestrates
everything; a scroll routine is injected on demand with `chrome.scripting`
(no persistent content script).

### manifest.json

- `manifest_version`: 3
- `permissions`: `debugger`, `downloads`, `storage`, `scripting`, `webNavigation`
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
   - `pdfFilename(slug, date)` → `linkedin-profiles/<slug>_YYYY-MM-DD.pdf`.
   - `localDateString(date)` → `YYYY-MM-DD` in local time.
   - `shouldCapture(slug, savedMap, todayString)` → boolean (dedup rule).

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
2. **Settle.** Wait ~1.5 s, then verify the tab still shows the same slug
   (user may have navigated on). Abort silently if not.
3. **Auto-scroll.** `chrome.scripting.executeScript` injects an async
   function: step down by ~80% of the viewport every ~300 ms until the
   scroll height stops growing and the bottom is reached, hard cap 30 s,
   then restore the original scroll position. Expanding "see more" buttons
   is out of scope.
4. **Settle again** ~1 s; re-verify the slug.
5. **Print.** `chrome.debugger.attach(tab, "1.3")` →
   `Page.printToPDF { printBackground: true, paperWidth: 8.5, paperHeight: 11, margins ≈ 0.4in }`
   → base64 result → `chrome.debugger.detach` in a `finally` (the debugger
   must never stay attached). This is the moment the banner shows.
6. **Save.** `chrome.downloads.download` with
   `url: data:application/pdf;base64,...`,
   `filename: linkedin-profiles/<slug>_<date>.pdf`,
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
  in-flight guard, detach debugger if attached.
- Navigation away or tab close mid-capture aborts that capture; nothing is
  recorded.
- If LinkedIn serves a login wall or error page at a profile URL, that is
  what gets captured — content detection is a non-goal.
- Known risk: very large PDFs as `data:` URLs. Profile PDFs are typically
  well under 5 MB, which is fine. If this ever fails in practice, the
  documented fallback is an offscreen document creating a blob URL — not
  built in v1.

## File layout

```
manifest.json
background.js
lib/profile.js
tests/profile.test.js
package.json          # dev-only: vitest
docs/superpowers/specs/2026-08-27-linkedin-pdf-extension-design.md
```

## Testing

- **Unit (vitest):** `lib/profile.js` — URL variants (trailing slash, query
  string, hash, regional hosts, percent-encoded/unicode slugs, detail and
  overlay subpaths rejected, non-profile paths rejected), slug sanitization
  edge cases, filename format, dedup logic across day boundaries.
- **Manual E2E checklist (load unpacked):** first visit saves a PDF to
  `Downloads/linkedin-profiles/` with correct name and searchable text;
  same-day revisit does not save; SPA navigation between two profiles saves
  both exactly once; toggle OFF suppresses capture and shows badge; navigating
  away mid-scroll aborts cleanly; PDF includes below-the-fold sections.

## Out of scope (v1)

Arbitrary save directories (native messaging host), expanding "see
more"/collapsed sections, capturing profile detail subpages, retry queues,
options UI, notifications, Firefox/Safari ports, custom icons, any scraping
or crawling of pages the user did not visit.
