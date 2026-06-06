import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Visual Screen Reader',
  description: 'Visual screen reader overlay for web pages',
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
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  permissions: ['storage', 'activeTab', 'scripting', 'sidePanel', 'tabs'],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      js: ['src/content/main.ts'],
      matches: ['<all_urls>'],
      all_frames: false,
      match_about_blank: true,
      run_at: 'document_idle',
    },
  ],
})
