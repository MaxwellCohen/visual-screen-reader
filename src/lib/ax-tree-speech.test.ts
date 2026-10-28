import { describe, expect, it } from 'vitest'
import type { AxTreeNode } from '../shared/ax-tree'
import { findAxTreeNode, indexAxTreeNodes } from './ax-tree-speech'

function node(nodeId: string, domNodeId: string | undefined, children: AxTreeNode[] = []): AxTreeNode {
  return { nodeId, domNodeId, ignored: false, children }
}

describe('indexAxTreeNodes', () => {
  it('indexes by focus id and node id, matching findAxTreeNode', () => {
    const roots = [
      node('root', 'body', [node('a', 'body.0', [node('a1', 'body.0.0')]), node('b', undefined)]),
    ]
    const index = indexAxTreeNodes(roots)

    for (const id of ['body', 'root', 'body.0', 'a', 'body.0.0', 'a1', 'b']) {
      expect(index.get(id)).toBe(findAxTreeNode(roots, id))
    }
    expect(index.get('missing')).toBeUndefined()
  })

  it('keeps the first pre-order match when focus ids collide', () => {
    const first = node('first', 'body.0', [node('nested', 'body.0')])
    const roots = [node('root', 'body', [first, node('later', 'body.0')])]

    expect(indexAxTreeNodes(roots).get('body.0')).toBe(first)
    expect(findAxTreeNode(roots, 'body.0')).toBe(first)
  })

  it('handles deep trees without recursion', () => {
    let deep = node('leaf', 'leaf')
    for (let i = 0; i < 20_000; i++) deep = node(`n${i}`, undefined, [deep])
    expect(indexAxTreeNodes([deep]).get('leaf')?.nodeId).toBe('leaf')
  })
})
