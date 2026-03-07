# AI Chat Speed Booster

Keeps long AI chat conversations responsive by showing only recent messages first, then letting you load older ones when you need them.

Works on **ChatGPT**, **Claude**, and any AI chat app you add to the config.

| Browser | Version | Link |
| --- | --- | --- |
| Chrome | v1.0.0 | [chromewebstore](https://chromewebstore.google.com/detail/ai-chat-speed-booster/fgefgkfmapdjjjdekejanelknedclfik) | 
| Firefox | v1.3.4 | [addons.mozilla.org](https://addons.mozilla.org/en-US/firefox/addon/ai-chat-speed-booster/?utm_source=addons.mozilla.org&utm_medium=referral&utm_content=search)

## Install (quick)

If you just want to install it:

1. Go to [Releases](https://github.com/Noah4ever/ai-chat-speed-booster/releases)
2. Download the zip for your browser
3. Follow your browser guide:
    - [Chrome install guide](docs/install/chrome.md)
    - [Firefox install guide](docs/install/firefox.md)
    - [Edge install guide](docs/install/edge.md)
    - [Safari install guide](docs/install/safari.md)

Store listings (Chrome/Firefox) may lag because review can take time.

## Build it yourself

### 1) Requirements

- Node.js 18+
- npm

### 2) Install

```bash
git clone https://github.com/Noah4ever/ai-chat-speed-booster.git
cd ai-chat-speed-booster
npm install
```

### 3) Build

Build all targets:

```bash
npm run build:all
```

You can also just build one target (`chrome`, `firefox`, `safari`, `edge`):

```bash
npm run build:chrome
```
Build ouput goes to `dist/chrome/`.

## Adding a new AI chat site

All site definitions live in one file: [`sites.config.json`](sites.config.json).

To add a new site, add an entry to the array:

```json
{
    "id": "mysite",
    "name": "My AI Chat",
    "hostnames": ["mysite.com"],
    "urlPatterns": ["*://mysite.com/*"],
    "selectors": {
        "messageTurn": ".message-selector",
        "scrollContainer": ".scroll-container"
    },
    "messageIdAttribute": "data-message-id"
}
```

Then rebuild. The build script auto-injects the URL patterns into all browser manifests. No other files need to change.

### Finding the right selectors

1. Open the AI chat in your browser
2. Right-click on a message → Inspect
3. Find the repeating element wrapping each message turn → that's `messageTurn`
4. Find the scrollable container → that's `scrollContainer`
5. If there's a fallback scroll container, add `scrollContainerAlt`
6. If messages have a unique ID attribute, set `messageIdAttribute` (defaults to `data-testid`)

### Currently supported sites

| Site | Status |
| ---- | ------ |
| [ChatGPT](https://chatgpt.com) | ✅ Tested |
| [Claude](https://claude.ai) | ✅ Tested |

PRs to add or fix site configs are welcome.

## How it works

- Shows the latest messages first (default: 3)
- Hides older messages
- Adds a Load more button at the top to reveal older messages in batches
- Keeps the visible window capped as new messages arrive

## Settings

Set these from the popup:

| Setting            | Default   | Range   |
| ------------------ | --------- | ------- |
| Visible messages   | 3         | 1-200   |
| Load more batch    | 3         | 1-50    |
| Status indicator   | On        | On/Off  |
| Badge position     | Top right | 4 corners |

## Testing

Automated tests use [Playwright](https://playwright.dev/) to validate build outputs and run the real extension in headless Chromium against mock pages.

### Run all tests

```bash
npm test
```

This builds all browser targets, validates every `dist/` output, then loads the extension in Chromium and verifies it works for each configured site (60 tests, ~7s).

### Individual test suites

```bash
npm run test:build       # validate dist/ outputs only
npm run test:extension   # extension tests on mock pages
npm run test:integration # live site tests (requires auth, see below)
```

### Integration tests (live sites)

To test against real sites with your account:

1. Copy `.env.example` to `.env` and fill in your credentials  
   (for ChatGPT via Google login, use your Google email/password)
2. Run `npm run test:auth` — a browser opens, log in to each site, press Enter
3. Run `npm run test:integration`

The auth profile is saved to `tests/.auth-profile/` (git-ignored) and reused across runs.

### Headless mode

Set `HEADLESS=1` to run without a visible browser window:

```bash
HEADLESS=1 npm test
```

## Browser support

- Chrome
- Firefox
- Edge
- Safari

## Privacy

- No message content is read or sent anywhere
- No analytics or tracking
- Settings are stored locally in browser storage

## Source code submission (Firefox)

This project is built from TypeScript source files and bundled with esbuild.

### Build environment

- Operating systems: Linux, macOS, or Windows
- Node.js: 18 or newer
- npm: included with Node.js

### Reproducible build steps (Firefox)

```bash
git clone https://github.com/Noah4ever/ai-chat-speed-booster.git
cd ai-chat-speed-booster
npm ci
npm run build:firefox
```

The Firefox extension output is generated in `dist/firefox/`.
The file to load or package is `dist/firefox/manifest.json`.

Build script used by this project: `scripts/build.mjs`

## License

MIT
