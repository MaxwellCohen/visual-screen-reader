import { countAxTreeNodes, type AxTreeNode } from '../shared/ax-tree'
import type { AxTreePushMessage, BackgroundResponse, ContentResponse } from '../shared/messages'

export interface TreeCaptureDeps {
  getActiveTab(): Promise<chrome.tabs.Tab | undefined>
  getTab(tabId: number): Promise<chrome.tabs.Tab>
  getDomTreeFromContent(tabId: number): Promise<ContentResponse | null>
  fetchCdpAxTree(tabId: number): Promise<AxTreeNode[]>
  isWatchingWindow(windowId: number): boolean
  warnCdpFallback(error: string): void
}

export interface TreeCapture {
  captureActiveTabAxTree(): Promise<BackgroundResponse>
  captureTabAxTree(tabId: number, focusedNodeIdOverride?: string | null): Promise<BackgroundResponse>
}

function canReadTab(tab: chrome.tabs.Tab): boolean {
  return Boolean(tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://'))
}

function buildAxTreeResult(
  tab: chrome.tabs.Tab,
  tabId: number,
  roots: AxTreeNode[],
  focusedNodeId: string | null,
  source: 'cdp' | 'dom',
  cdpError?: string,
): AxTreePushMessage {
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

export function createTreeCapture(deps: TreeCaptureDeps): TreeCapture {
  async function captureTabAxTree(
    tabId: number,
    focusedNodeIdOverride?: string | null,
  ): Promise<BackgroundResponse> {
    const tab = await deps.getTab(tabId)

    if (!canReadTab(tab)) {
      return {
        type: 'AX_TREE_ERROR',
        error: 'Cannot read the accessibility tree on this page. Open a normal web page.',
      }
    }

    try {
      const domTree = await deps.getDomTreeFromContent(tabId)
      if (!domTree) {
        return {
          type: 'AX_TREE_ERROR',
          error: 'Content script not ready. Refresh the page and try again.',
        }
      }

      const focusedNodeId = focusedNodeIdOverride ?? domTree.focusedNodeId
      const canUseCdp = tab.windowId != null && deps.isWatchingWindow(tab.windowId)

      if (!canUseCdp) {
        return buildAxTreeResult(tab, tabId, domTree.roots, focusedNodeId, 'dom')
      }

      try {
        const roots = await deps.fetchCdpAxTree(tabId)
        return buildAxTreeResult(tab, tabId, roots, focusedNodeId, 'cdp')
      } catch (cdpErr) {
        const cdpError = cdpErr instanceof Error ? cdpErr.message : String(cdpErr)
        deps.warnCdpFallback(cdpError)
        return buildAxTreeResult(tab, tabId, domTree.roots, focusedNodeId, 'dom', cdpError)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        type: 'AX_TREE_ERROR',
        error: `${message} Try refreshing the page.`,
      }
    }
  }

  async function captureActiveTabAxTree(): Promise<BackgroundResponse> {
    const tab = await deps.getActiveTab()

    if (!tab?.id) {
      return { type: 'AX_TREE_ERROR', error: 'No active tab in this window.' }
    }

    if (tab.windowId == null || !deps.isWatchingWindow(tab.windowId)) {
      return {
        type: 'AX_TREE_ERROR',
        error: 'Open the side panel on this tab to capture the accessibility tree.',
      }
    }

    return captureTabAxTree(tab.id)
  }

  return { captureActiveTabAxTree, captureTabAxTree }
}
