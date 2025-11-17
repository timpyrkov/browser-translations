# Installation Instructions

## For Firefox

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on"
4. Navigate to your extension folder and select `manifests/firefox.json`
5. The extension should now appear in your add-ons list

## For Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Navigate to your extension folder and select the `src` folder
5. The extension should now appear in your extensions list

## Testing the Extension

1. Open the test page (`test.html`) in your browser
2. Click the extension icon in your browser toolbar
3. Click the "Translate" button
4. The sidebar should open with parallel translations

## Troubleshooting

- If the sidebar doesn't open, check the browser console for errors
- Make sure the extension has permission to access the current page
- For Firefox, you may need to manually open the sidebar using the sidebar button

## Development Notes

- The extension uses LibreTranslate API for translations
- Settings are stored in browser storage
- The extension works with both English and Spanish content
- Scroll synchronization is implemented between the original and translated columns 