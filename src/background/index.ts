import type { BackgroundResponse, ContentRequest, ContentResponse } from '../shared/messages'

chrome.runtime.onInstalled.addListener(() => {
  console.debug('[visual-screen-reader] extension installed')
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'GET_AX_TREE') return

  void (async () => {
    const response = await captureActiveTabAxTree()
    sendResponse(response)
  })()

  return true
})

async function captureActiveTabAxTree(): Promise<BackgroundResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab?.id) {
    return { type: 'AX_TREE_ERROR', error: 'No active tab in this window.' }
  }

  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    return {
      type: 'AX_TREE_ERROR',
      error: 'Cannot read the accessibility tree on this page. Open a normal web page.',
    }
  }

  try {
    const request: ContentRequest = { type: 'GET_AX_TREE' }
    const domTree = (await chrome.tabs.sendMessage(tab.id, request)) as
      | ContentResponse
      | undefined

    if (!domTree || domTree.type !== 'DOM_AX_TREE_RESULT') {
      return {
        type: 'AX_TREE_ERROR',
        error: 'Content script not ready. Refresh the page and try again.',
      }
    }

    return {
      type: 'AX_TREE_RESULT',
      tabId: tab.id,
      tabTitle: tab.title ?? '',
      url: tab.url,
      roots: domTree.roots,
      nodeCount: domTree.nodeCount,
      source: 'dom',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      type: 'AX_TREE_ERROR',
      error: `${message} Try refreshing the page.`,
    }
  }
}
