export type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export function getJsonType(value: unknown): 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object' {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  switch (typeof value) {
    case 'boolean':
      return 'boolean'
    case 'number':
      return 'number'
    case 'string':
      return 'string'
    case 'object':
      return 'object'
    default:
      return 'string'
  }
}

export function formatPrimitive(value: JsonPrimitive): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  return String(value)
}

export function getCollectionPreview(value: unknown[]): string {
  if (value.length === 0) return '[]'
  return `[${value.length} item${value.length === 1 ? '' : 's'}]`
}

export function getObjectPreview(value: Record<string, unknown>): string {
  const keys = Object.keys(value)
  if (keys.length === 0) return '{}'
  return `{${keys.length} key${keys.length === 1 ? '' : 's'}}`
}

/** Collections render this many entries at a time; large AX trees otherwise mount every node. */
export const JSON_ENTRY_PAGE_SIZE = 100

export function childPath(parentPath: string, key: string | number): string {
  return parentPath === '' ? String(key) : `${parentPath}.${key}`
}

export interface JsonCollapseState {
  expandDepth: number
  manuallyExpanded: Set<string>
  manuallyCollapsed: Set<string>
}

export function createJsonCollapseState(expandDepth = 2): JsonCollapseState {
  return {
    expandDepth,
    manuallyExpanded: new Set(),
    manuallyCollapsed: new Set(),
  }
}

export function isJsonNodeExpanded(state: JsonCollapseState, path: string, depth: number): boolean {
  if (state.manuallyCollapsed.has(path)) return false
  if (state.manuallyExpanded.has(path)) return true
  return depth < state.expandDepth
}

export function toggleJsonNode(
  state: JsonCollapseState,
  path: string,
  depth: number,
): JsonCollapseState {
  const expanded = isJsonNodeExpanded(state, path, depth)
  const manuallyExpanded = new Set(state.manuallyExpanded)
  const manuallyCollapsed = new Set(state.manuallyCollapsed)

  if (expanded) {
    manuallyExpanded.delete(path)
    manuallyCollapsed.add(path)
  } else {
    manuallyCollapsed.delete(path)
    manuallyExpanded.add(path)
  }

  return { ...state, manuallyExpanded, manuallyCollapsed }
}

export function expandAllJsonNodes(state: JsonCollapseState): JsonCollapseState {
  return {
    ...state,
    expandDepth: Number.MAX_SAFE_INTEGER,
    manuallyExpanded: new Set(),
    manuallyCollapsed: new Set(),
  }
}

export function collapseAllJsonNodes(state: JsonCollapseState): JsonCollapseState {
  return {
    ...state,
    expandDepth: 0,
    manuallyExpanded: new Set(),
    manuallyCollapsed: new Set(),
  }
}
