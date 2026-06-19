import type { AxTreeNode } from './ax-tree'

export const DOM_ROOT_NODE_ID = 'body'

export const IGNORED_DOM_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'link',
  'meta',
  'head',
])

export interface CdpDomNodeLike {
  backendNodeId?: number
  localName?: string
  attributes?: string[]
  children?: CdpDomNodeLike[]
}

export interface BackendDomLinkInfo {
  domNodeIds: Map<number, string>
  tagNames: Map<number, string>
}

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

export function readCdpDomAttribute(
  attributes: string[] | undefined,
  name: string,
): string | undefined {
  if (!attributes) return undefined

  for (let i = 0; i < attributes.length - 1; i += 2) {
    if (attributes[i] === name && attributes[i + 1]) return attributes[i + 1]
  }

  return undefined
}

function isHiddenCdpDomNode(node: CdpDomNodeLike): boolean {
  return readCdpDomAttribute(node.attributes, 'hidden') != null
}

/** Assign stable body-relative paths to CDP backend node ids (mirrors content-script tree indexing). */
function linkDomNodeIdsFromNode(
  node: CdpDomNodeLike,
  nodeId: string,
  info: BackendDomLinkInfo,
): boolean {
  const tag = (node.localName ?? '').toLowerCase()
  if (IGNORED_DOM_TAGS.has(tag) || isHiddenCdpDomNode(node)) return false

  const ignored = readCdpDomAttribute(node.attributes, 'aria-hidden') === 'true'
  let hasIncludedChild = false
  let childIndex = 0

  for (const child of node.children ?? []) {
    const childNodeId = childDomNodeId(nodeId, childIndex)
    childIndex += 1
    if (linkDomNodeIdsFromNode(child, childNodeId, info)) hasIncludedChild = true
  }

  if (ignored && !hasIncludedChild) return false

  if (node.backendNodeId != null) {
    info.domNodeIds.set(node.backendNodeId, nodeId)
    if (tag) info.tagNames.set(node.backendNodeId, tag)
  }

  return true
}

export function findBodyCdpNode(root: CdpDomNodeLike | undefined): CdpDomNodeLike | undefined {
  if (!root) return undefined
  if ((root.localName ?? '').toLowerCase() === 'body') return root

  for (const child of root.children ?? []) {
    const found = findBodyCdpNode(child)
    if (found) return found
  }

  return undefined
}

export function linkBackendDomNodeIdsFromBody(
  body: CdpDomNodeLike,
  info: BackendDomLinkInfo,
): void {
  linkDomNodeIdsFromNode(body, DOM_ROOT_NODE_ID, info)
}
