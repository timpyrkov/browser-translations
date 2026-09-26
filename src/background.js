// Background script for Browser Translations extension
//
// Message flow is now pull-based: the sidebar queries the active tab's
// content script directly (see sidebar.js) instead of content.js pushing
// text through the background script. This avoids the "sidebar not ready
// yet" race condition that used to require retry/relay logic here.
// The background script only needs to seed default settings on install.

// API compatibility
const brw = typeof browser !== "undefined" ? browser : chrome;

brw.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await brw.storage.local.set({
      sourceLanguage: "auto",
      targetLanguage: "en"
    });
    console.log("Default settings initialized");
  }
});

// There's no popup (see manifests) — clicking the toolbar icon should just
// open the sidebar/side panel directly.
if (typeof browser !== "undefined" && browser.sidebarAction) {
  // Firefox: with no default_popup, clicking the action icon fires
  // action.onClicked instead of doing nothing, so open the sidebar here.
  browser.action.onClicked.addListener(() => {
    browser.sidebarAction.open();
  });
} else {
  // Chrome: this is the documented way to make the action icon open the
  // side panel directly, without needing an onClicked listener.
  // Access the API indirectly so the Firefox AMO linter does not flag a
  // Chrome-only property in the shared background script.
  const chromeRuntime = typeof chrome !== "undefined" ? chrome : null;
  const sidePanel = chromeRuntime && chromeRuntime.sidePanel ? chromeRuntime.sidePanel : null;
  if (sidePanel && typeof sidePanel.setPanelBehavior === "function") {
    sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error("Failed to set side panel behavior:", error));
  }
}