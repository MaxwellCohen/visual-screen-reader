import type {
  ContentRequest,
  ContentResponse,
  DomAxTreeUpdatedMessage,
  DomFocusChangedMessage,
} from '../shared/messages'
import { detachDebugger, fetchLinkedCdpAxTree, isDebuggerAttached } from './cdp-ax-tree'
import { createTreeCapture } from './tree-capture'
import { createWatchSession, type WatchSession } from './watch-session'

let watchSession: WatchSession

const treeCapture = createTreeCapture({
  async getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    return tab
  },
  getTab: (tabId) => chrome.tabs.get(tabId),
  getDomTreeFromContent,
  fetchCdpAxTree: fetchLinkedCdpAxTree,
  isWatchingWindow: (windowId) => watchSession.isWatchingWindow(windowId),
  warnCdpFallback(error) {
    console.warn('[visual-screen-reader] CDP capture failed, using DOM fallback:', error)
  },
})

watchSession = createWatchSession({
  queryTabsInWindow: (windowId) => chrome.tabs.query({ windowId }),
  async queryActiveTabInWindow(windowId) {
    const [active] = await chrome.tabs.query({ active: true, windowId })
    return active
  },
  setTabWatching,
  detachDebugger,
  isDebuggerAttached,
  captureTabAxTree: treeCapture.captureTabAxTree,
  pushMessage(message) {
    void chrome.runtime.sendMessage(message)
  },
})

chrome.runtime.onInstalled.addListener(() => {
  console.debug('[visual-screen-reader] extension installed')
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

chrome.sidePanel.onOpened.addListener((info) => {
  void watchSession.startWatchingWindow(info.windowId)
})

chrome.sidePanel.onClosed.addListener((info) => {
  void watchSession.stopWatchingWindow(info.windowId)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SIDE_PANEL_OPEN') {
    void watchSession.startWatchingWindow(message.windowId)
    return
  }

  if (message?.type === 'SIDE_PANEL_CLOSE') {
    void watchSession.stopWatchingWindow(message.windowId)
    return
  }

  if (message?.type === 'DOM_AX_TREE_UPDATED') {
    const update = message as DomAxTreeUpdatedMessage
    watchSession.handleDomUpdate(sender.tab?.id, sender.tab?.windowId, update.focusedNodeId)
    return
  }

  if (message?.type === 'DOM_FOCUS_CHANGED') {
    const update = message as DomFocusChangedMessage
    watchSession.handleFocusChange(sender.tab?.id, sender.tab?.windowId, update.nodeId)
    return
  }

  if (message?.type !== 'GET_AX_TREE') return

  void (async () => {
    const response = await treeCapture.captureActiveTabAxTree()
    sendResponse(response)
  })()

  return true
})

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  watchSession.handleTabActivated(tabId, windowId)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  watchSession.handleTabUpdated(tabId, tab.windowId, changeInfo)
})

async function setTabWatching(tabId: number, watching: boolean): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SET_WATCHING', watching })
  } catch {
    // Content script may not be injected on this page yet.
  }
}

async function getDomTreeFromContent(tabId: number): Promise<ContentResponse | null> {
  const request: ContentRequest = { type: 'GET_AX_TREE' }
  const response = (await chrome.tabs.sendMessage(tabId, request)) as ContentResponse | undefined
  if (!response || response.type !== 'DOM_AX_TREE_RESULT') return null
  return response
}
