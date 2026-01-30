# MarkMind - Privacy-First Web Highlighter

## Features
- Highlight text in 4 colors (Yellow, Green, Blue, Pink)
- Add private notes to highlights
- Organize with collections and tags
- Full-text search across all highlights
- Keyboard shortcuts (Alt+1/2/3/4)
- Export data to JSON
- 100% offline, privacy-first (IndexedDB)
- All data stored locally on your device

## Installation

1. **Clone and Install**
   ```bash
   cd markmarkmind
   npm install
   ```

2. **Build the Extension**
   ```bash
   npm run build
   ```
   This will create a `dist/` folder containing the compiled extension.

3. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `markmarkmind/dist` folder

## Development

- **Watch Mode**: `npm run watch` (Automatically rebuilds on changes)
- **Production Build**: `npm run build` (Minified code)

## Usage

- **Highlighting**: Select any text on a webpage. A toolbar will appear. Click a color to highlight.
- **Shortcuts**: Select text and press Alt+1 (Yellow), Alt+2 (Green), Alt+3 (Blue), or Alt+4 (Pink).
- **Notes**: Click on an existing highlight to add or edit notes.
- **Manage**: Click the extension icon to search, view recent highlights, or change settings.

## Troubleshooting

- **Icons**: If icons are missing, ensure you have replaced the placeholder PNGs in `src/assets/icons/` with valid images.
- **Build Errors**: Ensure you have Node.js installed. If `npm install` fails, check your internet connection.
- **Extension Not Working**: Inspect the background page or content script console for errors. Ensure permissions are allowed.

## Privacy Policy
MarkMind operates entirely offline. All highlighted data and notes are stored in IndexedDB within your browser. No data is ever sent to external servers.

## License
MIT
