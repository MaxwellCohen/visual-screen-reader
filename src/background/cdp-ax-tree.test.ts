import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type DebuggerCallback = (result?: unknown) => void

function createChromeMock() {
  const detachListeners: Array<(source: { tabId?: number }, reason: string) => void> = []
  const sendCommand = vi.fn(
    (
      _target: { tabId: number },
      method: string,
      _params: Record<string, unknown> | undefined,
      callback: DebuggerCallback,
    ) => {
      if (method === 'Accessibility.enable') {
        callback({})
        return
      }
      if (method === 'Accessibility.getFullAXTree') {
        callback({
          nodes: [
            {
              nodeId: '1',
              ignored: false,
              role: { type: 'role', value: 'RootWebArea' },
              childIds: [],
            },
          ],
        })
        return
      }
      if (method === 'DOM.getDocument') {
        callback({
          root: {
            backendNodeId: 1,
            localName: 'html',
            children: [{ backendNodeId: 2, localName: 'body', children: [] }],
          },
        })
        return
      }
      callback({})
    },
  )

  return {
    detachListeners,
    sendCommand,
    chrome: {
      runtime: { lastError: undefined as chrome.runtime.LastError | undefined },
      debugger: {
        attach: vi.fn((_target: { tabId: number }, _protocol: string, callback: () => void) => {
          callback()
        }),
        detach: vi.fn((_target: { tabId: number }, callback: () => void) => {
          callback()
        }),
        sendCommand,
        onDetach: {
          addListener(listener: (source: { tabId?: number }, reason: string) => void) {
            detachListeners.push(listener)
          },
        },
      },
    },
  }
}

describe('cdp-ax-tree lifecycle', () => {
  let mock: ReturnType<typeof createChromeMock>

  beforeEach(() => {
    vi.resetModules()
    mock = createChromeMock()
    vi.stubGlobal('chrome', mock.chrome)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function loadModule() {
    return import('./cdp-ax-tree')
  }

  it('enables Accessibility once per tab and again after detach', async () => {
    const mod = await loadModule()

    await mod.fetchLinkedCdpAxTree(1)
    await mod.fetchLinkedCdpAxTree(2)

    const enableCalls = mock.sendCommand.mock.calls.filter(
      ([, method]) => method === 'Accessibility.enable',
    )
    expect(enableCalls).toHaveLength(2)
    expect(enableCalls[0][0]).toEqual({ tabId: 1 })
    expect(enableCalls[1][0]).toEqual({ tabId: 2 })

    await mod.detachDebugger(1)

    mock.sendCommand.mockClear()
    await mod.fetchLinkedCdpAxTree(1)
    await mod.fetchLinkedCdpAxTree(2)

    const enableAfterDetach = mock.sendCommand.mock.calls.filter(
      ([, method]) => method === 'Accessibility.enable',
    )
    // Tab 1 needs re-enable; tab 2 was never detached so still enabled.
    expect(enableAfterDetach).toHaveLength(1)
    expect(enableAfterDetach[0][0]).toEqual({ tabId: 1 })
  })

  it('tracks attach state and clears it on detach / onDetach', async () => {
    const mod = await loadModule()

    expect(mod.isDebuggerAttached(9)).toBe(false)
    await mod.attachDebugger(9)
    expect(mod.isDebuggerAttached(9)).toBe(true)

    await mod.detachDebugger(9)
    expect(mod.isDebuggerAttached(9)).toBe(false)

    await mod.attachDebugger(9)
    expect(mod.isDebuggerAttached(9)).toBe(true)

    for (const listener of mock.detachListeners) {
      listener({ tabId: 9 }, 'canceled_by_user')
    }
    expect(mod.isDebuggerAttached(9)).toBe(false)
  })

  it('reclaims a stale session left over from a previous service worker', async () => {
    const mod = await loadModule()
    let attached = true
    mock.chrome.debugger.attach.mockImplementation((_target, _protocol, callback) => {
      mock.chrome.runtime.lastError = attached
        ? { message: 'Another debugger is already attached to the tab with id: 5.' }
        : undefined
      attached = true
      callback()
      mock.chrome.runtime.lastError = undefined
    })
    mock.chrome.debugger.detach.mockImplementation((_target, callback) => {
      attached = false
      callback()
    })

    await mod.attachDebugger(5)

    expect(mock.chrome.debugger.detach).toHaveBeenCalledTimes(1)
    expect(mock.chrome.debugger.attach).toHaveBeenCalledTimes(2)
    expect(mod.isDebuggerAttached(5)).toBe(true)
  })

  it('surfaces the original attach error when another client owns the tab', async () => {
    const mod = await loadModule()
    mock.chrome.debugger.attach.mockImplementation((_target, _protocol, callback) => {
      mock.chrome.runtime.lastError = { message: 'Another debugger is already attached.' }
      callback()
      mock.chrome.runtime.lastError = undefined
    })

    await expect(mod.attachDebugger(6)).rejects.toThrow('Another debugger is already attached.')
    expect(mod.isDebuggerAttached(6)).toBe(false)
  })

  it('detachAllDebuggers detaches every attached tab', async () => {
    const mod = await loadModule()
    await mod.attachDebugger(3)
    await mod.attachDebugger(4)

    await mod.detachAllDebuggers()

    expect(mod.isDebuggerAttached(3)).toBe(false)
    expect(mod.isDebuggerAttached(4)).toBe(false)
    expect(mock.chrome.debugger.detach).toHaveBeenCalledTimes(2)
  })
})
