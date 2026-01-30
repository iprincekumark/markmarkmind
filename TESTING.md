# MarkMind V2.0 Testing Guide

This guide will walk you through testing the core features of the MarkMind V2.0 extension.

## 🛠️ Installation

1.  **Build the Project**:
    ```bash
    npm run build
    ```
    Ensure you see `webpack 5.x.x compiled successfully` in your terminal.

2.  **Load in Chrome**:
    - Open Chrome and navigate to `chrome://extensions/`.
    - Toggle **Developer mode** in the top right corner.
    - Click **Load unpacked**.
    - Select the `dist` folder located in your project directory (`/Users/prince/Documents/CoDiN/Princevrse/markmind/dist`).
    - **Note**: If you had a previous version loaded, click the **Reload** (circular arrow) icon on the extension card.

## 🧪 Feature Testing

### 1. Highlighting Text
**Goal**: Verify basic highlighting works.
1.  Open any article or webpage (e.g., [Wikipedia](https://en.wikipedia.org/wiki/Artificial_intelligence)).
2.  Refresh the page to ensure the content script is loaded.
3.  Select a paragraph of text.
4.  A small toolbar should appear above the selection.
5.  Click any color button (Yellow, Green, Blue, etc.).
6.  **Expected**: The text background changes to the selected color.

### 2. AI "Magic" Explanation
**Goal**: Test the new AI integration.
1.  Select a specific term or complex sentence on the page.
2.  In the toolbar, click the **Magic Wand (✨)** button.
3.  **Expected**: 
    - A floating panel appears saying "Thinking...".
    - After a moment, an explanation of the text appears.
    - *Note: Since no API key is set by default, it might return a message about "Local mode" or a mock response if configured.*

### 3. Popup Dashboard
**Goal**: Verify the new UI and Data Persistence.
1.  Click the MarkMind extension icon in the Chrome toolbar.
2.  **Highlights Tab**: You should see cards for the highlights you just created.
    - Verify the text, date, and color match.
    - Click a highlight card; it should open the original page (if you are on a different tab).
3.  **Insights Tab**: Click "AI Insights".
    - Click "Generate New Insights".
    - AI should analyze your highlights and suggest a topic summary (or show a placeholder in offline mode).
4.  **Settings Tab**:
    - Toggle "Dark Mode" (visual check).
    - Change "AI Provider" (dropdown check).

### 4. Persistence Check
**Goal**: Ensure data is saved.
1.  Reload the webpage where you highlighted text.
2.  **Expected**: The highlights should reappear automatically.

## 🐛 Troubleshooting

- **"Extension invalidated"**: This happens if you rebuild while Chrome is running. Go to `chrome://extensions/` and click refresh.
- **Highlights not showing**: Ensure the page URL exactly matches. Some sites (SPAs) change URLs dynamically.
- **AI Error**: If the AI panel says "Error connecting", check the console (`Right-click > Inspect > Console`) for details.
