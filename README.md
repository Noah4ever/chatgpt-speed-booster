# ChatGPT Speed Booster

Browser extension that dramatically speeds up ChatGPT by lazily loading conversation messages. Only the most recent messages are rendered; older messages are hidden and loaded on demand.

## How It Works

- **FIFO Message Management** — Only the last N messages (default: 10) are visible. When you send a new message, the oldest visible message is hidden automatically.
- **Load More Button** — A button appears at the top of the conversation letting you reveal older messages in batches.
- **Configurable** — Adjust the visible message limit and batch size from the extension popup.
- **Zero Data Collection** — The extension never reads, stores, or transmits message content. It only manipulates DOM element visibility.

## Supported Browsers

| Browser | Manifest | Status |
|---------|----------|--------|
| Chrome  | V3       | ✅ Supported |
| Firefox | V3       | ✅ Supported |
| Edge    | V3       | ✅ Supported |

Each browser has its own manifest under `browsers/`. The TypeScript source code is shared.

## Project Structure

```
src/
├── shared/              # Cross-browser abstractions
│   ├── types.ts         # All type definitions
│   ├── constants.ts     # Defaults & config limits
│   ├── storage.ts       # Typed config persistence
│   ├── browser-api.ts   # Browser API compatibility layer
│   └── logger.ts        # Privacy-safe logging
├── content/             # Content script (injected into ChatGPT)
│   ├── index.ts         # Orchestrator / entry point
│   ├── MessageManager.ts# FIFO visibility manager
│   ├── DOMObserver.ts   # MutationObserver wrapper
│   ├── UIComponents.ts  # Load More button & status indicator
│   └── selectors.ts     # ChatGPT DOM selectors
├── background/          # Service worker
│   └── index.ts         # Config relay & tab messaging
└── popup/               # Extension popup UI
    ├── popup.html
    ├── popup.css
    └── popup.ts

browsers/
├── chrome/manifest.json
├── firefox/manifest.json
└── edge/manifest.json
```

## Development

### Prerequisites

- Node.js ≥ 18
- npm

### Setup

```bash
npm install
```

### Build

```bash
# Build for a specific browser
npm run build:chrome
npm run build:firefox
npm run build:edge

# Build for all browsers at once
npm run build:all

# Watch mode (development)
npm run watch:chrome
```

Output is written to `dist/<browser>/`.

### Type checking

```bash
npm run typecheck
```

### Loading the Extension

**Chrome / Edge:**
1. Navigate to `chrome://extensions` (or `edge://extensions`)
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `dist/chrome/` (or `dist/edge/`)

**Firefox:**
1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on…"
3. Select `dist/firefox/manifest.json`

## Configuration

Open the extension popup to adjust:

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| Visible messages | 10 | 1–200 | Max messages shown at a time |
| Load-more batch | 5 | 1–50 | Messages revealed per "Load More" click |

## Privacy

This extension is designed with privacy as a first-class concern:

- **No message content is ever read, stored, or transmitted.**
- Only DOM element references are used to toggle visibility.
- No analytics, telemetry, or external network requests.
- All data stays in local browser storage (`browser.storage.local`).
- Logging in production is limited to warnings and errors; no user data is logged.

## License

MIT
