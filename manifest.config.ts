import { defineManifest, type ManifestV3Export } from '@crxjs/vite-plugin'

export type TargetBrowser = 'chrome' | 'firefox'

const PANEL_PATH = 'src/sidepanel/index.html'
const BACKGROUND_PATH = 'src/background/index.ts'

const shared = {
  manifest_version: 3,
  name: 'Visual Screen Reader',
  description: 'Visual screen reader side panel for web pages',
  version: '0.0.1',
  icons: {
    16: 'public/favicon.svg',
    32: 'public/favicon.svg',
    48: 'public/favicon.svg',
    128: 'public/favicon.svg',
  },
  action: {
    default_title: 'Visual Screen Reader',
    default_icon: {
      16: 'public/favicon.svg',
      32: 'public/favicon.svg',
    },
  },
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      js: ['src/content/main.ts'],
      matches: ['<all_urls>'],
      all_frames: false,
      match_about_blank: true,
      run_at: 'document_idle' as const,
    },
  ],
}

const chromeManifest = defineManifest({
  ...shared,
  side_panel: {
    default_path: PANEL_PATH,
  },
  permissions: ['sidePanel', 'tabs', 'debugger'],
  background: {
    service_worker: BACKGROUND_PATH,
    type: 'module',
  },
})

// Firefox has no `chrome.debugger` (CDP) or side panel: it uses `sidebar_action` and an event-page
// background (`background.scripts`), and the tree comes from the content script's DOM builder.
const firefoxManifest = defineManifest({
  ...shared,
  sidebar_action: {
    default_title: 'Visual Screen Reader',
    default_panel: PANEL_PATH,
    default_icon: 'public/favicon.svg',
    open_at_install: false,
  },
  permissions: ['tabs'],
  background: {
    scripts: [BACKGROUND_PATH],
    type: 'module',
  },
  browser_specific_settings: {
    gecko: {
      id: 'visual-screen-reader@maxwellcohen.github.io',
      strict_min_version: '140.0',
      data_collection_permissions: {
        required: ['none'],
      },
    },
  },
} as unknown as Parameters<typeof defineManifest>[0])

export function manifestFor(browser: TargetBrowser): ManifestV3Export {
  return browser === 'firefox' ? firefoxManifest : chromeManifest
}

export default chromeManifest
