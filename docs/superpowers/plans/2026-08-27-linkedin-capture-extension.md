# linked-in-trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Manifest V3 Chrome extension that silently saves every LinkedIn profile the user visits as an MHTML snapshot in `~/Downloads/linkedin-profiles/`, once per profile per day.

**Architecture:** One background service worker listens for LinkedIn profile navigations (full loads and SPA history updates), gates them through a dedup map in `chrome.storage.local`, injects an auto-scroll routine so lazy sections render, captures the tab with `chrome.pageCapture.saveAsMHTML`, and saves via `chrome.downloads`. All pure logic (URL parsing, sanitization, filenames, dedup) lives in `lib/profile.js` and is unit-tested with vitest.

**Tech Stack:** Vanilla ES-module JavaScript, Chrome MV3 extension APIs, vitest (dev-only). No bundler, no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-27-linkedin-capture-extension-design.md`

## Global Constraints

- Manifest V3; background is `{ "service_worker": "background.js", "type": "module" }`.
- Permissions exactly: `pageCapture`, `downloads`, `storage`, `scripting`, `webNavigation`. Host permissions exactly: `https://*.linkedin.com/*`. **No `debugger` permission anywhere.**
- No runtime dependencies; `package.json` is dev-only (vitest). No bundler or build step — files load as-is via "Load unpacked".
- Saved files: `linkedin-profiles/<sanitized-slug>_<YYYY-MM-DD>.mhtml` (date in local time), `saveAs: false`, `conflictAction: 'uniquify'`.
- Dedup: one capture per raw slug per local calendar day; failures must NOT be recorded (so they retry on next visit).
- Only main profile pages count: pathname `^/in/<slug>/?$` on `https` `*.linkedin.com` hosts. Subpages (`/details/`, `/overlay/`), other sections, other hosts: ignored.
- `lib/profile.js` must contain no Chrome API references — it runs in Node under vitest.
- Storage schema: `enabled` (boolean, default `true`), `savedProfiles` (`{ [rawSlug]: "YYYY-MM-DD" }`).

**Manual-verification note:** Tasks 5–7 include steps marked **[Manual — requires Chrome]**. If the executor has no browser access, perform every automated step (syntax checks, unit tests, commits) and report the manual steps as pending for the human to run.

---

### Task 1: Project scaffolding + `profileSlugFromUrl` (TDD)

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `lib/profile.js`
- Test: `tests/profile.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `profileSlugFromUrl(url: string) -> string | null` — returns the raw (still percent-encoded) slug for main profile pages, else `null`. Exported from `lib/profile.js` as a named ES-module export. Later tasks add more exports to this same file.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "linked-in-trace",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 3: Install dev dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors. (`package-lock.json` appears; it gets committed.)

- [ ] **Step 4: Write the failing test**

Create `tests/profile.test.js`:

```js
import { describe, it, expect } from "vitest";
import { profileSlugFromUrl } from "../lib/profile.js";

