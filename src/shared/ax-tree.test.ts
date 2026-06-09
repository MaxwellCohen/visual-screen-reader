import { describe, expect, it } from 'vitest'
import { countAxTreeNodes, type AxTreeNode } from './ax-tree'

describe('canonical AX tree model', () => {
  it('counts every node in a forest', () => {
    const roots: AxTreeNode[] = [
      {
        nodeId: 'root',
        ignored: false,
        children: [
          { nodeId: 'child-1', ignored: false, children: [] },
          {
            nodeId: 'child-2',
            ignored: false,
            children: [{ nodeId: 'grandchild', ignored: false, children: [] }],
          },
        ],
      },
    ]

    expect(countAxTreeNodes(roots)).toBe(4)
  })
})
