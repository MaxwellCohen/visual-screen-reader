import type { AxTreeNode } from './ax-tree'
import {
  DOM_ROOT_NODE_ID,
  isAriaHiddenTrue,
  isExcludedBeforeChildren,
  shouldIncludeIndexedNode,
  walkIndexedChildren,
} from './dom-indexing'

export {
  childDomNodeId,
  DOM_ROOT_NODE_ID,
  domNodeIdFromPath,
  IGNORED_DOM_TAGS,
} from './dom-indexing'

export interface CdpDomNodeLike {
  backendNodeId?: number
  /** DOM node type (1 = element). CDP children include text and comment nodes. */
  nodeType?: number
  localName?: string
  attributes?: string[]
  children?: CdpDomNodeLike[]
}

export interface BackendDomLinkInfo {
  domNodeIds: Map<number, string>
  tagNames: Map<number, string>
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
    if (attributes[i] === name && attributes[i + 1] != null) return attributes[i + 1]
  }

  return undefined
}

export function hasCdpDomAttribute(attributes: string[] | undefined, name: string): boolean {
  if (!attributes) return false

  for (let i = 0; i < attributes.length - 1; i += 2) {
    if (attributes[i] === name) return true
  }

  return false
}

const ELEMENT_NODE = 1

/** CDP lists text/comment children too; the content script only indexes `Element.children`. */
function isCdpElementNode(node: CdpDomNodeLike): boolean {
  return (node.nodeType ?? ELEMENT_NODE) === ELEMENT_NODE && Boolean(node.localName)
}

function isHiddenCdpDomNode(node: CdpDomNodeLike): boolean {
  return hasCdpDomAttribute(node.attributes, 'hidden')
}

/** Assign stable body-relative paths to CDP backend node ids (mirrors content-script tree indexing). */
function linkDomNodeIdsFromNode(
  node: CdpDomNodeLike,
  nodeId: string,
  info: BackendDomLinkInfo,
): boolean {
  const tag = (node.localName ?? '').toLowerCase()
  const hidden = isHiddenCdpDomNode(node)
  if (isExcludedBeforeChildren(tag, hidden)) return false

  const ariaHidden = isAriaHiddenTrue(readCdpDomAttribute(node.attributes, 'aria-hidden'))
  const { hasIncludedChild } = walkIndexedChildren(
    (node.children ?? []).filter(isCdpElementNode),
    nodeId,
    (child, childNodeId) => (linkDomNodeIdsFromNode(child, childNodeId, info) ? true : null),
  )

  if (!shouldIncludeIndexedNode({ tag, hidden, ariaHidden, hasIncludedChild })) return false

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
