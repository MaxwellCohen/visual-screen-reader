// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAxTreeWatching, startAxTreeObserver, stopAxTreeObserver } from './observe-ax-tree'

describe('observe-ax-tree', () => {
  const sendMessage = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<input id="field" type="text" />'
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
    })
    startAxTreeObserver()
    setAxTreeWatching(true)
    sendMessage.mockClear()
  })

  afterEach(() => {
    stopAxTreeObserver()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('schedules a tree update when a form field value changes', () => {
    const input = document.getElementById('field') as HTMLInputElement
    input.value = 'hello'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    expect(sendMessage).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOM_AX_TREE_UPDATED' }),
    )
  })

  it('reports DOM mutations while watching', async () => {
    document.body.append(document.createElement('p'))
    await Promise.resolve()
    vi.advanceTimersByTime(200)

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOM_AX_TREE_UPDATED' }),
    )
  })

  it('stops observing and reporting once watching is turned off', async () => {
    setAxTreeWatching(false)

    document.body.append(document.createElement('p'))
    const input = document.getElementById('field') as HTMLInputElement
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await Promise.resolve()
    vi.advanceTimersByTime(500)

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('survives an invalidated extension context', () => {
    sendMessage.mockImplementationOnce(() => {
      throw new Error('Extension context invalidated.')
    })
    const input = document.getElementById('field') as HTMLInputElement
    input.dispatchEvent(new Event('input', { bubbles: true }))

    expect(() => vi.advanceTimersByTime(200)).not.toThrow()
  })
})
