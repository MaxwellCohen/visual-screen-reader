import type { AxTreeNode } from '../shared/ax-tree'

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

const DEDUP_ROLES = new Set(['heading', 'link', 'button', 'image'])

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

export function isLandmarkRole(role: string | undefined): boolean {
  return role != null && LANDMARK_ROLES.has(role)
}

export function shouldDedupChildren(node: AxTreeNode): boolean {
  const role = node.role
  return role != null && DEDUP_ROLES.has(role) && Boolean(getSpeakableLabel(node))
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

  return notes
}

export function formatNotes(stateNotes: string[], roleNotes: string[]): string {
  const all = [...roleNotes, ...stateNotes]
  return all.length > 0 ? all.join(', ') : ''
}
