import type {
  AxTreeFocusMessage,
  AxTreePushMessage,
  BackgroundResponse,
  ContentRequest,
  ContentResponse,
  DomAxTreeUpdatedMessage,
  DomFocusChangedMessage,
} from '../shared/messages'

const watchingWindows = new Set<number>()
const pushDebounceTimers = new Map<number, ReturnType<typeof setTimeout>>()
const PUSH_DEBOUNCE_MS = 200

chrome.runtime.onInstalled.addListener(() => {
  console.debug('[visual-screen-reader] extension installed')
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SIDE_PANEL_OPEN') {
    watchingWindows.add(message.windowId)
    return
  }

  if (message?.type === 'SIDE_PANEL_CLOSE') {
    watchingWindows.delete(message.windowId)
    return
  }

  if (message?.type === 'DOM_AX_TREE_UPDATED') {
    const tabId = sender.tab?.id
    const windowId = sender.tab?.windowId
    if (tabId == null || windowId == null) return

    void (async () => {
      const update = message as DomAxTreeUpdatedMessage
      await maybePushDomAxTreeUpdate(tabId, windowId, update.roots, update.nodeCount)
    })()
    return
  }

  if (message?.type === 'DOM_FOCUS_CHANGED') {
    const tabId = sender.tab?.id
    const windowId = sender.tab?.windowId
    if (tabId == null || windowId == null) return

    void (async () => {
      const update = message as DomFocusChangedMessage
      await maybePushFocusChange(tabId, windowId, update.nodeId)
    })()
    return
  }

  if (message?.type !== 'GET_AX_TREE') return

  void (async () => {
    const response = await captureActiveTabAxTree()
    sendResponse(response)
  })()

  return true
})

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  if (!watchingWindows.has(windowId)) return
  scheduleTabCapture(tabId, windowId)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!watchingWindows.has(tab.windowId)) return
  if (changeInfo.status !== 'complete' && changeInfo.url === undefined) return
  scheduleTabCapture(tabId, tab.windowId)
})

function scheduleTabCapture(tabId: number, windowId: number): void {
  const existing = pushDebounceTimers.get(tabId)
  if (existing) clearTimeout(existing)

  pushDebounceTimers.set(
    tabId,
    setTimeout(() => {
      pushDebounceTimers.delete(tabId)
      void captureAndPushTabAxTree(tabId, windowId)
    }, PUSH_DEBOUNCE_MS),
  )
}

async function isActiveTab(tabId: number, windowId: number): Promise<boolean> {
  const [active] = await chrome.tabs.query({ active: true, windowId })
  return active?.id === tabId
}

async function maybePushFocusChange(
  tabId: number,
  windowId: number,
  nodeId: string | null,
): Promise<void> {
  if (!watchingWindows.has(windowId)) return
  if (!(await isActiveTab(tabId, windowId))) return

  const push: AxTreeFocusMessage = {
    type: 'AX_TREE_FOCUS',
    tabId,
    nodeId,
  }
  void chrome.runtime.sendMessage(push)
}

async function maybePushDomAxTreeUpdate(
  tabId: number,
  windowId: number,
  roots: DomAxTreeUpdatedMessage['roots'],
  nodeCount: number,
): Promise<void> {
  if (!watchingWindows.has(windowId)) return
  if (!(await isActiveTab(tabId, windowId))) return

  const tab = await chrome.tabs.get(tabId)
  const push: AxTreePushMessage = {
    type: 'AX_TREE_RESULT',
    tabId,
    tabTitle: tab.title ?? '',
    url: tab.url ?? '',
    roots,
    nodeCount,
    source: 'dom',
  }
  void chrome.runtime.sendMessage(push)
}

async function captureAndPushTabAxTree(tabId: number, windowId: number): Promise<void> {
  if (!watchingWindows.has(windowId)) return
  if (!(await isActiveTab(tabId, windowId))) return

  const response = await captureTabAxTree(tabId)
  void chrome.runtime.sendMessage(response)
}

async function captureActiveTabAxTree(): Promise<BackgroundResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab?.id) {
    return { type: 'AX_TREE_ERROR', error: 'No active tab in this window.' }
  }

  return captureTabAxTree(tab.id)
}

async function captureTabAxTree(tabId: number): Promise<BackgroundResponse> {
  const tab = await chrome.tabs.get(tabId)

  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    return {
      type: 'AX_TREE_ERROR',
      error: 'Cannot read the accessibility tree on this page. Open a normal web page.',
    }
  }

  try {
    const request: ContentRequest = { type: 'GET_AX_TREE' }
    const domTree = (await chrome.tabs.sendMessage(tabId, request)) as
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
      tabId,
      tabTitle: tab.title ?? '',
      url: tab.url,
      roots: domTree.roots,
      nodeCount: domTree.nodeCount,
      focusedNodeId: domTree.focusedNodeId,
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
