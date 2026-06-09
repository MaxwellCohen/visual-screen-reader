// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAxTreeWatching, startAxTreeObserver } from './observe-ax-tree'

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
})
