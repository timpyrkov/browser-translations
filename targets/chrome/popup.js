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

  // sidePanel.open() must run inside the click's user gesture, so look up the
  // hosting browser window now and call open() synchronously on click.
  let hostWindowId = null;
  if (brw.windows && typeof brw.windows.getCurrent === "function") {
    brw.windows.getCurrent().then((win) => { hostWindowId = win.id; }).catch(() => {});
  }

  openSidebarBtn.addEventListener("click", () => {
    const opening =
      sidebarAction && typeof sidebarAction.open === "function"
        ? sidebarAction.open()
        : sidePanel.open({ windowId: hostWindowId });
    Promise.resolve(opening)
      .catch((error) => console.error("Failed to open sidebar/side panel:", error))
      .finally(() => window.close());
  });
}
