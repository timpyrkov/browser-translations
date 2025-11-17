// Background script for Parallel Reading extension
// Handles message relay between content script and sidebar

// Store the current active tab for sidebar communication
let currentActiveTab = null;

// Listen for messages from content script and popup
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log("Background received message:", message);

  try {
    switch (message.command) {
      case "deliver-main-text":
        // Relay text from content script to sidebar
        await relayToSidebar(message);
        break;
      case "get-settings":
        // Return stored settings
        const settings = await browser.storage.local.get([
          "sourceLanguage",
          "targetLanguage", 
          "translationMode"
        ]);
        sendResponse(settings);
        break;
      default:
        console.warn("Unknown message command:", message.command);
    }
  } catch (error) {
    console.error("Background script error:", error);
    sendResponse({ error: error.message });
  }
});

// Handle tab activation to track current active tab
browser.tabs.onActivated.addListener(async (activeInfo) => {
  currentActiveTab = activeInfo.tabId;
});

// Handle tab updates
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    currentActiveTab = tabId;
  }
});

/**
 * Relay message to sidebar
 */
async function relayToSidebar(message) {
  let retries = 5;
  while (retries > 0) {
    try {
      // Use the original message object directly
      await browser.runtime.sendMessage(message);
      console.log("Message relayed to sidebar successfully");
      return; // Exit on success
    } catch (error) {
      if (error.message.includes("Could not establish connection")) {
        retries--;
        if (retries === 0) {
          console.error("Failed to relay message to sidebar after multiple retries.", error);
          throw error;
        }
        console.warn(`Sidebar not ready, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
      } else {
        console.error("An unexpected error occurred while relaying to sidebar:", error);
        throw error; // Rethrow other errors
      }
    }
  }
}

// Handle extension installation/update
browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // Set default settings on first install ONLY
    await browser.storage.local.set({
      sourceLanguage: "auto",
      targetLanguage: "es",
      translationMode: "full"
    });
    console.log("Default settings initialized");
  }
}); 