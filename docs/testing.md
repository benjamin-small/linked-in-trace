# Testing

## Current coverage

Coverage measured on September 24, 2026 reports **29.81% line and statement
coverage**, **97.22% branch coverage**, and **87.5% function coverage** across
all executable JavaScript. The lower aggregate line number is explicit: the
Chrome service worker in `background.js` depends on extension APIs and is not
currently exercised by the Node test harness. Both pure modules under `lib/`
report 100% statement, branch, function, and line coverage.

Reproduce the report with:

```sh
npm ci
npm run coverage
```

Coverage output is generated locally under `coverage/` and ignored by Git.
These values are measurements rather than enforced thresholds; update them
when tests or instrumentation boundaries change.

## What we test

The 37 Vitest tests cover LinkedIn profile URL recognition, rejection of
look-alike hosts and non-profile routes, safe filename generation, Unicode and
malformed percent encoding, local capture dates, once-per-day capture policy,
DOM readiness, late profile headings, continuous mutations, quiet periods,
timeouts, missing `main` elements, and serialization of the function injected
into the page.

CI also parses `background.js` with Node to catch syntax errors. Chrome owns
the extension APIs used for navigation events, badges, MHTML capture, downloads,
and local storage, so the complete service-worker flow is verified manually by
loading the unpacked extension, visiting a LinkedIn profile, observing the
success badge, and opening the resulting MHTML file. That manual boundary is
not represented in the coverage percentage.
