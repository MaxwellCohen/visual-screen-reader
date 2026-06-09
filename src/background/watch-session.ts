import type { AxTreeFocusMessage, AxTreePushMessage, BackgroundResponse } from '../shared/messages'

export interface WatchSessionDeps {
  queryTabsInWindow(windowId: number): Promise<chrome.tabs.Tab[]>
  queryActiveTabInWindow(windowId: number): Promise<chrome.tabs.Tab | undefined>
  setTabWatching(tabId: number, watching: boolean): Promise<void>
  detachDebugger(tabId: number): Promise<void>
  isDebuggerAttached(tabId: number): boolean
  captureTabAxTree(tabId: number, focusedNodeIdOverride?: string | null): Promise<BackgroundResponse>
  pushMessage(message: AxTreePushMessage | AxTreeFocusMessage): void
}

export interface WatchSession {
  isWatchingWindow(windowId: number): boolean
  startWatchingWindow(windowId: number): Promise<void>
  stopWatchingWindow(windowId: number): Promise<void>
  handleTabActivated(tabId: number, windowId: number): void
  handleTabUpdated(tabId: number, windowId: number, changeInfo: chrome.tabs.OnUpdatedInfo): void
  handleDomUpdate(tabId: number | undefined, windowId: number | undefined, focusedNodeId: string | null): void
  handleFocusChange(tabId: number | undefined, windowId: number | undefined, nodeId: string | null): void
  captureAndPushTabAxTree(
    tabId: number,
    windowId: number,
    focusedNodeIdOverride?: string | null,
  ): Promise<void>
}

const PUSH_DEBOUNCE_MS = 200
const DOM_UPDATE_DEBOUNCE_MS = 250

export function createWatchSession(deps: WatchSessionDeps): WatchSession {
  const watchingWindows = new Set<number>()
  const pushDebounceTimers = new Map<number, ReturnType<typeof setTimeout>>()
  const domUpdateDebounceTimers = new Map<number, ReturnType<typeof setTimeout>>()
  const pendingDomFocusByTab = new Map<number, string | null>()
  const captureInFlight = new Set<number>()
  const pendingCaptureAfterFlight = new Map<
    number,
    { windowId: number; focusedNodeId?: string | null }
  >()

  function isWatchingWindow(windowId: number): boolean {
    return watchingWindows.has(windowId)
  }

  async function isActiveTab(tabId: number, windowId: number): Promise<boolean> {
    const active = await deps.queryActiveTabInWindow(windowId)
    return active?.id === tabId
  }

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
      const response = await deps.captureTabAxTree(tabId, focusedNodeIdOverride)
      if (response.type === 'AX_TREE_RESULT') {
        deps.pushMessage(response)
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
    deps.pushMessage(push)
  }

  async function syncWatchingTabs(windowId: number, activeTabId: number): Promise<void> {
    const tabs = await deps.queryTabsInWindow(windowId)
    await Promise.all(
      tabs.map((tab) => {
        if (tab.id == null) return undefined
        return deps.setTabWatching(tab.id, tab.id === activeTabId)
      }),
    )

    await Promise.all(
      tabs.map((tab) =>
        tab.id != null && tab.id !== activeTabId && deps.isDebuggerAttached(tab.id)
          ? deps.detachDebugger(tab.id)
          : undefined,
      ),
    )
  }

  async function startWatchingWindow(windowId: number): Promise<void> {
    const wasWatching = watchingWindows.has(windowId)
    watchingWindows.add(windowId)
    if (wasWatching) return

    const active = await deps.queryActiveTabInWindow(windowId)
    if (active?.id != null) {
      await syncWatchingTabs(windowId, active.id)
    }
  }

  async function stopWatchingWindow(windowId: number): Promise<void> {
    if (!watchingWindows.has(windowId)) return
    watchingWindows.delete(windowId)

    const tabs = await deps.queryTabsInWindow(windowId)
    await Promise.all(tabs.map((tab) => (tab.id != null ? deps.setTabWatching(tab.id, false) : undefined)))
    await Promise.all(
      tabs.map((tab) =>
        tab.id != null && deps.isDebuggerAttached(tab.id) ? deps.detachDebugger(tab.id) : undefined,
      ),
    )

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

  function handleTabActivated(tabId: number, windowId: number): void {
    if (!watchingWindows.has(windowId)) return
    void syncWatchingTabs(windowId, tabId)
    scheduleTabCapture(tabId, windowId)
  }

  function handleTabUpdated(tabId: number, windowId: number, changeInfo: chrome.tabs.OnUpdatedInfo): void {
    if (!watchingWindows.has(windowId)) return
    if (changeInfo.status !== 'complete' && changeInfo.url === undefined) return
    scheduleTabCapture(tabId, windowId)
  }

  function handleDomUpdate(
    tabId: number | undefined,
    windowId: number | undefined,
    focusedNodeId: string | null,
  ): void {
    if (tabId == null || windowId == null || !watchingWindows.has(windowId)) return
    scheduleDomUpdateCapture(tabId, windowId, focusedNodeId)
  }

  function handleFocusChange(
    tabId: number | undefined,
    windowId: number | undefined,
    nodeId: string | null,
  ): void {
    if (tabId == null || windowId == null || !watchingWindows.has(windowId)) return
    void maybePushFocusChange(tabId, windowId, nodeId)
  }

  return {
    isWatchingWindow,
    startWatchingWindow,
    stopWatchingWindow,
    handleTabActivated,
    handleTabUpdated,
    handleDomUpdate,
    handleFocusChange,
    captureAndPushTabAxTree,
  }
}
