# Visual Screen Reader

Chrome extension (Manifest V3) that shows the **browser’s internal accessibility tree** (via Chrome DevTools Protocol) in a side panel — linked to the page DOM for focus and live updates.

A **Firefox** build is also available. It shows the tree in Firefox's sidebar, but Firefox has no CDP or other extension API for the browser's accessibility tree, so that build uses the content script's DOM-derived tree instead (see [Firefox](#firefox)).

Built with **Svelte 5**, **TypeScript**, and **Vite**, using [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin) for HMR and extension builds.

## Features

- **Browser AX tree via CDP** — captures the real accessibility tree from Chrome (`Accessibility.getFullAXTree`), not a DOM approximation
- **DOM-linked focus** — content script and CDP linker share a body-relative path scheme (`body.0.1…`); CDP nodes are linked via `backendDOMNodeId` so focus tracking matches the page
- **Screen reader view** — readable, speech-oriented rendering of the tree (landmarks, headings, links, etc.)
- **Raw JSON** — full tree payload for debugging
- **Live updates** — DOM observers and focus listeners trigger CDP re-capture when the page changes, focus moves, the active tab switches, or the page navigates (including SPA `pushState` / `replaceState` routes, via `tabs.onUpdated` and the Navigation API). Captures are debounced and throttled to roughly the time the previous capture took, so busy pages can't monopolise CDP.
- **Per-window panels** — each window's side panel only receives updates for that window's active tab
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
                                         │  DOM.getDocument (pierce, link to DOM)         │
                                         │                                                │
                                         │  debounced push on tab/DOM/focus changes       │
                                         │  MutationObserver + focus listeners            │
                                         │  compute body-relative paths via CDP DOM tree  │
                                         └────────────────────────────────────────────────┘
```

1. The **side panel** opens a long-lived port (`sidepanel:<windowId>`) to the service worker. The port scopes live pushes to that window, its disconnect signals that the panel closed, and the panel reconnects automatically if Chrome stops the idle service worker.
2. The **content script** of the watched tab (only the active tab of a window with an open panel) watches the DOM (mutations, focus, navigation) and reports focus using stable body-relative node paths. Other tabs don't run a MutationObserver.
3. On each update trigger, the **service worker** attaches the debugger, fetches the CDP accessibility tree, and links nodes to those paths via `backendDOMNodeId` and `DOM.getDocument` (without mutating the page DOM). It only asks the content script for the focused path, not a whole tree.
4. The **side panel** renders the CDP tree (screen-reader-style or JSON) and highlights focus using the linked DOM node ids.
5. If CDP capture fails (e.g. another debugger is attached), the service worker asks the content script for a DOM-derived fallback tree. If the content script is missing (e.g. a tab opened before the extension was installed), CDP still works, just without focus tracking until the page is reloaded.

## Project layout

| Path | Role |
|------|------|
| `manifest.config.ts` | Extension manifests for Chrome and Firefox (side panel / sidebar, content scripts, permissions) |
| `src/sidepanel/` | Chrome side panel UI (Svelte) |
| `src/content/` | Content script — DOM observers, focus tracking, DOM AX fallback |
| `src/background/` | MV3 service worker — CDP capture, tab routing, message handling |
| `src/background/cdp-ax-tree.ts` | CDP debugger attach, AX tree fetch, DOM linking |
| `src/shared/` | Shared types (`AxTreeNode`, message contracts, DOM indexing) |
| `src/lib/` | Tree rendering and speech-oriented presentation |
| `public/` | Static assets referenced from the manifest |

## Install a prebuilt version

1. Download `visual-screen-reader.zip` from the [latest build](https://github.com/MaxwellCohen/visual-screen-reader/releases/tag/latest) (rebuilt on every push to `main`) or from a [versioned release](https://github.com/MaxwellCohen/visual-screen-reader/releases).
2. Unzip it.
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the unzipped folder.

For Firefox, download `visual-screen-reader-firefox.zip` instead, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and select the zip (or its `manifest.json` once unzipped). Temporary add-ons are removed when Firefox restarts; a permanent install needs the add-on signed through [addons.mozilla.org](https://addons.mozilla.org/developers/).

To update, replace the folder's contents with a newer zip and click **Reload** on the extension card.

To cut a versioned release, push a tag: `git tag v0.1.0 && git push origin v0.1.0`.

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

## Firefox

```bash
pnpm dev:firefox     # dev server on port 5174, output in dist-firefox/
pnpm build:firefox   # production build in dist-firefox/
```

Load `dist-firefox/manifest.json` via **Load Temporary Add-on…** in `about:debugging#/runtime/this-firefox`, then click the toolbar button (or **View → Sidebar → Visual Screen Reader**) to open the sidebar. Requires Firefox 140+.

Differences from the Chrome build:

- **Tree source** — always the DOM-derived tree from the content script (`source: 'dom'`); Firefox has no `chrome.debugger` / CDP for extensions. Roles and names are approximations rather than Firefox's real AX tree.
- **Panel** — uses `sidebar_action` instead of `side_panel`; the toolbar button toggles it.
- **Background** — runs as an event page (`background.scripts`) instead of a service worker. The panel reconnects its port if Firefox unloads it, the same way it does after a Chrome service worker restart.
- **Restricted pages** — `about:`, `moz-extension://`, `resource://`, and addons.mozilla.org are blocked.
- **Site access** — if the tree reports "Content script not ready", check that the add-on has permission to access all websites (**Manage extension → Permissions**), then reload the page.

## Typecheck / lint / test

```bash
pnpm check
pnpm lint
pnpm test
```

## Limitations

- Attaching the debugger shows Chrome’s “being controlled by automated test software” banner and conflicts with DevTools on the same tab.
- Cannot run on restricted URLs (`chrome://`, `chrome-extension://`, `about:`, etc.).
- The Firefox build has no access to the browser's own accessibility tree (see [Firefox](#firefox)).
- Content script runs in the **top frame only** (`all_frames: false`) and walks the light DOM — shadow roots and iframes are not indexed by the content-script path builder (CDP may still see them via `pierce: true`).
- Path indexing treats only the HTML `hidden` attribute (and ignored tags / empty `aria-hidden` subtrees) as excluded — CSS `display:none` / `visibility:hidden` alone do not change paths, so DOM and CDP path schemes stay aligned.
- After installing or updating, refresh open tabs so the content script is injected.

## IDE

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode).
