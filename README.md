# MarkMind V2.0 🧠✨

**Your AI-Powered Second Brain for the Web.**

MarkMind transforms how you consume and organize information on the web. It's not just a highlighter—it's an intelligent knowledge companion that helps you understand, connect, and remember what you read.

![MarkMind Preview](assets/screenshot.png)

## 🚀 Key Features

### 🌟 AI-Powered Insights
- **Smart Summarization**: Get concise summaries of selected text or entire paragraphs.
- **Instant Explanations**: Confused by jargon? MarkMind explains complex terms in simple language.
- **Concept Extraction**: Automatically identifies key concepts and entities in your highlights.

### 🔗 Knowledge Graph
- **Auto-Linking**: MarkMind finds connections between your current reading and past highlights.
- **Concept Mapping**: Visualizes how ideas relate across different articles (Dashboard feature).

### 📝 Smart Highlighting
- **Multi-Color System**: Categorize ideas with color codes (Yellow for important, Green for definitions, Blue for quotes, etc.).
- **Rich Context**: Highlights are saved with their surrounding context, so you never lose the original meaning.
- **Notes & Annotations**: Add your own thoughts to any highlight.

### 🔒 Privacy-First Design
- **Local-First Architecture**: Your data lives on your device (IndexedDB + Chrome Storage).
- **Optional Cloud AI**: Use local lightweight models (coming soon) or bring your own API keys (OpenAI, Anthropic, Gemini).
- **No Data Harvesting**: We don't track your browsing history or sell your data.

## 🛠 Installation

### From Source
1. Clone this repository:
   ```bash
   git clone https://github.com/prince/markmind.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load into Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist` folder from the project directory

## 💻 Tech Stack

- **TypeScript**: For type-safe robust code.
- **Tailwind CSS**: For a modern, beautiful UI.
- **Webpack**: For optimized production builds.
- **IndexedDB**: For high-performance local storage of thousands of highlights.
- **Chrome Extension Manifest V3**: Future-proof and secure.

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

**MarkMind** — *Read better. Think deeper.*