describe("profileSlugFromUrl", () => {
  it("extracts the slug from a standard profile URL", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/in/jane-doe/")).toBe("jane-doe");
  });

  it("accepts a URL without trailing slash", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/in/jane-doe")).toBe("jane-doe");
  });

  it("ignores query string and hash", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/in/jane-doe?originalSubdomain=uk#about")).toBe("jane-doe");
  });

  it("accepts regional subdomains", () => {
    expect(profileSlugFromUrl("https://de.linkedin.com/in/jane-doe/")).toBe("jane-doe");
  });

  it("accepts the bare linkedin.com host", () => {
    expect(profileSlugFromUrl("https://linkedin.com/in/jane-doe")).toBe("jane-doe");
  });

  it("returns the slug still percent-encoded", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/in/%C3%A9lodie-durand/")).toBe("%C3%A9lodie-durand");
  });

  it("rejects detail subpages", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/in/jane-doe/details/experience/")).toBeNull();
  });

  it("rejects overlay subpages", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/in/jane-doe/overlay/about-this-profile/")).toBeNull();
  });

  it("rejects non-profile sections", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/feed/")).toBeNull();
    expect(profileSlugFromUrl("https://www.linkedin.com/company/acme/")).toBeNull();
  });

  it("rejects an empty slug", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/in/")).toBeNull();
  });

  it("rejects non-LinkedIn hosts, including suffix look-alikes", () => {
    expect(profileSlugFromUrl("https://evil.com/in/jane-doe")).toBeNull();
    expect(profileSlugFromUrl("https://notlinkedin.com/in/jane-doe")).toBeNull();
  });

  it("rejects non-https schemes", () => {
    expect(profileSlugFromUrl("http://www.linkedin.com/in/jane-doe")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(profileSlugFromUrl("not a url")).toBeNull();
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../lib/profile.js` (file does not exist yet).

- [ ] **Step 6: Write the minimal implementation**

Create `lib/profile.js`:

```js
// Pure logic for linked-in-trace. No Chrome APIs here — this file runs in
// Node under vitest exactly as it runs in the service worker.

const PROFILE_PATH_RE = /^\/in\/([^/]+)\/?$/;

export function profileSlugFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname;
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  const match = PROFILE_PATH_RE.exec(parsed.pathname);
  return match ? match[1] : null;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 13 tests, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore lib/profile.js tests/profile.test.js
git commit -m "feat: scaffold project and add profileSlugFromUrl with tests"
```

---

### Task 2: `sanitizeSlug` (TDD)

**Files:**
- Modify: `lib/profile.js` (append)
- Test: `tests/profile.test.js` (append)

**Interfaces:**
- Consumes: nothing from other functions.
- Produces: `sanitizeSlug(slug: string) -> string` — percent-decodes, replaces filename-forbidden characters with `-`, collapses `-` runs, strips edge `-`, caps at 100 chars, falls back to `"profile"` if empty. Named export from `lib/profile.js`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/profile.test.js` (add `sanitizeSlug` to the existing import):

```js
import { profileSlugFromUrl, sanitizeSlug } from "../lib/profile.js";
```

```js
describe("sanitizeSlug", () => {
  it("passes ordinary slugs through unchanged", () => {
    expect(sanitizeSlug("jane-doe-123abc")).toBe("jane-doe-123abc");
  });

  it("percent-decodes, keeping unicode letters", () => {
    expect(sanitizeSlug("%C3%A9lodie-durand")).toBe("élodie-durand");
  });

  it("decodes %20 to a plain space", () => {
    expect(sanitizeSlug("jane%20doe")).toBe("jane doe");
  });

  it("replaces filename-forbidden characters with hyphens and collapses runs", () => {
    expect(sanitizeSlug('a<b>|c')).toBe("a-b-c");
    expect(sanitizeSlug("a??b")).toBe("a-b");
    expect(sanitizeSlug("a/b\\c:d")).toBe("a-b-c-d");
  });

  it("strips leading and trailing hyphens produced by cleaning", () => {
    expect(sanitizeSlug("<jane>")).toBe("jane");
  });

  it("caps the result at 100 characters", () => {
    expect(sanitizeSlug("x".repeat(150))).toBe("x".repeat(100));
  });

  it("keeps malformed percent-encoding as-is instead of throwing", () => {
    expect(sanitizeSlug("%E0%A4%A")).toBe("%E0%A4%A");
  });

  it("falls back to 'profile' when nothing survives cleaning", () => {
    expect(sanitizeSlug("<<>>")).toBe("profile");
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test`
Expected: FAIL — `sanitizeSlug` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `lib/profile.js`:

```js
export function sanitizeSlug(slug) {
  let decoded;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    decoded = slug; // malformed percent-encoding: keep as-is
  }
  const cleaned = decoded
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 100) || "profile";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 21 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add lib/profile.js tests/profile.test.js
git commit -m "feat: add sanitizeSlug for filesystem-safe names"
```

---

### Task 3: `localDateString` + `captureFilename` (TDD)

**Files:**
- Modify: `lib/profile.js` (append)
- Test: `tests/profile.test.js` (append)

**Interfaces:**
- Consumes: `sanitizeSlug` from Task 2.
- Produces: `localDateString(date: Date) -> string` (`YYYY-MM-DD`, local time) and `captureFilename(slug: string, date: Date) -> string` (`linkedin-profiles/<sanitized>_<date>.mhtml`). Named exports from `lib/profile.js`.

- [ ] **Step 1: Write the failing tests**

Update the import in `tests/profile.test.js`:

```js
import { profileSlugFromUrl, sanitizeSlug, localDateString, captureFilename } from "../lib/profile.js";
```

Append:

```js
describe("localDateString", () => {
  it("zero-pads month and day", () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("handles end-of-year dates", () => {
    expect(localDateString(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("captureFilename", () => {
  it("builds the full relative download path", () => {
    expect(captureFilename("jane-doe", new Date(2026, 7, 27))).toBe(
      "linkedin-profiles/jane-doe_2026-08-27.mhtml"
    );
  });

  it("sanitizes the slug (decoding percent-escapes)", () => {
    expect(captureFilename("%C3%A9lodie-durand", new Date(2026, 7, 27))).toBe(
      "linkedin-profiles/élodie-durand_2026-08-27.mhtml"
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test`
Expected: FAIL — `localDateString` / `captureFilename` are not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `lib/profile.js`:

```js
export function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function captureFilename(slug, date) {
  return `linkedin-profiles/${sanitizeSlug(slug)}_${localDateString(date)}.mhtml`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 25 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add lib/profile.js tests/profile.test.js
git commit -m "feat: add localDateString and captureFilename"
```

---

### Task 4: `shouldCapture` dedup rule (TDD)

**Files:**
- Modify: `lib/profile.js` (append)
- Test: `tests/profile.test.js` (append)

**Interfaces:**
- Consumes: nothing from other functions.
- Produces: `shouldCapture(slug: string, savedMap: Record<string,string> | undefined, todayString: string) -> boolean`. Keys of `savedMap` are RAW slugs (as returned by `profileSlugFromUrl`, not sanitized). Named export from `lib/profile.js`.

- [ ] **Step 1: Write the failing tests**

Update the import in `tests/profile.test.js`:

```js
import { profileSlugFromUrl, sanitizeSlug, localDateString, captureFilename, shouldCapture } from "../lib/profile.js";
```

Append:

```js
describe("shouldCapture", () => {
  it("captures a never-seen profile", () => {
    expect(shouldCapture("jane-doe", {}, "2026-08-27")).toBe(true);
  });

  it("skips a profile already saved today", () => {
    expect(shouldCapture("jane-doe", { "jane-doe": "2026-08-27" }, "2026-08-27")).toBe(false);
  });

  it("captures again on a later day", () => {
    expect(shouldCapture("jane-doe", { "jane-doe": "2026-08-26" }, "2026-08-27")).toBe(true);
  });

  it("tolerates a missing map", () => {
    expect(shouldCapture("jane-doe", undefined, "2026-08-27")).toBe(true);
  });

  it("keys on the raw slug, not a sanitized variant", () => {
    expect(shouldCapture("%C3%A9lodie", { "élodie": "2026-08-27" }, "2026-08-27")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test`
Expected: FAIL — `shouldCapture` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `lib/profile.js`:

```js
export function shouldCapture(slug, savedMap, todayString) {
  return (savedMap ?? {})[slug] !== todayString;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 30 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add lib/profile.js tests/profile.test.js
git commit -m "feat: add shouldCapture once-per-day dedup rule"
```

---

### Task 5: Manifest + service-worker skeleton with toggle and badges

**Files:**
- Create: `manifest.json`
- Create: `background.js`

**Interfaces:**
- Consumes: nothing from `lib/profile.js` yet (imports arrive in Task 6).
- Produces: a loadable extension whose toolbar button toggles `enabled` in `chrome.storage.local` and shows an `OFF` badge when disabled. `background.js` defines `updateGlobalBadge(enabled)` and `flashBadge(tabId, text)`, which Task 6's pipeline calls.

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "linked-in-trace",
  "version": "1.0.0",
  "description": "Saves every LinkedIn profile you visit as an MHTML snapshot in Downloads/linkedin-profiles/.",
  "permissions": ["pageCapture", "downloads", "storage", "scripting", "webNavigation"],
  "host_permissions": ["https://*.linkedin.com/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_title": "linked-in-trace: click to toggle capture" }
}
```

- [ ] **Step 2: Create `background.js` (skeleton: state + toggle + badges)**

```js
const BADGE_FLASH_MS = 3000;

chrome.runtime.onInstalled.addListener(async () => {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  await chrome.storage.local.set({ enabled });
  await updateGlobalBadge(enabled);
});

chrome.runtime.onStartup.addListener(async () => {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  await updateGlobalBadge(enabled);
});

chrome.action.onClicked.addListener(async () => {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  const next = !enabled;
  await chrome.storage.local.set({ enabled: next });
  await updateGlobalBadge(next);
});

async function updateGlobalBadge(enabled) {
  await chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
}

async function flashBadge(tabId, text) {
  try {
    await chrome.action.setBadgeText({ tabId, text });
    // If the service worker is killed before this fires, the per-tab badge
    // clears on the tab's next navigation anyway — cosmetic only.
    setTimeout(async () => {
      try {
        await chrome.action.setBadgeText({ tabId, text: "" });
      } catch {
        // tab gone; nothing to clear
      }
    }, BADGE_FLASH_MS);
  } catch {
    // tab gone before we could set the badge
  }
}
```

- [ ] **Step 3: Syntax-check the worker**

Run: `node --check background.js`
Expected: no output, exit code 0. (Parses only — `chrome` globals are fine.)

- [ ] **Step 4: [Manual — requires Chrome] Load and verify the toggle**

1. Open `chrome://extensions`, enable Developer mode, click "Load unpacked", select the repo directory.
2. Expected: extension loads with no errors; clicking "service worker" shows an empty console (no exceptions).
3. Pin the extension. Click its toolbar icon → badge shows `OFF`. Click again → badge clears.

- [ ] **Step 5: Commit**

```bash
git add manifest.json background.js
git commit -m "feat: add MV3 manifest and service worker with enable toggle"
```

---

### Task 6: Capture pipeline (navigation → scroll → MHTML → download → record)

**Files:**
- Modify: `background.js` (add imports at top; append pipeline below the Task 5 code)

**Interfaces:**
- Consumes: `profileSlugFromUrl`, `captureFilename`, `localDateString`, `shouldCapture` from `lib/profile.js`; `updateGlobalBadge` / `flashBadge` from Task 5.
- Produces: the complete working extension. No later code consumes this.

- [ ] **Step 1: Add imports at the very top of `background.js`**

```js
import {
  profileSlugFromUrl,
  captureFilename,
  localDateString,
  shouldCapture,
} from "./lib/profile.js";
```

- [ ] **Step 2: Append the pipeline to `background.js`**

```js
const SETTLE_AFTER_NAV_MS = 1500;
const SETTLE_AFTER_SCROLL_MS = 1000;

// Absorbs the duplicate events LinkedIn's SPA fires for one navigation.
// In-memory is sufficient: captures are short-lived relative to worker life.
const inFlight = new Set();

const navFilter = { url: [{ hostSuffix: "linkedin.com", pathPrefix: "/in/" }] };
chrome.webNavigation.onCompleted.addListener(onProfileNavigation, navFilter);
chrome.webNavigation.onHistoryStateUpdated.addListener(onProfileNavigation, navFilter);

async function onProfileNavigation({ tabId, url, frameId }) {
  if (frameId !== 0) return; // main frame only
  const slug = profileSlugFromUrl(url);
  if (!slug) return;

  const { enabled, savedProfiles } = await chrome.storage.local.get({
    enabled: true,
    savedProfiles: {},
  });
  if (!enabled) return;
  if (!shouldCapture(slug, savedProfiles, localDateString(new Date()))) return;

  const key = `${tabId}:${slug}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    await captureProfile(tabId, slug);
  } catch (err) {
    console.error(`linked-in-trace: capture failed for ${slug}:`, err);
    await flashBadge(tabId, "✗");
  } finally {
    inFlight.delete(key);
  }
}

