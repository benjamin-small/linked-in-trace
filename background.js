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
