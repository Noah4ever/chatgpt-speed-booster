# AI Chat Speed Booster

Keeps long AI chat conversations responsive by showing only recent messages first, then letting you load older ones when you need them.

Works on **ChatGPT**, **Claude**, and any AI chat app you add to the config.

| Browser | Link |
| - | - |
| Chrome | [Chrome Web Store](https://chromewebstore.google.com/detail/chatgpt-speed-booster/lalnlehliohjogjpelmggiligcmefmhn?hl=en)|

## Build it yourself

### 1) Requirements

- Node.js 18+
- npm

### 2) Install

```bash
git clone https://github.com/Noah4ever/chatgpt-speed-booster.git
cd chatgpt-speed-booster
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

### 4) Load it in your browser

#### Chrome

1. Open `chrome://extensions`
3. Turn on Developer mode  (top right)
4. Click Load unpacked (top left)
5. Select `dist/chrome/`

#### Edge

1. Open `edge://extensions`
2. Turn on Developer mode
3. Click Load unpacked
4. Select `dist/edge/`

#### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click Load Temporary Add-on
3. Select `dist/firefox/manifest.json`

#### Safari

1. Build and generate the Xcode project:

```bash
npm run safari:setup
```

2. If it doesn't open automatically, open the Xcode project:

```bash
open "safari-app/AI Chat Speed Booster/AI Chat Speed Booster.xcodeproj"
```

3. In Xcode, select the **macOS app target** (not iOS, not extension target), then click **Run (▶)**.

4. In Safari, open **Safari → Settings → Extensions** and enable **AI Chat Speed Booster**.

5. Open a supported AI chat site to verify it is active.

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
| [Claude](https://claude.ai) | 🔧 Selectors may need adjustment |

PRs to add or fix site configs are welcome.

## How it works

- Shows the latest messages first (default: 10)
- Hides older messages
- Adds a Load more button at the top to reveal older messages in batches
- Keeps the visible window capped as new messages arrive

## Settings

Set these from the popup:

| Setting          | Default | Range |
| ---------------- | ------- | ----- |
| Visible messages | 10      | 1-200 |
| Load more batch  | 5       | 1-50  |

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

## Source code submission (Firefox)

This project is built from TypeScript source files and bundled with esbuild.

### Build environment

- Operating systems: Linux, macOS, or Windows
- Node.js: 18 or newer
- npm: included with Node.js

### Reproducible build steps (Firefox)

```bash
git clone https://github.com/Noah4ever/chatgpt-speed-booster.git
cd chatgpt-speed-booster
npm ci
npm run build:firefox
```

The Firefox extension output is generated in `dist/firefox/`.

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
git clone https://github.com/Noah4ever/chatgpt-speed-booster.git
cd chatgpt-speed-booster
npm ci
npm run build:firefox
```

The Firefox extension output is generated in `dist/firefox/`.
The file to load or package is `dist/firefox/manifest.json`.

Build script used by this project:

- `scripts/build.mjs`

## License

MIT
