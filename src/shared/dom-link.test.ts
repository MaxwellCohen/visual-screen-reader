import { describe, expect, it } from 'vitest'
import {
  childDomNodeId,
  DOM_ROOT_NODE_ID,
  domNodeIdFromPath,
  getAxTreeFocusId,
  linkBackendDomNodeIdsFromBody,
  readCdpDomAttribute,
} from './dom-link'

describe('DOM Link', () => {
  it('formats stable DOM node ids from body paths', () => {
    expect(DOM_ROOT_NODE_ID).toBe('body')
    expect(childDomNodeId('body.1', 2)).toBe('body.1.2')
    expect(domNodeIdFromPath([])).toBe('body')
    expect(domNodeIdFromPath([0, 3, 1])).toBe('body.0.3.1')
  })

  it('prefers linked DOM node ids for focus', () => {
    expect(getAxTreeFocusId({ nodeId: 'cdp-7', domNodeId: 'body.0' })).toBe('body.0')
    expect(getAxTreeFocusId({ nodeId: 'cdp-7' })).toBe('cdp-7')
  })

  it('reads CDP DOM attribute pairs', () => {
    expect(readCdpDomAttribute(['class', 'button', 'data-foo', 'bar'], 'data-foo')).toBe('bar')
    expect(readCdpDomAttribute(['class', 'button'], 'data-foo')).toBeUndefined()
    expect(readCdpDomAttribute(undefined)).toBeUndefined()
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
})
