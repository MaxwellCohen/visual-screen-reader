import type {
  ContentRequest,
  DomAxTreeResultMessage,
  DomAxTreeUpdatedMessage,
  DomFocusChangedMessage,
  DomFocusResultMessage,
  GetAxTreeMessage,
  SidePanelPushMessage,
} from '../shared/messages'
import { parseSidePanelPortName } from '../shared/messages'
import {
  detachAllDebuggers,
  detachDebugger,
  fetchLinkedCdpAxTree,
  hasCdp,
  isDebuggerAttached,
} from './cdp-ax-tree'
import { createTreeCapture } from './tree-capture'
import { createWatchSession, type WatchSession } from './watch-session'

/** Connected side panel ports, keyed by window id. */
const sidePanelPorts = new Map<number, chrome.runtime.Port>()

let watchSession: WatchSession

async function queryActiveTabInWindow(windowId: number): Promise<chrome.tabs.Tab | undefined> {
  const [active] = await chrome.tabs.query({ active: true, windowId })
  return active
}

const treeCapture = createTreeCapture({
  getActiveTabInWindow: queryActiveTabInWindow,
  getTab: (tabId) => chrome.tabs.get(tabId),
  getFocusFromContent,
  getDomTreeFromContent,
  fetchCdpAxTree: hasCdp ? fetchLinkedCdpAxTree : undefined,
  isWatchingWindow: (windowId) => watchSession.isWatchingWindow(windowId),
  warnCdpFallback(error) {
    console.warn('[visual-screen-reader] CDP capture failed, using DOM fallback:', error)
  },
})

watchSession = createWatchSession({
  queryTabsInWindow: (windowId) => chrome.tabs.query({ windowId }),
  queryActiveTabInWindow,
  setTabWatching,
  detachDebugger,
  isDebuggerAttached,
  captureTabAxTree: treeCapture.captureTabAxTree,
  pushMessage(windowId, message: SidePanelPushMessage) {
    try {
      sidePanelPorts.get(windowId)?.postMessage(message)
    } catch {
      // Port disconnected between lookup and post; onDisconnect will clean up.
    }
  },
})

/** Firefox's sidebar API (not in `@types/chrome`). */
interface SidebarActionApi {
  toggle(): Promise<void>
}

const sidebarAction = (globalThis as { browser?: { sidebarAction?: SidebarActionApi } }).browser
  ?.sidebarAction

chrome.runtime.onInstalled.addListener(() => {
  console.debug('[visual-screen-reader] extension installed')
  void chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true })
})

// Firefox: the toolbar button toggles the sidebar (must be called synchronously in the click handler).
if (sidebarAction) {
  chrome.action.onClicked.addListener(() => {
    void sidebarAction.toggle()
  })
}

// The side panel holds a port for as long as it is open. Unlike `sidePanel.onOpened/onClosed`
// (Chrome 141+/142+) this works on every Chrome with side panels, disconnects reliably when the
// panel closes, and the panel reconnects after a service worker restart to restore watch state.
chrome.runtime.onConnect.addListener((port) => {
  const windowId = parseSidePanelPortName(port.name)
  if (windowId == null) return

  sidePanelPorts.get(windowId)?.disconnect()
  sidePanelPorts.set(windowId, port)
  void watchSession.startWatchingWindow(windowId)

  port.onDisconnect.addListener(() => {
    if (sidePanelPorts.get(windowId) !== port) return
    sidePanelPorts.delete(windowId)
    void watchSession.stopWatchingWindow(windowId)
  })
})

chrome.runtime.onSuspend.addListener(() => {
  void detachAllDebuggers()
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  const { windowId } = message as GetAxTreeMessage
  void (async () => {
    // The request comes from an open panel; its port may not have been processed yet.
    await watchSession.startWatchingWindow(windowId)
    sendResponse(await treeCapture.captureActiveTabAxTree(windowId))
  })()

  return true
})

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  watchSession.handleTabActivated(tabId, windowId)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  watchSession.handleTabUpdated(tabId, tab.windowId, changeInfo)
})

async function sendToContent<T>(tabId: number, request: ContentRequest): Promise<T | undefined> {
  try {
    return (await chrome.tabs.sendMessage(tabId, request)) as T | undefined
  } catch {
    // No content script on this page (restricted, still loading, or opened before install).
    return undefined
  }
}

async function setTabWatching(tabId: number, watching: boolean): Promise<void> {
  await sendToContent(tabId, { type: 'SET_WATCHING', watching })
}

async function getFocusFromContent(tabId: number): Promise<string | null | undefined> {
  const response = await sendToContent<DomFocusResultMessage>(tabId, { type: 'GET_DOM_FOCUS' })
  return response?.type === 'DOM_FOCUS_RESULT' ? response.focusedNodeId : undefined
}

async function getDomTreeFromContent(tabId: number): Promise<DomAxTreeResultMessage | null> {
  const response = await sendToContent<DomAxTreeResultMessage>(tabId, { type: 'GET_DOM_AX_TREE' })
  return response?.type === 'DOM_AX_TREE_RESULT' ? response : null
}
