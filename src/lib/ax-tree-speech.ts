import type { AxTreeNode } from '../shared/ax-tree'
import { getAxTreeFocusId } from '../shared/dom-link'

const PASSTHROUGH_ROLES = new Set(['generic', 'none', 'presentation'])

const LANDMARK_ROLES = new Set([
  'navigation',
  'main',
  'banner',
  'contentinfo',
  'complementary',
  'region',
  'search',
  'form',
  'article',
])

const DEDUP_ROLES = new Set([
  'heading',
  'link',
  'button',
  'image',
  'statictext',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'tab',
  'treeitem',
])

/** CDP text fragments whose parent already exposes the same label. */
const REDUNDANT_TEXT_ROLES = new Set(['inlinetextbox', 'statictext'])

export function getSpeakableLabel(node: AxTreeNode): string | undefined {
  const label = (node.name ?? node.content)?.trim()
  if (label) return label
  // Leaf generics (e.g. <p>text</p>) have content but no children to recurse into.
  if (node.children.length === 0) {
    const text = node.textContent?.trim()
    if (text) return text
  }
  return undefined
}

export function isPassthroughRole(role: string | undefined): boolean {
  return role != null && PASSTHROUGH_ROLES.has(role)
}

/** Generic containers (e.g. layout divs) render as block elements when they have children. */
export function isGenericContainer(node: AxTreeNode): boolean {
  const role = node.role ?? 'generic'
  return role === 'generic' && node.children.length > 0
}

const INLINE_HTML_TAGS = new Set([
  'a',
  'abbr',
  'acronym',
  'b',
  'bdi',
  'bdo',
  'big',
  'br',
  'cite',
  'code',
  'data',
  'dfn',
  'em',
  'i',
  'img',
  'input',
  'kbd',
  'label',
  'mark',
  'output',
  'q',
  'ruby',
  'rp',
  'rt',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'tt',
  'u',
  'var',
  'wbr',
])

/** Block generics render as `div`, inline generics as `span` in the screen reader view. */
export function genericWrapperTag(node: AxTreeNode): 'div' | 'span' {
  const tag = node.tagName?.toLowerCase()
  if (!tag) return 'div'
  return INLINE_HTML_TAGS.has(tag) ? 'span' : 'div'
}

export function isLandmarkRole(role: string | undefined): boolean {
  return role != null && LANDMARK_ROLES.has(role)
}

export function shouldDedupChildren(node: AxTreeNode): boolean {
  const role = node.role?.toLowerCase()
  return role != null && DEDUP_ROLES.has(role) && Boolean(getSpeakableLabel(node))
}

const INTERACTIVE_DESCENDANT_ROLES = new Set([
  'link',
  'button',
  'checkbox',
  'radio',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'tab',
  'treeitem',
  'switch',
  'textbox',
  'combobox',
  'searchbox',
  'slider',
  'spinbutton',
])

/** Whether a node contains nested controls/links that need their own reader lines. */
export function hasInteractiveDescendants(node: AxTreeNode): boolean {
  function visit(children: AxTreeNode[]): boolean {
    for (const child of children) {
      const role = child.role?.toLowerCase()
      if (role != null && INTERACTIVE_DESCENDANT_ROLES.has(role)) {
        if (getSpeakableLabel(child) || child.attributes?.focusable === 'true') return true
      }
      if (child.children.length > 0 && visit(child.children)) return true
    }
    return false
  }

  return visit(node.children)
}

export function isRedundantTextNode(node: AxTreeNode, parentLabel?: string): boolean {
  const role = node.role?.toLowerCase()
  if (role == null || !REDUNDANT_TEXT_ROLES.has(role)) return false
  const label = getSpeakableLabel(node)
  return Boolean(label && parentLabel && label === parentLabel)
}

export function headingLevel(level: number | undefined): 1 | 2 | 3 | 4 | 5 | 6 {
  const n = level ?? 2
  return Math.min(6, Math.max(1, n)) as 1 | 2 | 3 | 4 | 5 | 6
}

export function getStateNotes(node: AxTreeNode): string[] {
  const notes: string[] = []
  const states = node.states
  if (!states) return notes

  if (states.disabled === true) notes.push('disabled')
  if (states.required === true) notes.push('required')
  if (states.readOnly === true) notes.push('read only')

  if (states.checked === true) notes.push('checked')
  else if (states.checked === false) notes.push('not checked')
  if (states.indeterminate === true) notes.push('mixed')

  if (states.expanded === true) notes.push('expanded')
  else if (states.expanded === false) notes.push('collapsed')

  if (states.selected === true) notes.push('selected')
  else if (states.selected === false) notes.push('not selected')

  if (states.pressed === true) notes.push('pressed')
  else if (states.pressed === false) notes.push('not pressed')
  else if (states.pressed === 'mixed') notes.push('partially pressed')

  if (states.current) notes.push(`current ${states.current}`)

  return notes
}

export function getRoleNotes(node: AxTreeNode): string[] {
  const notes: string[] = []
  const role = node.role
  const attrs = node.attributes

  if (role === 'link') {
    notes.push('link')
    const href = attrs?.href
    if (href) notes.push(href)
  }

  const hasPopup = attrs?.['aria-haspopup']
  if (hasPopup != null && hasPopup !== 'false') {
    notes.push(hasPopup === 'true' ? 'has popup' : `has popup ${hasPopup}`)
  }

  if (node.description) {
    notes.push(`description: ${node.description}`)
  }

  if (attrs?.focusable === 'true') {
    notes.push('focusable')
  }

  return notes
}

export function formatNotes(stateNotes: string[], roleNotes: string[]): string {
  const all = [...roleNotes, ...stateNotes]
  return all.length > 0 ? all.join(', ') : ''
}

export function findAxTreeNode(roots: AxTreeNode[], nodeId: string): AxTreeNode | null {
  for (const root of roots) {
    if (getAxTreeFocusId(root) === nodeId || root.nodeId === nodeId) return root
    const found = findAxTreeNode(root.children, nodeId)
    if (found) return found
  }
  return null
}

/**
 * Lookup table for `findAxTreeNode` — build once per tree instead of searching
 * the whole tree on every focus change. First match in pre-order wins.
 */
export function indexAxTreeNodes(roots: AxTreeNode[]): Map<string, AxTreeNode> {
  const index = new Map<string, AxTreeNode>()
  const stack = [...roots].reverse()
  while (stack.length > 0) {
    const node = stack.pop()!
    const focusId = getAxTreeFocusId(node)
    if (!index.has(focusId)) index.set(focusId, node)
    if (!index.has(node.nodeId)) index.set(node.nodeId, node)
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!)
  }
  return index
}
