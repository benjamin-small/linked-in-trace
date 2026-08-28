// Injected into the page via chrome.scripting.executeScript({ func: ... }).
// Chrome serializes the function's source, so it must stay fully
// self-contained: browser globals only (document, MutationObserver, Date,
// Promise, setTimeout) — no imports, no closures over module scope, and no
// chrome.* APIs. tests/readiness.test.js enforces this by rebuilding the
// function from its own source.
export async function waitForProfileReady(opts) {
  const selector = opts.selector;
  const quietMs = opts.quietMs;
  const deadline = Date.now() + opts.timeoutMs;
  const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  if (selector) {
    for (;;) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) break;
      if (Date.now() >= deadline) return { ready: false };
      await tick(100);
    }
  }

  // Quiet phase: attributes are deliberately not observed — class churn from
  // CSS animations would keep the DOM "noisy" forever. Content arriving is
  // childList/characterData.
  const target = document.querySelector("main") || document.body;
  let lastMutation = Date.now();
  const observer = new MutationObserver(() => {
    lastMutation = Date.now();
  });
  observer.observe(target, { childList: true, subtree: true, characterData: true });
  try {
    for (;;) {
      if (Date.now() - lastMutation >= quietMs) return { ready: true };
      if (Date.now() >= deadline) return { ready: false };
      await tick(100);
    }
  } finally {
    observer.disconnect();
  }
}
