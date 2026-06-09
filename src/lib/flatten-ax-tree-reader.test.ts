import { describe, expect, it } from 'vitest'
import type { AxTreeNode } from '../shared/ax-tree'
import { flattenAxTreeForReader, readerLinesToHtml } from './flatten-ax-tree-reader'

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
})
