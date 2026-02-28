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

### 4) Load in Chrome

1. Open in browser
```
chrome://extensions
```
2. Turn on Developer mode (top right)
3. Click Load unpacked (top left)
4. Select `dist/chrome/`

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
