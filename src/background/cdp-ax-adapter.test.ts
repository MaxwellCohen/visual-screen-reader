import { describe, expect, it } from 'vitest'
import { buildAxTree, type AxNode } from './cdp-ax-adapter'

describe('CDP AX adapter', () => {
  it('maps CDP nodes into the canonical tree', () => {
    const nodes: AxNode[] = [
      {
        nodeId: '1',
        ignored: false,
        role: { type: 'role', value: 'RootWebArea' },
        childIds: ['2'],
      },
      {
        nodeId: '2',
        ignored: false,
        role: { type: 'role', value: 'button' },
        name: { type: 'computedString', value: 'Save' },
        backendDOMNodeId: 42,
        properties: [
          { name: 'disabled', value: { type: 'boolean', value: 'true' } },
          { name: 'level', value: { type: 'integer', value: '2' } },
          { name: 'haspopup', value: { type: 'token', value: 'menu' } },
        ],
      },
    ]

    const tree = buildAxTree(
      nodes,
      new Map([[42, 'body.0']]),
      new Map([[42, 'button']]),
    )

    expect(tree).toEqual([
      {
        nodeId: '1',
        domNodeId: undefined,
        backendDOMNodeId: undefined,
        ignored: false,
        role: 'RootWebArea',
        tagName: undefined,
        name: undefined,
        description: undefined,
        content: undefined,
        attributes: undefined,
        states: undefined,
        level: undefined,
        children: [
          {
            nodeId: '2',
            domNodeId: 'body.0',
            backendDOMNodeId: 42,
            ignored: false,
            role: 'button',
            tagName: 'button',
            name: 'Save',
            description: undefined,
            content: undefined,
            attributes: { haspopup: 'menu', level: '2' },
            states: { disabled: true },
            level: 2,
            children: [],
          },
        ],
      },
    ])
  })
})
