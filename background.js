import {
  profileSlugFromUrl,
  captureFilename,
  localDateString,
  shouldCapture,
} from "./lib/profile.js";
import { waitForProfileReady } from "./lib/readiness.js";

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
        await chrome.action.setBadgeText({ tabId, text: null });
      } catch {
        // tab gone; nothing to clear
      }
    }, BADGE_FLASH_MS);
  } catch {
    // tab gone before we could set the badge
  }
}

// Short yield after a navigation event so the SPA route swap can begin
// before we start watching the DOM.
const NAV_EVENT_YIELD_MS = 500;
// Pre-scroll readiness: wait for the profile name (main h1), then a quiet DOM.
const READY_BEFORE_SCROLL = { selector: "main h1", quietMs: 600, timeoutMs: 12000 };
// Post-scroll readiness: the scroll just triggered lazy loads; wait for the
// resulting mutations to finish. No selector — the floor was already met.
const READY_AFTER_SCROLL = { selector: null, quietMs: 750, timeoutMs: 10000 };

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
  await sleep(NAV_EVENT_YIELD_MS);
  if (!(await tabStillOnProfile(tabId, slug))) return;

  await waitForReady(tabId, READY_BEFORE_SCROLL);
  if (!(await tabStillOnProfile(tabId, slug))) return;

  await chrome.scripting.executeScript({ target: { tabId }, func: autoScrollPage });

  await waitForReady(tabId, READY_AFTER_SCROLL);
  if (!(await tabStillOnProfile(tabId, slug))) return;

  const blob = await chrome.pageCapture.saveAsMHTML({ tabId });
  const dataUrl = await blobToDataUrl(blob);

  const now = new Date();
  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename: captureFilename(slug, now),
    saveAs: false,
    conflictAction: "uniquify",
  });
  await waitForDownloadComplete(downloadId);

  // Success only: record so failures retry on the next visit.
  const { savedProfiles } = await chrome.storage.local.get({ savedProfiles: {} });
  savedProfiles[slug] = localDateString(now);
  await chrome.storage.local.set({ savedProfiles });
  await flashBadge(tabId, "✓");
}

// Runs waitForProfileReady inside the page. A timeout is not an error:
// we log it and capture whatever is there (same policy as login walls).
async function waitForReady(tabId, opts) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: waitForProfileReady,
    args: [opts],
  });
  if (!injection?.result?.ready) {
    console.warn(`linked-in-trace: readiness wait timed out on tab ${tabId}; capturing as-is`);
  }
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

function waitForDownloadComplete(downloadId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`download ${downloadId} did not complete within ${timeoutMs}ms`));
    }, timeoutMs);

    function onChanged(delta) {
      if (delta.id !== downloadId || !delta.state) return;
      if (delta.state.current === "complete") {
        cleanup();
        resolve();
      } else if (delta.state.current === "interrupted") {
        cleanup();
        reject(new Error(`download ${downloadId} interrupted`));
      }
    }

    function cleanup() {
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(onChanged);
    }

    chrome.downloads.onChanged.addListener(onChanged);

    // The download may already have finished before the listener attached.
    chrome.downloads.search({ id: downloadId }).then((results) => {
      const item = results[0];
      if (!item) return;
      if (item.state === "complete") {
        cleanup();
        resolve();
      } else if (item.state === "interrupted") {
        cleanup();
        reject(new Error(`download ${downloadId} interrupted`));
      }
    }).catch(() => {});
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
