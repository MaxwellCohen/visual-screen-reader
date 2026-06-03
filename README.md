# Visual Screen Reader

Chrome extension (Manifest V3) built with **Svelte 5**, **TypeScript**, and **Vite**, using [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin) for HMR and extension builds.

## Project layout

| Path | Role |
|------|------|
| `manifest.config.ts` | Extension manifest (side panel, content scripts, permissions) |
| `src/sidepanel/` | Chrome side panel UI (Svelte) |
| `src/content/` | Content script injected into web pages |
| `src/background/` | MV3 service worker |
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

Click the extension icon to open the **side panel** (Chrome 114+).

## Production build

```bash
pnpm build
```

Load the `dist` folder the same way as in development.

## Typecheck

```bash
pnpm check
```

## IDE

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode).
