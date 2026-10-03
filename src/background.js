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

// Toolbar icon behaviour per browser:
// - Firefox: no popup; the icon opens the sidebar.
// - Chrome: the manifest declares a popup as the safe default, but a declared
//   popup always wins the icon click. Where a side panel works, tell Chrome to
//   open it on click and only then remove the popup, so the side panel is the
//   primary UI. If anything fails the popup stays.
// - Opera (no sidePanel permission) and Yandex (no extension side panel): the
//   popup stays; Opera's persistent sidebar opens from Opera's sidebar icon.
if (typeof browser !== "undefined" && browser.sidebarAction) {
  browser.action.onClicked.addListener(() => {
    browser.sidebarAction.open();
  });
} else {
  // Access the API indirectly so the Firefox AMO linter does not flag a
  // Chrome-only property in the shared background script.
  const chromeRuntime = typeof chrome !== "undefined" ? chrome : null;
  const sidePanel = chromeRuntime && chromeRuntime.sidePanel ? chromeRuntime.sidePanel : null;
  // Yandex may expose the side-panel API without showing a panel; removing
  // the popup there would leave the icon doing nothing.
  const isYandex = typeof navigator !== "undefined" && /YaBrowser/i.test(navigator.userAgent || "");
  const canUseSidePanel =
    !isYandex &&
    sidePanel &&
    typeof sidePanel.setPanelBehavior === "function" &&
    typeof sidePanel.open === "function";

  if (canUseSidePanel) {
    const preferSidePanel = () =>
      sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .then(() => chromeRuntime.action.setPopup({ popup: "" }))
        .catch((error) => console.error("Side panel unavailable; keeping the toolbar popup:", error));
    preferSidePanel();
    // setPopup does not outlast the browser session; re-apply on every start.
    chromeRuntime.runtime.onStartup.addListener(preferSidePanel);
  }
}