document.addEventListener("DOMContentLoaded", () => {
  const translateBtn = document.getElementById("scan-button");
  const settingsBtn = document.getElementById("settings-button");
  const statusMessage = document.getElementById("status-message");

  // API compatibility
  const brw = typeof browser !== "undefined" ? browser : chrome;

  translateBtn.addEventListener("click", function () {
    // Open sidebar/side panel directly in user gesture context (sync, first!)
    if (typeof browser !== "undefined" && browser.sidebarAction) {
      browser.sidebarAction.open();
    } else if (typeof chrome !== "undefined" && chrome.sidePanel) {
      chrome.sidePanel.open({ windowId: undefined });
    }

    // Now do the rest asynchronously
    (async () => {
      try {
        const [tab] = await brw.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
          statusMessage.textContent = "⚠️ No active tab found.";
          return;
        }

        // 1. Inject the content script into the active tab
        await brw.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });

        // 2. Now, send the message to the newly injected script
        await brw.tabs.sendMessage(tab.id, { command: "start-translation" });

        statusMessage.textContent = "Sidebar opened. Translating...";
        setTimeout(() => window.close(), 1500);
      } catch (err) {
        console.error("Error launching translator:", err);
        statusMessage.textContent = "⚠️ Failed to start translation.";
      }
    })();
  });

  settingsBtn.addEventListener("click", () => {
    brw.runtime.openOptionsPage();
  });
});