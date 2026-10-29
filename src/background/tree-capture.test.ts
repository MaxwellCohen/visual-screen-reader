import { describe, expect, it, vi } from 'vitest'
import type { AxTreeNode } from '../shared/ax-tree'
import type { DomAxTreeResultMessage } from '../shared/messages'
import { canReadTab, createTreeCapture, type TreeCaptureDeps } from './tree-capture'

const domRoot: AxTreeNode = {
  nodeId: 'body',
  ignored: false,
  role: 'generic',
  children: [],
}

const cdpRoot: AxTreeNode = {
  nodeId: 'cdp-root',
  domNodeId: 'body',
  ignored: false,
  role: 'RootWebArea',
  children: [{ nodeId: 'cdp-child', ignored: false, role: 'button', children: [] }],
}

function makeDeps(overrides: Partial<TreeCaptureDeps> = {}): TreeCaptureDeps {
  const tab = {
    id: 7,
    windowId: 1,
    title: 'Example',
    url: 'https://example.com',
  } as chrome.tabs.Tab
  const domTree: DomAxTreeResultMessage = {
    type: 'DOM_AX_TREE_RESULT',
    roots: [domRoot],
    nodeCount: 1,
    focusedNodeId: 'body',
  }

  return {
    getActiveTabInWindow: vi.fn(async () => tab),
    getTab: vi.fn(async () => tab),
    getFocusFromContent: vi.fn(async () => 'body.0'),
    getDomTreeFromContent: vi.fn(async () => domTree),
    fetchCdpAxTree: vi.fn(async () => [cdpRoot]),
    isWatchingWindow: vi.fn(() => true),
    isCdpEnabled: vi.fn(async () => true),
    warnCdpFallback: vi.fn(),
    ...overrides,
  }
}

describe('Tree Capture', () => {
  it('returns a CDP snapshot without building the DOM fallback tree', async () => {
    const deps = makeDeps()
    const capture = createTreeCapture(deps)

    await expect(capture.captureTabAxTree(7)).resolves.toMatchObject({
      type: 'AX_TREE_RESULT',
      tabId: 7,
      tabTitle: 'Example',
      url: 'https://example.com',
      roots: [cdpRoot],
      nodeCount: 2,
      focusedNodeId: 'body.0',
      source: 'cdp',
    })
    expect(deps.getDomTreeFromContent).not.toHaveBeenCalled()
  })

  it('skips the content focus query when the caller already knows focus', async () => {
    const deps = makeDeps()
    const capture = createTreeCapture(deps)

    await expect(capture.captureTabAxTree(7, 'body.3')).resolves.toMatchObject({
      focusedNodeId: 'body.3',
      source: 'cdp',
    })
    expect(deps.getFocusFromContent).not.toHaveBeenCalled()
  })

  it('still returns the CDP tree when the content script is unreachable', async () => {
    const deps = makeDeps({ getFocusFromContent: vi.fn(async () => undefined) })
    const capture = createTreeCapture(deps)

    await expect(capture.captureTabAxTree(7)).resolves.toMatchObject({
      type: 'AX_TREE_RESULT',
      roots: [cdpRoot],
      focusedNodeId: null,
      source: 'cdp',
    })
  })

  it('falls back to DOM roots when CDP capture fails', async () => {
    const deps = makeDeps({
      fetchCdpAxTree: vi.fn(async () => {
        throw new Error('debugger attached elsewhere')
      }),
    })
    const capture = createTreeCapture(deps)

    await expect(capture.captureTabAxTree(7, 'body.0')).resolves.toMatchObject({
      type: 'AX_TREE_RESULT',
      roots: [domRoot],
      nodeCount: 1,
      focusedNodeId: 'body.0',
      source: 'dom',
      cdpError: 'debugger attached elsewhere',
    })
    expect(deps.warnCdpFallback).toHaveBeenCalledWith('debugger attached elsewhere')
  })

  it('reports both failures when neither CDP nor the content script is available', async () => {
    const deps = makeDeps({
      fetchCdpAxTree: vi.fn(async () => {
        throw new Error('cannot attach')
      }),
      getDomTreeFromContent: vi.fn(async () => null),
    })
    const capture = createTreeCapture(deps)

    await expect(capture.captureTabAxTree(7)).resolves.toEqual({
      type: 'AX_TREE_ERROR',
      error: 'Content script not ready. Refresh the page and try again. (CDP: cannot attach)',
    })
  })

  it('uses only the DOM tree when the window is not being watched', async () => {
    const deps = makeDeps({ isWatchingWindow: vi.fn(() => false) })
    const capture = createTreeCapture(deps)

    await expect(capture.captureTabAxTree(7)).resolves.toMatchObject({ source: 'dom' })
    expect(deps.fetchCdpAxTree).not.toHaveBeenCalled()
  })

  it('uses the DOM tree without a CDP error when CDP is unavailable (Firefox)', async () => {
    const deps = makeDeps({ fetchCdpAxTree: undefined })
    const capture = createTreeCapture(deps)

    const result = await capture.captureTabAxTree(7)
    expect(result).toMatchObject({ source: 'dom', roots: [domRoot], focusedNodeId: 'body' })
    expect(result).not.toHaveProperty('cdpError', expect.anything())
    expect(deps.warnCdpFallback).not.toHaveBeenCalled()
  })

  it('captures the active tab of the requested window', async () => {
    const deps = makeDeps()
    const capture = createTreeCapture(deps)

    await capture.captureActiveTabAxTree(42)

    expect(deps.getActiveTabInWindow).toHaveBeenCalledWith(42)
    expect(deps.getTab).toHaveBeenCalledWith(7)
  })

  it('rejects restricted pages before asking content or CDP adapters', async () => {
    const deps = makeDeps({
      getTab: vi.fn(async () => ({ id: 7, windowId: 1, url: 'chrome://settings' }) as chrome.tabs.Tab),
    })
    const capture = createTreeCapture(deps)

    await expect(capture.captureTabAxTree(7)).resolves.toEqual({
      type: 'AX_TREE_ERROR',
      error: 'Cannot read the accessibility tree on this page. Open a normal web page.',
    })
    expect(deps.getFocusFromContent).not.toHaveBeenCalled()
    expect(deps.getDomTreeFromContent).not.toHaveBeenCalled()
    expect(deps.fetchCdpAxTree).not.toHaveBeenCalled()
  })

  it.each([
    ['https://example.com', true],
    ['file:///tmp/a.html', true],
    ['chrome://settings', false],
    ['about:blank', false],
    ['view-source:https://example.com', false],
    ['https://chromewebstore.google.com/detail/x', false],
    ['moz-extension://abc/page.html', false],
    ['https://addons.mozilla.org/en-US/firefox/', false],
    [undefined, false],
  ])('canReadTab(%s) is %s', (url, expected) => {
    expect(canReadTab({ url } as chrome.tabs.Tab)).toBe(expected)
  })
})
