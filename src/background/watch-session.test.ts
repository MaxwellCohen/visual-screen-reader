import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxTreeNode } from '../shared/ax-tree'
import { createWatchSession, type WatchSessionDeps } from './watch-session'

const root: AxTreeNode = {
  nodeId: 'root',
  ignored: false,
  children: [],
}

function makeTab(id: number, windowId = 10): chrome.tabs.Tab {
  return { id, windowId, url: 'https://example.com' } as chrome.tabs.Tab
}

function makeDeps(overrides: Partial<WatchSessionDeps> = {}): WatchSessionDeps {
  return {
    queryTabsInWindow: vi.fn(async () => [makeTab(1), makeTab(2)]),
    queryActiveTabInWindow: vi.fn(async () => makeTab(1)),
    setTabWatching: vi.fn(async () => undefined),
    detachDebugger: vi.fn(async () => undefined),
    isDebuggerAttached: vi.fn((tabId) => tabId === 2),
    captureTabAxTree: vi.fn(async () => ({
      type: 'AX_TREE_RESULT' as const,
      tabId: 1,
      tabTitle: 'Example',
      url: 'https://example.com',
      roots: [root],
      nodeCount: 1,
      focusedNodeId: 'root',
      source: 'cdp' as const,
    })),
    pushMessage: vi.fn(),
    ...overrides,
  }
}

describe('Watch Session', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('syncs active and inactive tabs when a window starts watching', async () => {
    const deps = makeDeps()
    const session = createWatchSession(deps)

    await session.startWatchingWindow(10)

    expect(deps.setTabWatching).toHaveBeenCalledWith(1, true)
    expect(deps.setTabWatching).toHaveBeenCalledWith(2, false)
    expect(deps.detachDebugger).toHaveBeenCalledWith(2)
  })

  it('coalesces DOM updates and captures with the latest focus id', async () => {
    const deps = makeDeps()
    const session = createWatchSession(deps)
    await session.startWatchingWindow(10)

    session.handleDomUpdate(1, 10, 'body.0')
    session.handleDomUpdate(1, 10, 'body.1')
    await vi.advanceTimersByTimeAsync(250)

    expect(deps.captureTabAxTree).toHaveBeenCalledTimes(1)
    expect(deps.captureTabAxTree).toHaveBeenCalledWith(1, 'body.1')
    expect(deps.pushMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'AX_TREE_RESULT' }))
  })

  it('serializes captures and runs the latest pending request after an in-flight capture', async () => {
    let finishFirstCapture!: (value: Awaited<ReturnType<WatchSessionDeps['captureTabAxTree']>>) => void
    const firstCapture = new Promise<Awaited<ReturnType<WatchSessionDeps['captureTabAxTree']>>>((resolve) => {
      finishFirstCapture = resolve
    })
    const deps = makeDeps({
      captureTabAxTree: vi
        .fn()
        .mockReturnValueOnce(firstCapture)
        .mockResolvedValue({
          type: 'AX_TREE_RESULT' as const,
          tabId: 1,
          tabTitle: 'Example',
          url: 'https://example.com',
          roots: [root],
          nodeCount: 1,
          focusedNodeId: 'body.2',
          source: 'cdp' as const,
        }),
    })
    const session = createWatchSession(deps)
    await session.startWatchingWindow(10)

    const first = session.captureAndPushTabAxTree(1, 10, 'body.0')
    await Promise.resolve()
    const second = session.captureAndPushTabAxTree(1, 10, 'body.2')
    await second

    finishFirstCapture({
      type: 'AX_TREE_RESULT',
      tabId: 1,
      tabTitle: 'Example',
      url: 'https://example.com',
      roots: [root],
      nodeCount: 1,
      focusedNodeId: 'body.0',
      source: 'cdp' as const,
    })
    await first

    await vi.waitFor(() => {
      expect(deps.captureTabAxTree).toHaveBeenCalledTimes(2)
    })
    expect(deps.captureTabAxTree).toHaveBeenNthCalledWith(2, 1, 'body.2')
  })
})
