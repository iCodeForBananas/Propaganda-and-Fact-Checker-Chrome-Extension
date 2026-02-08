# Instagram Propaganda & Fact Checker

A Chrome extension that analyzes Instagram comments for propaganda/bot behavior and fact-checks claims using Google's Gemini AI.

## Features

- 🤖 Bot Detection: Scores comments 1-10 based on propaganda likelihood
- ✅ Fact Checking: Verifies claims made in comments
- 🎨 Visual Indicators: Color-coded borders (green/orange/red)
- 💾 Caching: Stores results locally for performance

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select this directory
5. Click the extension icon and enter your Gemini API key

## Setup

Get a free Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

## How It Works

The extension scans Instagram comments every 3 seconds, batches them, and sends them to Gemini for analysis. Results are cached and displayed inline with color-coded ratings.

## Development

### Project Structure

```
├── manifest.json    # Extension configuration
├── content.js       # Main script injected into Instagram pages
├── popup.html       # Extension popup UI
├── popup.js         # Popup functionality (API key management)
└── README.md
```

### Loading the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked** and select this project folder
4. The extension icon will appear in your toolbar

### Making Changes

- **Content script changes** (`content.js`): Reload the extension on `chrome://extensions/` (click the refresh icon) and refresh the Instagram tab
- **Popup changes** (`popup.html`, `popup.js`): Close and reopen the popup
- **Manifest changes**: Reload the extension on `chrome://extensions/`

### Debugging

- **Content script logs**: Open DevTools on Instagram (F12) → Console tab
- **Popup logs**: Right-click extension icon → "Inspect popup"
- **Background/service worker**: Click "Service Worker" link on `chrome://extensions/`

### Testing

1. Navigate to an Instagram post with comments
2. Open DevTools console to monitor for errors
3. Comments should get color-coded borders after analysis

### Common Issues

| Issue                 | Solution                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------- |
| 404 API Error         | Verify your Gemini API key is valid at [Google AI Studio](https://aistudio.google.com/apikey) |
| Comments not detected | Instagram may have changed their DOM structure; update selectors in `content.js`              |
| Extension not loading | Check for errors in `chrome://extensions/` and ensure `manifest.json` is valid                |