async function captureProfile(tabId, slug) {
  await sleep(SETTLE_AFTER_NAV_MS);
  if (!(await tabStillOnProfile(tabId, slug))) return;

  await chrome.scripting.executeScript({ target: { tabId }, func: autoScrollPage });

  await sleep(SETTLE_AFTER_SCROLL_MS);
  if (!(await tabStillOnProfile(tabId, slug))) return;

  const blob = await chrome.pageCapture.saveAsMHTML({ tabId });
  const dataUrl = await blobToDataUrl(blob);

  const now = new Date();
  await chrome.downloads.download({
    url: dataUrl,
    filename: captureFilename(slug, now),
    saveAs: false,
    conflictAction: "uniquify",
  });

  // Success only: record so failures retry on the next visit.
  const { savedProfiles } = await chrome.storage.local.get({ savedProfiles: {} });
  savedProfiles[slug] = localDateString(now);
  await chrome.storage.local.set({ savedProfiles });
  await flashBadge(tabId, "✓");
}

async function tabStillOnProfile(tabId, slug) {
  try {
    const tab = await chrome.tabs.get(tabId);
    // tab.url is visible to us only on *.linkedin.com (host_permissions);
    // elsewhere it is undefined, which correctly reads as "navigated away".
    return profileSlugFromUrl(tab.url ?? "") === slug;
  } catch {
    return false; // tab closed
  }
}

