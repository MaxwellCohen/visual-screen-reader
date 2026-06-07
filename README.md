# Visual Screen Reader

Chrome extension (Manifest V3) that builds a **DOM-derived accessibility tree** for the active tab and shows it in a side panel — similar to what a screen reader would encounter (roles, names, landmarks, focus).

Built with **Svelte 5**, **TypeScript**, and **Vite**, using [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin) for HMR and extension builds.

## Features

- **Accessibility tree from the DOM** — infers roles (implicit HTML + `role` / ARIA), accessible names, descriptions, states, and heading levels
- **Screen reader view** — readable, speech-oriented rendering of the tree (landmarks, headings, links, etc.)
- **Raw JSON** — full tree payload for debugging
- **Live updates** — tree refreshes when the DOM changes, focus moves, the active tab switches, or the page navigates (including `pushState` / `replaceState`)
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
                                         │  debounced push on tab/DOM/focus changes       │
                                         │  buildDomAxTree() + MutationObserver           │
                                         └────────────────────────────────────────────────┘
```

1. The **content script** walks the page DOM, assigns stable node IDs, and builds an `AxTreeNode` tree.
2. A **MutationObserver** and focus listeners push updates to the background when the page changes.
3. The **service worker** routes requests from the side panel, captures the active tab’s tree, and pushes live updates while the panel is open.
4. The **side panel** renders the tree (screen-reader-style or JSON) and tracks focus.

## Project layout

| Path | Role |
|------|------|
| `manifest.config.ts` | Extension manifest (side panel, content scripts, permissions) |
| `src/sidepanel/` | Chrome side panel UI (Svelte) |
| `src/content/` | Content script — DOM tree builder and live observers |
| `src/background/` | MV3 service worker — tab capture and message routing |
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

- Does not use Chrome DevTools Protocol; the tree is **approximated from the DOM**, not the browser’s internal AX tree.
- Cannot run on restricted URLs (`chrome://`, `chrome-extension://`, etc.).
- Content script runs in the top frame only (`all_frames: false`).
- After installing or updating, refresh open tabs so the content script is injected.

## IDE

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode).
