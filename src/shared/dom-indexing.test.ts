// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import type { AxTreeNode } from './ax-tree'
import { buildDomAxTree } from '../content/build-dom-ax-tree'
import {
  childDomNodeId,
  DOM_ROOT_NODE_ID,
  domNodeIdFromPath,
  isAriaHiddenTrue,
  isExcludedAfterChildren,
  isExcludedBeforeChildren,
  isIgnoredDomTag,
  shouldIncludeIndexedNode,
  isElementHiddenByAttribute,
} from './dom-indexing'
import { hasCdpDomAttribute, linkBackendDomNodeIdsFromBody, type CdpDomNodeLike } from './dom-link'

describe('dom-indexing policy', () => {
  it('identifies ignored tags and hidden preconditions', () => {
    expect(isIgnoredDomTag('script')).toBe(true)
    expect(isIgnoredDomTag('DIV')).toBe(false)
    expect(isExcludedBeforeChildren('script', false)).toBe(true)
    expect(isExcludedBeforeChildren('div', true)).toBe(true)
    expect(isAriaHiddenTrue('true')).toBe(true)
    expect(isAriaHiddenTrue('false')).toBe(false)
    expect(isExcludedAfterChildren(true, false)).toBe(true)
    expect(isExcludedAfterChildren(true, true)).toBe(false)
  })

  it('combines inclusion rules', () => {
    expect(
      shouldIncludeIndexedNode({
        tag: 'div',
        hidden: false,
        ariaHidden: false,
        hasIncludedChild: false,
      }),
    ).toBe(true)
    expect(
      shouldIncludeIndexedNode({
        tag: 'div',
        hidden: false,
        ariaHidden: true,
        hasIncludedChild: true,
      }),
    ).toBe(true)
    expect(
      shouldIncludeIndexedNode({
        tag: 'div',
        hidden: false,
        ariaHidden: true,
        hasIncludedChild: false,
      }),
    ).toBe(false)
  })

  it('formats stable path ids', () => {
    expect(DOM_ROOT_NODE_ID).toBe('body')
    expect(childDomNodeId('body.1', 2)).toBe('body.1.2')
    expect(domNodeIdFromPath([])).toBe('body')
    expect(domNodeIdFromPath([0, 3, 1])).toBe('body.0.3.1')
  })

  it('treats only the hidden attribute as hidden (not computed styles)', () => {
    document.body.innerHTML =
      '<div id="attr" hidden></div><div id="css" style="display:none"></div><div id="vis" style="visibility:hidden"></div>'
    expect(isElementHiddenByAttribute(document.getElementById('attr')!)).toBe(true)
    expect(isElementHiddenByAttribute(document.getElementById('css')!)).toBe(false)
    expect(isElementHiddenByAttribute(document.getElementById('vis')!)).toBe(false)
  })
})

function collectIndexedPaths(nodes: AxTreeNode[]): string[] {
  const paths: string[] = []

  function walk(node: AxTreeNode): void {
    paths.push(node.nodeId)
    for (const child of node.children) walk(child)
  }

  for (const root of nodes) walk(root)
  return paths.sort()
}

function collectCdpIndexedPaths(body: CdpDomNodeLike): string[] {
  const info = { domNodeIds: new Map<number, string>(), tagNames: new Map<number, string>() }
  linkBackendDomNodeIdsFromBody(body, info)
  return [...info.domNodeIds.values()].sort()
}

let nextBackendId = 1

function elementToCdpNode(el: Element): CdpDomNodeLike {
  const attributes: string[] = []
  for (const attr of el.attributes) {
    attributes.push(attr.name, attr.value)
  }
  if (el instanceof HTMLElement && el.hidden && !hasCdpDomAttribute(attributes, 'hidden')) {
    attributes.push('hidden', '')
  }

  return {
    backendNodeId: nextBackendId++,
    localName: el.tagName.toLowerCase(),
    attributes,
    children: [...el.children].map((child) => elementToCdpNode(child)),
  }
}

function cdpTreeFromHtml(html: string): CdpDomNodeLike {
  nextBackendId = 1
  document.body.innerHTML = html
  return elementToCdpNode(document.body)
}

describe('dom-indexing parity — CDP linker vs live DOM builder', () => {
  const fixtures = [
    {
      name: 'main with button and ignored script',
      html: '<main><button>Go</button><script>void 0</script></main>',
    },
    {
      name: 'aria-hidden leaf',
      html: '<div aria-hidden="true">hidden</div><p>visible</p>',
    },
    {
      name: 'aria-hidden parent with visible child',
      html: '<div aria-hidden="true"><span>still indexed</span></div>',
    },
    {
      name: 'hidden attribute',
      html: '<div hidden>gone</div><p>here</p>',
    },
    {
      name: 'display none via style (still indexed for path parity)',
      html: '<div style="display:none">css-hidden</div><p>visible</p>',
    },
    {
      name: 'visibility hidden via style (still indexed for path parity)',
      html: '<div style="visibility:hidden">css-hidden</div><p>visible</p>',
    },
    {
      name: 'nested structure with skipped tags',
      html: '<header><nav><a href="/">Home</a></nav><style>.x{}</style></header>',
    },
  ]

  for (const { name, html } of fixtures) {
    it(`assigns identical paths for: ${name}`, () => {
      document.body.innerHTML = html

      const domPaths = collectIndexedPaths(buildDomAxTree())
      const cdpPaths = collectCdpIndexedPaths(cdpTreeFromHtml(html))

      expect(domPaths).toEqual(cdpPaths)
    })
  }
})