// Injected into the page. Must stay self-contained: no closures over
// worker-side variables.
async function autoScrollPage() {
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const startX = window.scrollX;
  const startY = window.scrollY;
  const deadline = Date.now() + 30000;
  let lastHeight = 0;
  while (Date.now() < deadline) {
    const doc = document.scrollingElement || document.documentElement;
    const atBottom = window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
    if (atBottom && doc.scrollHeight === lastHeight) break;
    lastHeight = doc.scrollHeight;
    window.scrollBy(0, Math.max(200, Math.floor(window.innerHeight * 0.8)));
    await pause(300);
  }
  window.scrollTo(startX, startY);
  await pause(200);
}

async function blobToDataUrl(blob) {
  // MV3 service workers have no URL.createObjectURL; go via base64.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000; // avoid call-stack limits on fromCharCode
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:application/x-mimearchive;base64,${btoa(binary)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 3: Syntax-check and re-run unit tests**

Run: `node --check background.js && npm test`
Expected: syntax check silent; 30 tests PASS (pipeline must not have touched `lib/`).

- [ ] **Step 4: [Manual — requires Chrome] Smoke-test one capture**

1. `chrome://extensions` → Reload the extension.
2. Visit any LinkedIn profile (`https://www.linkedin.com/in/<someone>`) while logged in.
3. Expected: after ~2 s the page auto-scrolls to the bottom and returns; badge flashes `✓`; `~/Downloads/linkedin-profiles/<slug>_<today>.mhtml` exists; **no debugger banner at any point**.
4. Open the service-worker console; expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add background.js
git commit -m "feat: add capture pipeline (navigate, scroll, MHTML, download)"
```

---

### Task 7: README + full E2E checklist

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the finished extension from Tasks 5–6.
- Produces: install/usage docs and the recorded E2E verification.

- [ ] **Step 1: Create `README.md`**

```markdown
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

On each LinkedIn profile visit the extension waits for the page to settle,
auto-scrolls to force lazy sections to load, captures the tab with
`chrome.pageCapture.saveAsMHTML`, and saves it as
`linkedin-profiles/<slug>_<YYYY-MM-DD>.mhtml`. Badge flashes `✓` on save,
`✗` on failure (failures retry on your next visit). Open `.mhtml` files in
Chrome or Edge; text is searchable with Ctrl+F.

## Development

- `npm install` then `npm test` — unit tests (vitest) for `lib/profile.js`.
- No build step: edit files, hit Reload on `chrome://extensions`.

## Spec

See `docs/superpowers/specs/2026-08-27-linkedin-capture-extension-design.md`.
```

- [ ] **Step 2: [Manual — requires Chrome] Run the full E2E checklist from the spec**

With the extension loaded and while logged in to LinkedIn, verify each item:

1. First visit to a profile → `.mhtml` saved with correct `<slug>_<date>` name.
2. Opening the file in Chrome shows the full profile **including below-the-fold sections and images**; Ctrl+F finds text from the bottom of the page.
3. Revisiting the same profile the same day → no new file.
4. SPA-navigating from one profile to another (click a "People also viewed" link — no full reload) → second profile saved exactly once.
5. Toolbar toggle OFF → visiting a new profile saves nothing; badge shows `OFF`. Toggle back ON.
6. Navigate away mid-scroll (click Feed while it is scrolling) → no file for the abandoned capture, no service-worker console errors.
7. No "debugging this browser" banner appeared at any point.

Record the result of each item (pass/fail) in the final report to the user.

- [ ] **Step 3: Final verification and commit**

Run: `npm test && node --check background.js && git status --short`
Expected: 30 tests pass; syntax clean; only `README.md` untracked.

```bash
git add README.md
git commit -m "docs: add README with install and usage"
```

---

## Self-Review (completed)

- **Spec coverage:** manifest/permissions → Task 5; pure-logic module and all five functions → Tasks 1–4; capture pipeline steps 1–7 → Task 6 (gate, settle, scroll, re-verify, pageCapture, download, record); storage schema → Tasks 5–6; controls/badges → Task 5; error handling (no record on failure, in-flight release, abort on navigate-away) → Task 6; testing section → Tasks 1–4 (unit) and 7 (manual E2E); out-of-scope respected (no debugger, no offscreen fallback, no icons).
- **Placeholder scan:** all steps carry full file contents, commands, and expected outputs; no TBDs.
- **Type consistency:** exports `profileSlugFromUrl` / `sanitizeSlug` / `localDateString` / `captureFilename` / `shouldCapture` are named identically in Tasks 1–4 definitions, Task 6 imports, and tests; `savedProfiles` keys are raw slugs everywhere; filenames use sanitized slugs only via `captureFilename`.
