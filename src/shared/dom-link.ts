import type { AxTreeNode } from './ax-tree'

export const DOM_NODE_ID_ATTR = 'data-vsr-node-id'
export const DOM_ROOT_NODE_ID = 'body'

export function childDomNodeId(parentNodeId: string, childIndex: number): string {
  return `${parentNodeId}.${childIndex}`
}

export function domNodeIdFromPath(pathFromBody: number[]): string {
  return pathFromBody.length === 0
    ? DOM_ROOT_NODE_ID
    : `${DOM_ROOT_NODE_ID}.${pathFromBody.join('.')}`
}

export function getAxTreeFocusId(node: Pick<AxTreeNode, 'domNodeId' | 'nodeId'>): string {
  return node.domNodeId ?? node.nodeId
}

export function readDomNodeIdAttribute(attributes: string[] | undefined): string | undefined {
  if (!attributes) return undefined

  for (let i = 0; i < attributes.length - 1; i += 2) {
    if (attributes[i] === DOM_NODE_ID_ATTR && attributes[i + 1]) return attributes[i + 1]
  }

  return undefined
}
