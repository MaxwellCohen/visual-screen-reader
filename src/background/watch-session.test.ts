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
    expect(deps.pushMessage).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ type: 'AX_TREE_RESULT' }),
    )
  })

  it('pushes capture errors so the panel drops a stale tree', async () => {
    const deps = makeDeps({
      captureTabAxTree: vi.fn(async () => ({
        type: 'AX_TREE_ERROR' as const,
        error: 'Cannot read the accessibility tree on this page.',
      })),
    })
    const session = createWatchSession(deps)
    await session.startWatchingWindow(10)

    await session.captureAndPushTabAxTree(1, 10)

    expect(deps.pushMessage).toHaveBeenCalledWith(10, {
      type: 'AX_TREE_ERROR',
      error: 'Cannot read the accessibility tree on this page.',
    })
  })

  it('does not push a capture that finishes after the panel closed', async () => {
    let finishCapture!: (value: Awaited<ReturnType<WatchSessionDeps['captureTabAxTree']>>) => void
    const deps = makeDeps({
      captureTabAxTree: vi.fn(
        () =>
          new Promise<Awaited<ReturnType<WatchSessionDeps['captureTabAxTree']>>>((resolve) => {
            finishCapture = resolve
          }),
      ),
    })
    const session = createWatchSession(deps)
    await session.startWatchingWindow(10)

    const capture = session.captureAndPushTabAxTree(1, 10)
    await vi.waitFor(() => expect(deps.captureTabAxTree).toHaveBeenCalled())
    await session.stopWatchingWindow(10)
    finishCapture({ type: 'AX_TREE_ERROR', error: 'late' })
    await capture

    expect(deps.pushMessage).not.toHaveBeenCalled()
  })

  it('waits roughly as long as the previous capture took before capturing again', async () => {
    const deps = makeDeps({
      captureTabAxTree: vi.fn(async () => {
        vi.advanceTimersByTime(1000) // simulate a slow (1s) capture
        return { type: 'AX_TREE_ERROR' as const, error: 'x' }
      }),
    })
    const session = createWatchSession(deps)
    await session.startWatchingWindow(10)

    await session.captureAndPushTabAxTree(1, 10)
    await session.captureAndPushTabAxTree(1, 10, 'body.4')
    expect(deps.captureTabAxTree).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(900)
    expect(deps.captureTabAxTree).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(200)
    expect(deps.captureTabAxTree).toHaveBeenCalledTimes(2)
    expect(deps.captureTabAxTree).toHaveBeenLastCalledWith(1, 'body.4')
  })

  it('drops a cooldown-deferred capture when the panel closes', async () => {
    const deps = makeDeps({
      captureTabAxTree: vi.fn(async () => {
        vi.advanceTimersByTime(1000)
        return { type: 'AX_TREE_ERROR' as const, error: 'x' }
      }),
    })
    const session = createWatchSession(deps)
    await session.startWatchingWindow(10)

    await session.captureAndPushTabAxTree(1, 10)
    await session.captureAndPushTabAxTree(1, 10)
    await session.stopWatchingWindow(10)
    await vi.advanceTimersByTimeAsync(5000)

    expect(deps.captureTabAxTree).toHaveBeenCalledTimes(1)
  })

  it('ignores DOM updates from windows without an open panel', async () => {
    const deps = makeDeps()
    const session = createWatchSession(deps)

    session.handleDomUpdate(1, 10, 'body.0')
    await vi.advanceTimersByTimeAsync(250)

    expect(deps.captureTabAxTree).not.toHaveBeenCalled()
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
