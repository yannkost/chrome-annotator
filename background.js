// Toolbar click -> open the dedicated annotation browser.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("notes/index.html") });
});