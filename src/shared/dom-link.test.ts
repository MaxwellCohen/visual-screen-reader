import { describe, expect, it } from 'vitest'
import {
  childDomNodeId,
  DOM_NODE_ID_ATTR,
  DOM_ROOT_NODE_ID,
  domNodeIdFromPath,
  getAxTreeFocusId,
  readDomNodeIdAttribute,
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

  it('reads stamped DOM node ids from CDP attribute pairs', () => {
    expect(readDomNodeIdAttribute(['class', 'button', DOM_NODE_ID_ATTR, 'body.2'])).toBe('body.2')
    expect(readDomNodeIdAttribute(['class', 'button'])).toBeUndefined()
    expect(readDomNodeIdAttribute(undefined)).toBeUndefined()
  })
})
