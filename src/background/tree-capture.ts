import { type AxTreeNode, countAxTreeNodes } from '../shared/ax-tree'
import type {
  AxTreeResultMessage,
  BackgroundResponse,
  DomAxTreeResultMessage,
} from '../shared/messages'

export interface TreeCaptureDeps {
  getActiveTabInWindow(windowId: number): Promise<chrome.tabs.Tab | undefined>
  getTab(tabId: number): Promise<chrome.tabs.Tab>
  /** Focused DOM path from the content script; `undefined` when the content script is unreachable. */
  getFocusFromContent(tabId: number): Promise<string | null | undefined>
  /** DOM-derived fallback tree; `null` when the content script is unreachable. */
  getDomTreeFromContent(tabId: number): Promise<DomAxTreeResultMessage | null>
  fetchCdpAxTree(tabId: number): Promise<AxTreeNode[]>
  isWatchingWindow(windowId: number): boolean
  warnCdpFallback(error: string): void
}

export interface TreeCapture {
  captureActiveTabAxTree(windowId: number): Promise<BackgroundResponse>
  captureTabAxTree(tabId: number, focusedNodeIdOverride?: string | null): Promise<BackgroundResponse>
}

const RESTRICTED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'chrome-search://',
  'chrome-untrusted://',
  'devtools://',
  'edge://',
  'about:',
  'view-source:',
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
]

/** Pages where Chrome blocks both content scripts and `chrome.debugger`. */
export function canReadTab(tab: chrome.tabs.Tab): boolean {
  const url = tab.url
  if (!url) return false
  return !RESTRICTED_URL_PREFIXES.some((prefix) => url.startsWith(prefix))
}

const RESTRICTED_PAGE_ERROR = 'Cannot read the accessibility tree on this page. Open a normal web page.'
const CONTENT_NOT_READY_ERROR = 'Content script not ready. Refresh the page and try again.'

function buildAxTreeResult(
  tab: chrome.tabs.Tab,
  tabId: number,
  roots: AxTreeNode[],
  focusedNodeId: string | null,
  source: 'cdp' | 'dom',
  cdpError?: string,
): AxTreeResultMessage {
  return {
    type: 'AX_TREE_RESULT',
    tabId,
    tabTitle: tab.title ?? '',
    url: tab.url ?? '',
    roots,
    nodeCount: countAxTreeNodes(roots),
    focusedNodeId,
    source,
    cdpError,
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function createTreeCapture(deps: TreeCaptureDeps): TreeCapture {
  async function captureDomFallback(
    tab: chrome.tabs.Tab,
    tabId: number,
    focusedNodeIdOverride: string | null | undefined,
    cdpError?: string,
  ): Promise<BackgroundResponse> {
    const domTree = await deps.getDomTreeFromContent(tabId)
    if (!domTree) {
      const reason = cdpError ? ` (CDP: ${cdpError})` : ''
      return { type: 'AX_TREE_ERROR', error: `${CONTENT_NOT_READY_ERROR}${reason}` }
    }

    const focusedNodeId = focusedNodeIdOverride ?? domTree.focusedNodeId
    return buildAxTreeResult(tab, tabId, domTree.roots, focusedNodeId, 'dom', cdpError)
  }

  async function captureTabAxTree(
    tabId: number,
    focusedNodeIdOverride?: string | null,
  ): Promise<BackgroundResponse> {
    try {
      const tab = await deps.getTab(tabId)
      if (!canReadTab(tab)) return { type: 'AX_TREE_ERROR', error: RESTRICTED_PAGE_ERROR }

      const canUseCdp = tab.windowId != null && deps.isWatchingWindow(tab.windowId)
      if (!canUseCdp) return await captureDomFallback(tab, tabId, focusedNodeIdOverride)

      // Only the focus path is needed from the page when CDP supplies the tree. A missing content
      // script (e.g. tab opened before install) still yields a CDP tree, just without focus.
      const [cdpResult, contentFocus] = await Promise.all([
        deps.fetchCdpAxTree(tabId).then(
          (roots) => ({ ok: true as const, roots }),
          (err: unknown) => ({ ok: false as const, error: errorMessage(err) }),
        ),
        focusedNodeIdOverride === undefined
          ? deps.getFocusFromContent(tabId)
          : Promise.resolve(focusedNodeIdOverride),
      ])

      if (cdpResult.ok) {
        const focusedNodeId = focusedNodeIdOverride ?? contentFocus ?? null
        return buildAxTreeResult(tab, tabId, cdpResult.roots, focusedNodeId, 'cdp')
      }

      deps.warnCdpFallback(cdpResult.error)
      return await captureDomFallback(tab, tabId, focusedNodeIdOverride, cdpResult.error)
    } catch (err) {
      return { type: 'AX_TREE_ERROR', error: `${errorMessage(err)} Try refreshing the page.` }
    }
  }

  async function captureActiveTabAxTree(windowId: number): Promise<BackgroundResponse> {
    const tab = await deps.getActiveTabInWindow(windowId)

    if (tab?.id == null) {
      return { type: 'AX_TREE_ERROR', error: 'No active tab in this window.' }
    }

    return captureTabAxTree(tab.id)
  }

  return { captureActiveTabAxTree, captureTabAxTree }
}
