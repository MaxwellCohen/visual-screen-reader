export interface AxTreeNode {
  /** CDP accessibility node id (or DOM path when DOM-derived). */
  nodeId: string
  /** DOM path linked via stamped `data-vsr-node-id` when backed by an element. */
  domNodeId?: string
  backendDOMNodeId?: number
  ignored: boolean
  role?: string
  name?: string
  description?: string
  /** Direct text / control value for this node (not descendant element text). */
  content?: string
  /** Full text from this element and its descendants. */
  textContent?: string
  tagName?: string
  /** Notable HTML and ARIA attributes on the element. */
  attributes?: Record<string, string>
  /** Interactive state flags (disabled, checked, expanded, etc.). */
  states?: Record<string, boolean | string>
  /** Heading level (1–6) when role is heading. */
  level?: number
  children: AxTreeNode[]
}

export function countAxTreeNodes(forest: AxTreeNode[]): number {
  return forest.reduce((sum, node) => sum + 1 + countAxTreeNodes(node.children), 0)
}
