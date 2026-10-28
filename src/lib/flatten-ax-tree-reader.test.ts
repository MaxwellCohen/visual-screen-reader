import { describe, expect, it } from 'vitest'
import type { AxTreeNode } from '../shared/ax-tree'
import {
  flattenAxTreeForReader,
  readerLinesToHtml,
  resolveFocusedReaderLineIndex,
} from './flatten-ax-tree-reader'

describe('reader presentation', () => {
  it('builds one reader document for role rendering and focus lookup', () => {
    const roots: AxTreeNode[] = [
      {
        nodeId: 'root',
        domNodeId: 'body',
        ignored: false,
        role: 'generic',
        children: [
          {
            nodeId: 'heading-cdp',
            domNodeId: 'body.0',
            ignored: false,
            role: 'heading',
            name: 'Welcome',
            level: 1,
            children: [],
          },
          {
            nodeId: 'link-cdp',
            domNodeId: 'body.1',
            ignored: false,
            role: 'link',
            name: 'Docs',
            attributes: { href: 'https://example.com/docs' },
            children: [
              {
                nodeId: 'text-cdp',
                domNodeId: 'body.1.0',
                ignored: false,
                role: 'statictext',
                name: 'Docs',
                children: [],
              },
            ],
          },
        ],
      },
    ]

    const document = flattenAxTreeForReader(roots)

    expect(document.lines).toMatchObject([
      { kind: 'heading', label: 'Welcome', headingLevel: 1, focusId: 'body.0' },
      { kind: 'link', label: 'Docs', notes: 'link, https://example.com/docs', focusId: 'body.1' },
    ])
    expect(document.focusLineIndex.get('body.1')).toBe(1)
    expect(document.lines).toHaveLength(2)
  })

  it('does not indent through unlabeled layout generics', () => {
    const roots: AxTreeNode[] = [
      {
        nodeId: 'main',
        ignored: false,
        role: 'main',
        children: [
          {
            nodeId: 'wrap-1',
            ignored: false,
            role: 'generic',
            children: [
              {
                nodeId: 'wrap-2',
                ignored: false,
                role: 'generic',
                children: [
                  {
                    nodeId: 'tab',
                    ignored: false,
                    role: 'tab',
                    name: 'Discover',
                    states: { selected: false },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]

    const document = flattenAxTreeForReader(roots)

    expect(document.lines).toMatchObject([
      { kind: 'landmark', landmarkRole: 'main', depth: 0 },
      { kind: 'text', label: 'Discover', depth: 0, notes: 'not selected' },
    ])
  })

  it('gives nested focusable controls their own reader lines', () => {
    const roots: AxTreeNode[] = [
      {
        nodeId: 'post',
        domNodeId: 'body.0',
        ignored: false,
        role: 'generic',
        children: [
          {
            nodeId: 'card-link',
            domNodeId: 'body.0.0',
            ignored: false,
            role: 'link',
            name: 'Connie · June 8',
            attributes: { focusable: 'true', url: 'https://example.com/post' },
            children: [
              {
                nodeId: 'reply',
                domNodeId: 'body.0.0.0',
                ignored: false,
                role: 'button',
                name: 'Reply (1 reply)',
                attributes: { focusable: 'true' },
                children: [],
              },
            ],
          },
        ],
      },
    ]

    const document = flattenAxTreeForReader(roots)

    expect(document.lines).toMatchObject([
      { kind: 'link', label: 'Connie · June 8', focusId: 'body.0.0', depth: 0 },
      { kind: 'button', label: 'Reply (1 reply)', focusId: 'body.0.0.0', depth: 1 },
    ])
    expect(document.focusLineIndex.get('body.0.0.0')).toBe(1)
    expect(resolveFocusedReaderLineIndex(document, 'body.0.0.0')).toBe(1)
  })

  it('resolves focus to a parent reader line for deduped text children', () => {
    const roots: AxTreeNode[] = [
      {
        nodeId: 'link-cdp',
        domNodeId: 'body.1',
        ignored: false,
        role: 'link',
        name: 'Docs',
        children: [
          {
            nodeId: 'text-cdp',
            domNodeId: 'body.1.0',
            ignored: false,
            role: 'statictext',
            name: 'Docs',
            children: [],
          },
        ],
      },
    ]

    const document = flattenAxTreeForReader(roots)

    expect(resolveFocusedReaderLineIndex(document, 'body.1')).toBe(0)
    expect(resolveFocusedReaderLineIndex(document, 'body.1.0')).toBe(0)
  })

  it('exports escaped HTML from reader lines', () => {
    const document = flattenAxTreeForReader([
      {
        nodeId: 'button',
        ignored: false,
        role: 'button',
        name: 'Save <draft>',
        children: [],
      },
    ])

    expect(readerLinesToHtml(document.lines)).toContain(
      '<button type="button" disabled>Save &lt;draft&gt;</button>',
    )
  })

  it('prefers the first exact line over a folded-in focus record', () => {
    const roots: AxTreeNode[] = [
      {
        nodeId: 'root',
        domNodeId: 'body',
        ignored: false,
        role: 'generic',
        children: [
          { nodeId: 'p1', domNodeId: 'body.0', ignored: false, role: 'paragraph', name: 'One', children: [] },
          { nodeId: 'p2', domNodeId: 'body.1', ignored: false, role: 'paragraph', name: 'Two', children: [] },
        ],
      },
    ]
    const flattened = flattenAxTreeForReader(roots)

    expect(flattened.exactLineIndex.get('body.1')).toBe(1)
    expect(resolveFocusedReaderLineIndex(flattened, 'body.1')).toBe(1)
    expect(resolveFocusedReaderLineIndex(flattened, 'missing')).toBeUndefined()
  })
})
