import type { AxTreeNode } from '../shared/ax-tree'

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

export function buildAxTree(
  nodes: AxNode[],
  backendToDomNodeId?: Map<number, string>,
  backendToTagName?: Map<number, string>,
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
    const tagName =
      node.backendDOMNodeId != null ? backendToTagName?.get(node.backendDOMNodeId) : undefined

    return {
      nodeId: node.nodeId,
      domNodeId,
      backendDOMNodeId: node.backendDOMNodeId,
      ignored: node.ignored,
      role: node.role?.value ?? node.chromeRole?.value,
      tagName,
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
