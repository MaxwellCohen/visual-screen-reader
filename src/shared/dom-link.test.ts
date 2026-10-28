import { describe, expect, it } from 'vitest'
import {
  getAxTreeFocusId,
  hasCdpDomAttribute,
  linkBackendDomNodeIdsFromBody,
  readCdpDomAttribute,
} from './dom-link'

describe('DOM Link', () => {
  it('prefers linked DOM node ids for focus', () => {
    expect(getAxTreeFocusId({ nodeId: 'cdp-7', domNodeId: 'body.0' })).toBe('body.0')
    expect(getAxTreeFocusId({ nodeId: 'cdp-7' })).toBe('cdp-7')
  })

  it('reads CDP DOM attribute pairs', () => {
    expect(readCdpDomAttribute(['class', 'button', 'data-foo', 'bar'], 'data-foo')).toBe('bar')
    expect(readCdpDomAttribute(['class', 'button'], 'data-foo')).toBeUndefined()
    expect(readCdpDomAttribute(undefined, 'data-foo')).toBeUndefined()
    expect(hasCdpDomAttribute(['hidden', ''], 'hidden')).toBe(true)
  })

  it('links backend node ids from body-relative paths', () => {
    const info = { domNodeIds: new Map<number, string>(), tagNames: new Map<number, string>() }
    linkBackendDomNodeIdsFromBody(
      {
        backendNodeId: 1,
        localName: 'body',
        children: [
          {
            backendNodeId: 2,
            localName: 'main',
            children: [{ backendNodeId: 3, localName: 'button' }],
          },
          { backendNodeId: 4, localName: 'script' },
        ],
      },
      info,
    )

    expect(info.domNodeIds.get(1)).toBe('body')
    expect(info.domNodeIds.get(2)).toBe('body.0')
    expect(info.domNodeIds.get(3)).toBe('body.0.0')
    expect(info.domNodeIds.has(4)).toBe(false)
    expect(info.tagNames.get(3)).toBe('button')
  })

  it('skips CDP text and comment children so paths match Element.children', () => {
    const info = { domNodeIds: new Map<number, string>(), tagNames: new Map<number, string>() }
    linkBackendDomNodeIdsFromBody(
      {
        backendNodeId: 1,
        nodeType: 1,
        localName: 'body',
        children: [
          { backendNodeId: 10, nodeType: 3, localName: '' },
          { backendNodeId: 2, nodeType: 1, localName: 'nav' },
          { backendNodeId: 11, nodeType: 8, localName: '' },
          {
            backendNodeId: 3,
            nodeType: 1,
            localName: 'main',
            children: [
              { backendNodeId: 12, nodeType: 3, localName: '' },
              { backendNodeId: 4, nodeType: 1, localName: 'a' },
            ],
          },
        ],
      },
      info,
    )

    expect(info.domNodeIds.get(2)).toBe('body.0')
    expect(info.domNodeIds.get(3)).toBe('body.1')
    expect(info.domNodeIds.get(4)).toBe('body.1.0')
    expect(info.domNodeIds.has(10)).toBe(false)
    expect(info.domNodeIds.has(11)).toBe(false)
  })
})
