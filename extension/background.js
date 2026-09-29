// Shows the number of unseen matches on the toolbar icon.
async function updateBadge() {
  const { matches = {} } = await chrome.storage.local.get("matches");
  const { lastViewed = 0 } = await chrome.storage.local.get("lastViewed");
  const n = Object.values(matches).filter((m) => m.firstSeen > lastViewed).length;
  chrome.action.setBadgeText({ text: n ? String(n) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") updateBadge();
});
chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(updateBadge);
