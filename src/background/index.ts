import type { AxTreeNode } from '../shared/ax-tree'
import { countAxTreeNodes } from '../shared/ax-tree'
import type {
  AxTreeFocusMessage,
  AxTreePushMessage,
  BackgroundResponse,
  ContentRequest,
  ContentResponse,
  DomAxTreeUpdatedMessage,
  DomFocusChangedMessage,
} from '../shared/messages'
import { detachDebugger, fetchLinkedCdpAxTree, isDebuggerAttached } from './cdp-ax-tree'

const watchingWindows = new Set<number>()
const pushDebounceTimers = new Map<number, ReturnType<typeof setTimeout>>()
const domUpdateDebounceTimers = new Map<number, ReturnType<typeof setTimeout>>()
const pendingDomFocusByTab = new Map<number, string | null>()
const captureInFlight = new Set<number>()
const pendingCaptureAfterFlight = new Map<
  number,
  { windowId: number; focusedNodeId?: string | null }
>()
const PUSH_DEBOUNCE_MS = 200
const DOM_UPDATE_DEBOUNCE_MS = 250

chrome.runtime.onInstalled.addListener(() => {
  console.debug('[visual-screen-reader] extension installed')
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

chrome.sidePanel.onOpened.addListener((info) => {
  void startWatchingWindow(info.windowId)
})

chrome.sidePanel.onClosed.addListener((info) => {
  void stopWatchingWindow(info.windowId)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SIDE_PANEL_OPEN') {
    void startWatchingWindow(message.windowId)
    return
  }

  if (message?.type === 'SIDE_PANEL_CLOSE') {
    void stopWatchingWindow(message.windowId)
    return
  }

  if (message?.type === 'DOM_AX_TREE_UPDATED') {
    const tabId = sender.tab?.id
    const windowId = sender.tab?.windowId
    if (tabId == null || windowId == null || !watchingWindows.has(windowId)) return

    scheduleDomUpdateCapture(tabId, windowId, (message as DomAxTreeUpdatedMessage).focusedNodeId)
    return
  }

  if (message?.type === 'DOM_FOCUS_CHANGED') {
    const tabId = sender.tab?.id
    const windowId = sender.tab?.windowId
    if (tabId == null || windowId == null || !watchingWindows.has(windowId)) return

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
  void syncWatchingTabs(windowId, tabId)
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

function scheduleDomUpdateCapture(
  tabId: number,
  windowId: number,
  focusedNodeId: string | null,
): void {
  pendingDomFocusByTab.set(tabId, focusedNodeId)

  const existing = domUpdateDebounceTimers.get(tabId)
  if (existing) clearTimeout(existing)

  domUpdateDebounceTimers.set(
    tabId,
    setTimeout(() => {
      domUpdateDebounceTimers.delete(tabId)
      const latestFocus = pendingDomFocusByTab.get(tabId) ?? focusedNodeId
      pendingDomFocusByTab.delete(tabId)
      void captureAndPushTabAxTree(tabId, windowId, latestFocus)
    }, DOM_UPDATE_DEBOUNCE_MS),
  )
}

async function captureAndPushTabAxTree(
  tabId: number,
  windowId: number,
  focusedNodeIdOverride?: string | null,
): Promise<void> {
  if (!watchingWindows.has(windowId)) return
  if (!(await isActiveTab(tabId, windowId))) return

  if (captureInFlight.has(tabId)) {
    pendingCaptureAfterFlight.set(tabId, { windowId, focusedNodeId: focusedNodeIdOverride })
    return
  }

  captureInFlight.add(tabId)
  try {
    const response = await captureTabAxTree(tabId, focusedNodeIdOverride)
    if (response.type === 'AX_TREE_RESULT') {
      void chrome.runtime.sendMessage(response)
    }
  } finally {
    captureInFlight.delete(tabId)
    const pending = pendingCaptureAfterFlight.get(tabId)
    if (pending) {
      pendingCaptureAfterFlight.delete(tabId)
      void captureAndPushTabAxTree(tabId, pending.windowId, pending.focusedNodeId)
    }
  }
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

async function setTabWatching(tabId: number, watching: boolean): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SET_WATCHING', watching })
  } catch {
    // Content script may not be injected on this page yet.
  }
}

async function setWindowTabsWatching(windowId: number, watching: boolean): Promise<void> {
  const tabs = await chrome.tabs.query({ windowId })
  await Promise.all(tabs.map((tab) => (tab.id != null ? setTabWatching(tab.id, watching) : undefined)))
}

async function detachDebuggersInWindow(windowId: number): Promise<void> {
  const tabs = await chrome.tabs.query({ windowId })
  await Promise.all(
    tabs.map((tab) => (tab.id != null && isDebuggerAttached(tab.id) ? detachDebugger(tab.id) : undefined)),
  )
}

async function syncWatchingTabs(windowId: number, activeTabId: number): Promise<void> {
  const tabs = await chrome.tabs.query({ windowId })
  await Promise.all(
    tabs.map((tab) => {
      if (tab.id == null) return undefined
      return setTabWatching(tab.id, tab.id === activeTabId)
    }),
  )

  await Promise.all(
    tabs.map((tab) =>
      tab.id != null && tab.id !== activeTabId && isDebuggerAttached(tab.id)
        ? detachDebugger(tab.id)
        : undefined,
    ),
  )
}

async function startWatchingWindow(windowId: number): Promise<void> {
  const wasWatching = watchingWindows.has(windowId)
  watchingWindows.add(windowId)
  if (wasWatching) return

  const [active] = await chrome.tabs.query({ active: true, windowId })
  if (active?.id != null) {
    await syncWatchingTabs(windowId, active.id)
  }
}

async function stopWatchingWindow(windowId: number): Promise<void> {
  if (!watchingWindows.has(windowId)) return
  watchingWindows.delete(windowId)

  await setWindowTabsWatching(windowId, false)
  await detachDebuggersInWindow(windowId)

  const tabs = await chrome.tabs.query({ windowId })
  for (const tab of tabs) {
    if (tab.id == null) continue
    const pushTimer = pushDebounceTimers.get(tab.id)
    if (pushTimer) {
      clearTimeout(pushTimer)
      pushDebounceTimers.delete(tab.id)
    }
    const domTimer = domUpdateDebounceTimers.get(tab.id)
    if (domTimer) {
      clearTimeout(domTimer)
      domUpdateDebounceTimers.delete(tab.id)
    }
    pendingDomFocusByTab.delete(tab.id)
  }
}

async function captureActiveTabAxTree(): Promise<BackgroundResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab?.id) {
    return { type: 'AX_TREE_ERROR', error: 'No active tab in this window.' }
  }

  if (tab.windowId == null || !watchingWindows.has(tab.windowId)) {
    return {
      type: 'AX_TREE_ERROR',
      error: 'Open the side panel on this tab to capture the accessibility tree.',
    }
  }

  return captureTabAxTree(tab.id)
}

async function getDomTreeFromContent(tabId: number): Promise<ContentResponse | null> {
  const request: ContentRequest = { type: 'GET_AX_TREE' }
  const response = (await chrome.tabs.sendMessage(tabId, request)) as ContentResponse | undefined
  if (!response || response.type !== 'DOM_AX_TREE_RESULT') return null
  return response
}

async function captureTabAxTree(
  tabId: number,
  focusedNodeIdOverride?: string | null,
): Promise<BackgroundResponse> {
  const tab = await chrome.tabs.get(tabId)

  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    return {
      type: 'AX_TREE_ERROR',
      error: 'Cannot read the accessibility tree on this page. Open a normal web page.',
    }
  }

  try {
    const domTree = await getDomTreeFromContent(tabId)
    if (!domTree) {
      return {
        type: 'AX_TREE_ERROR',
        error: 'Content script not ready. Refresh the page and try again.',
      }
    }

    const focusedNodeId = focusedNodeIdOverride ?? domTree.focusedNodeId
    const canUseCdp = tab.windowId != null && watchingWindows.has(tab.windowId)

    if (!canUseCdp) {
      return buildAxTreeResult(tab, tabId, domTree.roots, focusedNodeId, 'dom')
    }

    try {
      const roots = await fetchLinkedCdpAxTree(tabId)
      return buildAxTreeResult(tab, tabId, roots, focusedNodeId, 'cdp')
    } catch (cdpErr) {
      const cdpError = cdpErr instanceof Error ? cdpErr.message : String(cdpErr)
      console.warn('[visual-screen-reader] CDP capture failed, using DOM fallback:', cdpError)
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
