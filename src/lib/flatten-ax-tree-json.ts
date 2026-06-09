import type { AxTreeNode } from '../shared/ax-tree'

const NODE_FIELDS: (keyof Omit<AxTreeNode, 'children'>)[] = [
  'nodeId',
  'domNodeId',
  'backendDOMNodeId',
  'ignored',
  'role',
  'name',
  'description',
  'content',
  'textContent',
  'tagName',
  'attributes',
  'states',
  'level',
]

function nodeFields(node: AxTreeNode): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of NODE_FIELDS) {
    const value = node[key]
    if (value !== undefined) out[key] = value
  }
  return out
}

function serializeNodeToJson(node: AxTreeNode): Record<string, unknown> {
  const out = nodeFields(node)
  if (node.children.length > 0) {
    out.children = node.children.map(serializeNodeToJson)
  }
  return out
}

export function axTreeToJson(roots: AxTreeNode[]): Record<string, unknown>[] {
  return roots.map(serializeNodeToJson)
}

export function axTreeToJsonString(roots: AxTreeNode[]): string {
  return JSON.stringify(axTreeToJson(roots), null, 2)
}
