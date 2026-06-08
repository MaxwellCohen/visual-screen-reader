/** Subset of CDP AXNode — https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/#type-AXNode */
export interface AxProperty {
  name: string
  value: AxValue
}

export interface AxValue {
  type: string
  value?: string
  sources?: unknown[]
}

export interface AxNode {
  nodeId: string
  ignored: boolean
  role?: AxValue
  chromeRole?: AxValue
  name?: AxValue
  description?: AxValue
  value?: AxValue
  properties?: AxProperty[]
  childIds?: string[]
  backendDOMNodeId?: number
  frameId?: string
  parentId?: string
}

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

const CDP_STATE_PROPERTIES = new Set([
  'disabled',
  'expanded',
  'selected',
  'checked',
  'pressed',
  'required',
  'readonly',
  'invalid',
  'hidden',
  'focused',
  'modal',
  'multiline',
  'multiselectable',
])

function axPropertyValue(props: AxProperty[] | undefined, name: string): string | undefined {
  const prop = props?.find((p) => p.name === name)
  const value = prop?.value
  if (value?.type === 'boolean') return value.value === 'true' ? 'true' : 'false'
  return value?.value
}

function getNodeStatesFromProperties(props: AxProperty[] | undefined): Record<string, boolean | string> | undefined {
  const states: Record<string, boolean | string> = {}

  for (const prop of props ?? []) {
    if (!CDP_STATE_PROPERTIES.has(prop.name)) continue
    const raw = axPropertyValue(props, prop.name)
    if (raw == null) continue
    if (raw === 'true') states[prop.name] = true
    else if (raw === 'false') states[prop.name] = false
    else states[prop.name] = raw
  }

  return Object.keys(states).length > 0 ? states : undefined
}

export function getAxTreeFocusId(node: AxTreeNode): string {
  return node.domNodeId ?? node.nodeId
}

export function buildAxTree(
  nodes: AxNode[],
  backendToDomNodeId?: Map<number, string>,
): AxTreeNode[] {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]))
  const referenced = new Set<string>()
  for (const node of nodes) {
    for (const childId of node.childIds ?? []) {
      referenced.add(childId)
    }
  }

  const roots = nodes.filter((n) => !referenced.has(n.nodeId))

  function toTree(node: AxNode): AxTreeNode {
    const attributes: Record<string, string> = {}
    for (const prop of node.properties ?? []) {
      if (CDP_STATE_PROPERTIES.has(prop.name)) continue
      const v = prop.value?.value
      if (v != null) attributes[prop.name] = v
    }

    const levelRaw = axPropertyValue(node.properties, 'level')
    const level = levelRaw != null ? Number(levelRaw) : undefined
    const domNodeId =
      node.backendDOMNodeId != null ? backendToDomNodeId?.get(node.backendDOMNodeId) : undefined

    return {
      nodeId: node.nodeId,
      domNodeId,
      backendDOMNodeId: node.backendDOMNodeId,
      ignored: node.ignored,
      role: node.role?.value ?? node.chromeRole?.value,
      name: node.name?.value,
      description: node.description?.value,
      content: node.value?.value,
      attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
      states: getNodeStatesFromProperties(node.properties),
      level: Number.isFinite(level) ? level : undefined,
      children: (node.childIds ?? [])
        .map((id) => byId.get(id))
        .filter((n): n is AxNode => n != null)
        .map(toTree),
    }
  }

  return roots.map(toTree)
}

export function countAxTreeNodes(forest: AxTreeNode[]): number {
  return forest.reduce((sum, node) => sum + 1 + countAxTreeNodes(node.children), 0)
}
