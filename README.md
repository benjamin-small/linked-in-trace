# linked-in-trace

Chrome extension that saves every LinkedIn profile you visit as a single-file
MHTML snapshot in `~/Downloads/linkedin-profiles/`, automatically and silently.
Captures only pages you personally visit — one snapshot per profile per day.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this directory.
3. Pin the extension. Click its toolbar icon to toggle capture on/off
   (badge shows `OFF` when disabled).

## How it works

On each LinkedIn profile visit the extension watches the page until its
essential content has finished loading (profile name present, then a quiet
DOM with no pending AJAX updates), auto-scrolls to force lazy sections to
load, waits for those to finish rendering too, then captures the tab with
`chrome.pageCapture.saveAsMHTML`, and saves it as
`linkedin-profiles/<slug>_<YYYY-MM-DD>.mhtml`. Badge flashes `✓` on save,
`✗` on failure (failures retry on your next visit). Open `.mhtml` files in
Chrome or Edge; text is searchable with Ctrl+F.

## Development

- `npm install` then `npm test` — unit tests (vitest) for `lib/profile.js`
  and `lib/readiness.js` (the latter run under jsdom).
- No build step: edit files, hit Reload on `chrome://extensions`.

## Spec

See `docs/superpowers/specs/2026-08-27-linkedin-capture-extension-design.md`.
