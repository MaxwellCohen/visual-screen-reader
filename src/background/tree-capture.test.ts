import { describe, expect, it, vi } from 'vitest'
import type { AxTreeNode } from '../shared/ax-tree'
import type { ContentResponse } from '../shared/messages'
import { createTreeCapture, type TreeCaptureDeps } from './tree-capture'

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
  const domTree: ContentResponse = {
    type: 'DOM_AX_TREE_RESULT',
    roots: [domRoot],
    nodeCount: 1,
    focusedNodeId: 'body',
  }

  return {
    getActiveTab: vi.fn(async () => tab),
    getTab: vi.fn(async () => tab),
    getDomTreeFromContent: vi.fn(async () => domTree),
    fetchCdpAxTree: vi.fn(async () => [cdpRoot]),
    isWatchingWindow: vi.fn(() => true),
    warnCdpFallback: vi.fn(),
    ...overrides,
  }
}

describe('Tree Capture', () => {
  it('returns a CDP snapshot when CDP capture succeeds', async () => {
    const deps = makeDeps()
    const capture = createTreeCapture(deps)

    await expect(capture.captureTabAxTree(7)).resolves.toMatchObject({
      type: 'AX_TREE_RESULT',
      tabId: 7,
      tabTitle: 'Example',
      url: 'https://example.com',
      roots: [cdpRoot],
      nodeCount: 2,
      focusedNodeId: 'body',
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

  it('rejects restricted pages before asking content or CDP adapters', async () => {
    const deps = makeDeps({
      getTab: vi.fn(async () => ({ id: 7, windowId: 1, url: 'chrome://settings' }) as chrome.tabs.Tab),
    })
    const capture = createTreeCapture(deps)

    await expect(capture.captureTabAxTree(7)).resolves.toEqual({
      type: 'AX_TREE_ERROR',
      error: 'Cannot read the accessibility tree on this page. Open a normal web page.',
    })
    expect(deps.getDomTreeFromContent).not.toHaveBeenCalled()
    expect(deps.fetchCdpAxTree).not.toHaveBeenCalled()
  })
})
