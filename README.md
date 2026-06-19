# Visual Screen Reader

Chrome extension (Manifest V3) that shows the **browser’s internal accessibility tree** (via Chrome DevTools Protocol) in a side panel — linked to the page DOM for focus and live updates.

Built with **Svelte 5**, **TypeScript**, and **Vite**, using [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin) for HMR and extension builds.

## Features

- **Browser AX tree via CDP** — captures the real accessibility tree from Chrome (`Accessibility.getFullAXTree`), not a DOM approximation
- **DOM-linked focus** — content script stamps stable DOM paths on elements; CDP nodes are linked via `backendDOMNodeId` so focus tracking matches the page
- **Screen reader view** — readable, speech-oriented rendering of the tree (landmarks, headings, links, etc.)
- **Raw JSON** — full tree payload for debugging
- **Live updates** — DOM observers and focus listeners trigger CDP re-capture when the page changes, focus moves, the active tab switches, or the page navigates (including `pushState` / `replaceState`)
- **Focus tracking** — highlights the focused element and scrolls it into view in the tree

## Usage

1. Install and load the extension (see [Development](#development) below).
2. Open a normal web page (`http://` or `https://` — not `chrome://` or extension pages).
3. Click the extension icon to open the **side panel** (Chrome 114+).
4. The tree loads automatically. Use **Refresh tree** to force a capture.
5. Switch between **Screen reader view** and **Raw JSON** in the panel.

## How it works

```
┌─────────────┐     messages      ┌──────────────────┐     tabs.sendMessage     ┌─────────────────┐
│  Side panel │ ◄───────────────► │ Service worker   │ ◄──────────────────────► │ Content script  │
│  (Svelte)   │                   │ (background)     │                          │ (page DOM)      │
└─────────────┘                   └──────────────────┘                          └─────────────────┘
                                         │                                                │
                                         │  chrome.debugger (CDP)                         │
                                         │  Accessibility.getFullAXTree                   │
                                         │  DOM.getFlattenedDocument (link to DOM)        │
                                         │                                                │
                                         │  debounced push on tab/DOM/focus changes       │
                                         │  MutationObserver + focus listeners            │
                                         │  compute body-relative paths via CDP DOM tree    │
                                         └────────────────────────────────────────────────┘
```

1. The **content script** watches the DOM (mutations, focus, navigation) and reports focus using stable body-relative node paths.
2. On each update trigger, the **service worker** attaches the debugger, fetches the CDP accessibility tree, and links nodes to those paths via `backendDOMNodeId` and `DOM.getDocument` (without mutating the page DOM).
3. The **side panel** renders the CDP tree (screen-reader-style or JSON) and highlights focus using the linked DOM node ids.
4. If CDP capture fails (e.g. another debugger is attached), the extension falls back to a DOM-derived tree.

## Project layout

| Path | Role |
|------|------|
| `manifest.config.ts` | Extension manifest (side panel, content scripts, permissions) |
| `src/sidepanel/` | Chrome side panel UI (Svelte) |
| `src/content/` | Content script — DOM observers, node-id stamping, focus tracking |
| `src/background/` | MV3 service worker — CDP capture, tab routing, message handling |
| `src/background/cdp-ax-tree.ts` | CDP debugger attach, AX tree fetch, DOM linking |
| `src/shared/` | Shared types (`AxTreeNode`, message contracts) |
| `src/lib/` | Tree rendering and speech-oriented presentation |
| `public/` | Static assets referenced from the manifest |

## Development

```bash
pnpm install
pnpm dev
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the **`dist`** folder (created when `pnpm dev` starts)

CRXJS rebuilds `dist` on save and supports HMR for the side panel and content scripts. After the first load, use **Reload** on the extension card when manifest or permission changes do not apply automatically.

## Production build

```bash
pnpm build
```

Load the `dist` folder the same way as in development.

## Typecheck

```bash
pnpm check
```

## Limitations

- Attaching the debugger shows Chrome’s “being controlled by automated test software” banner and conflicts with DevTools on the same tab.
- Cannot run on restricted URLs (`chrome://`, `chrome-extension://`, etc.).
- Content script runs in the top frame only (`all_frames: false`).
- After installing or updating, refresh open tabs so the content script is injected.

## IDE

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode).
