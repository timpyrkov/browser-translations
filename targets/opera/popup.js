// Popup-only extras for the Chrome/Opera dual-mode builds.
//
// The popup reuses sidebar.html/sidebar.js verbatim; this small module only
// wires the extra "open in sidebar" button. It stays hidden where no
// sidebar/side-panel API exists (e.g. Yandex Browser, which installs the
// Chrome/Opera build but has no sidebar surface for third-party extensions),
// and shows where the browser does have one (Chrome's side panel, Opera's
// sidebar_action) so the click-target isn't dead weight.
const brw = typeof browser !== "undefined" ? browser : chrome;
const opr = typeof window !== "undefined" ? window.opr : null;

import { t, detectBrowserLanguage } from "./i18n.js";

const openSidebarBtn = document.getElementById("openSidebarBtn");
// In the Opera package there is no "open in sidebar" button inside the popup:
// Opera has its own sidebar icon for the persistent sidebar. The popup is only
// a fallback for browsers without a sidebar API (e.g. Yandex via the Chrome package).
if (!openSidebarBtn) return;
// Opera exposes its sidebar API under opr.sidebarAction; Firefox uses
// browser.sidebarAction; Chrome uses chrome.sidePanel.
const sidebarAction = brw.sidebarAction || (opr && opr.sidebarAction);
const sidePanel = brw.sidePanel;
const canOpenSidebar =
  (sidebarAction && typeof sidebarAction.open === "function") ||
  (sidePanel && typeof sidePanel.open === "function");

if (!canOpenSidebar) {
  openSidebarBtn.style.display = "none";
} else {
  brw.storage.local.get(["uiLanguage"]).then((settings) => {
    const lang = settings.uiLanguage || detectBrowserLanguage();
    openSidebarBtn.title = t(lang, "openSidebarLabel");
  });

  openSidebarBtn.addEventListener("click", async () => {
    try {
      if (sidebarAction && typeof sidebarAction.open === "function") {
        // Opera-style sidebar
        await sidebarAction.open();
      } else {
        // Chrome-style side panel - needs the hosting browser window's id,
        // not the popup's own, so ask for the last focused normal window.
        const win = await brw.windows.getLastFocused({ windowTypes: ["normal"] });
        await sidePanel.open({ windowId: win.id });
      }
    } catch (error) {
      console.error("Failed to open sidebar/side panel:", error);
    }
    window.close();
  });
}
