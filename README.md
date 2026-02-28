# ChatGPT Speed Booster

ChatGPT Speed Booster keeps long chats responsive by showing only recent messages first, then letting you load older ones when you need them.

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

```bash
npm run build:chrome
```

Build output goes to `dist/chrome/`.

You can also build all targets:

```bash
npm run build:all
```

### 4) Load it in your browser

#### Chrome

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Click Load unpacked
4. Select `dist/chrome/`

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

1. Build and convert:

```bash
npm run safari:setup
```

2. Open `safari-app/ChatGPT Speed Booster.xcodeproj`
3. In Xcode, select the app target (not the extension target)
4. In Signing & Capabilities, choose your Apple team for both:

- ChatGPT Speed Booster (App)
- ChatGPT Speed Booster Extension

5. Run the app target once
6. Open Safari, then go to Settings > Extensions and enable ChatGPT Speed Booster

If it says "not active" and you do not see it in the extension list:

```bash
rm -rf safari-app
npm run safari:setup
```

Then run the app target again from Xcode.

## How it works

- Shows the latest messages first (default: 10)
- Hides older messages
- Adds a Load more button at the top to reveal older messages in batches
- Keeps the visible window capped as new messages arrive

## Settings

Set these from the popup:

| Setting | Default | Range |
|---------|---------|-------|
| Visible messages | 10 | 1-200 |
| Load more batch | 5 | 1-50 |

## Browser support

- Chrome
- Firefox
- Edge
- Safari

## Privacy

- No message content is read or sent anywhere
- No analytics or tracking
- Settings are stored locally in browser storage

## License

MIT
