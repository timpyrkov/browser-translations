// API compatibility
const brw = typeof browser !== "undefined" ? browser : chrome;

brw.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === "start-translation") {
    try {
      const mainText = extractMainText();
      if (mainText) {
        // Send the extracted text to the runtime (which will be picked up by the sidebar)
        brw.runtime.sendMessage({
          command: "deliver-main-text",
          payload: mainText,
        });
        // Indicate that the message was handled successfully.
        sendResponse({ status: "success", textFound: true });
      } else {
        sendResponse({ status: "success", textFound: false });
      }
    } catch (error) {
      console.error("Error in content script:", error);
      sendResponse({ status: "error", message: error.message });
    }
    // Return true to indicate you wish to send a response asynchronously
    return true; 
  }
});

/**
 * Attempts to extract the main content from the web page.
 * Prioritizes <main> element or body without nav/header/aside/footer.
 */
function extractMainText() {
  // Try article tag first (common for blog posts, news articles)
  const articleEl = document.querySelector("article");
  if (articleEl) {
    return cleanText(articleEl.innerText || articleEl.textContent || "");
  }

  // Try main tag
  const mainEl = document.querySelector("main");
  if (mainEl) {
    return cleanText(mainEl.innerText || mainEl.textContent || "");
  }

  // Try content-specific selectors
  const contentSelectors = [
    '[role="main"]',
    '.content',
    '.post-content',
    '.article-content',
    '.entry-content',
    '#content',
    '#main-content'
  ];
  
  for (const selector of contentSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      return cleanText(el.innerText || el.textContent || "");
    }
  }

  // Fallback: remove non-content sections before extracting from body
  const clone = document.body.cloneNode(true);

  // Remove navigation, ads, and other non-content elements
  const removeSelectors = [
    "nav", "footer", "header", "aside", "script", "noscript",
    ".nav", ".navigation", ".menu", ".sidebar", ".ad", ".advertisement",
    ".social", ".share", ".comments", ".related", ".recommended"
  ];
  
  removeSelectors.forEach(selector => {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  });

  const fallbackText = clone.innerText || clone.textContent || "";
  return cleanText(fallbackText);
}

/**
 * Cleans extracted text by trimming and collapsing excess whitespace.
 */
function cleanText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/(\.|\!|\?)\s+/g, "$1\n") // break into lines for parallel reading
    .trim();
}