import type { AxTreeNode } from '../shared/ax-tree'
import { getAxTreeFocusId } from '../shared/dom-link'
import {
  formatNotes,
  getRoleNotes,
  getSpeakableLabel,
  getStateNotes,
  hasInteractiveDescendants,
  headingLevel,
  genericWrapperTag,
  isGenericContainer,
  isLandmarkRole,
  isPassthroughRole,
  isRedundantTextNode,
  shouldDedupChildren,
} from './ax-tree-speech'

export type ReaderLineKind =
  | 'generic'
  | 'text'
  | 'heading'
  | 'image'
  | 'link'
  | 'button'
  | 'control'
  | 'listitem'
  | 'landmark'

export interface ReaderLineItem {
  focusId: string
  kind: ReaderLineKind
  label?: string
  notes?: string
  /** Individual state/role annotations, rendered as discrete badges. */
  noteTokens?: string[]
  role?: string
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6
  landmarkRole?: string
  depth: number
  dedup: boolean
  /** Wrapper element for generic lines (`div` for block, `span` for inline). */
  genericTag?: 'div' | 'span'
}

export interface FlattenedReaderTree {
  lines: ReaderLineItem[]
  /** First line whose own focusId matches (exact hit). */
  exactLineIndex: Map<string, number>
  /** Fallback line for focus ids that were folded into another line. */
  focusLineIndex: Map<string, number>
  lineOffsets: number[]
  totalHeight: number
}

export const READER_LINE_HEIGHTS: Record<ReaderLineKind, number> = {
  text: 30,
  generic: 30,
  heading: 38,
  image: 30,
  link: 30,
  button: 38,
  control: 30,
  listitem: 30,
  landmark: 64,
}

export const VIRTUALIZE_LINE_THRESHOLD = 150

const ESTIMATED_CHARS_PER_LINE = 52
const ESTIMATED_LINE_WRAP_HEIGHT = 22

function lineHeight(line: ReaderLineItem): number {
  const base = READER_LINE_HEIGHTS[line.kind]
  const labelLength = (line.label?.length ?? 0) + (line.notes?.length ?? 0)
  if (labelLength === 0) return base

  const wrappedLines = Math.ceil(labelLength / ESTIMATED_CHARS_PER_LINE)
  return base + Math.max(0, wrappedLines - 1) * ESTIMATED_LINE_WRAP_HEIGHT
}

function buildLineOffsets(lines: ReaderLineItem[]): { lineOffsets: number[]; totalHeight: number } {
  const lineOffsets = [0]
  for (const line of lines) {
    lineOffsets.push(lineOffsets[lineOffsets.length - 1]! + lineHeight(line))
  }
  return { lineOffsets, totalHeight: lineOffsets[lineOffsets.length - 1]! }
}

export function flattenAxTreeForReader(roots: AxTreeNode[]): FlattenedReaderTree {
  const lines: ReaderLineItem[] = []
  const exactLineIndex = new Map<string, number>()
  const focusLineIndex = new Map<string, number>()

  function recordFocus(focusId: string, lineIndex: number): void {
    focusLineIndex.set(focusId, lineIndex)
  }

  function recordDescendantFocus(node: AxTreeNode, lineIndex: number): void {
    for (const child of node.children) {
      recordFocus(getAxTreeFocusId(child), lineIndex)
      recordDescendantFocus(child, lineIndex)
    }
  }

  function pushLine(
    focusId: string,
    depth: number,
    item: Omit<ReaderLineItem, 'focusId' | 'depth'>,
  ): number {
    const lineIndex = lines.length
    lines.push({ focusId, depth, ...item })
    if (!exactLineIndex.has(focusId)) exactLineIndex.set(focusId, lineIndex)
    recordFocus(focusId, lineIndex)
    return lineIndex
  }

  function walk(node: AxTreeNode, parentLabel: string | undefined, depth: number): void {
    const label = getSpeakableLabel(node)
    const stateNotes = getStateNotes(node)
    const roleNotes = getRoleNotes(node)
    const notesText = formatNotes(stateNotes, roleNotes) || undefined
    const noteTokens = [...roleNotes, ...stateNotes]
    const noteFields = {
      notes: notesText,
      noteTokens: noteTokens.length > 0 ? noteTokens : undefined,
    }
    const dedup = shouldDedupChildren(node)
    const role = node.role ?? 'generic'
    const focusId = getAxTreeFocusId(node)
    const hLevel = headingLevel(node.level)
    const redundantText = isRedundantTextNode(node, parentLabel)

    if (redundantText) {
      const before = lines.length
      for (const child of node.children) walk(child, label, depth)
      recordFocus(focusId, lines.length > before ? before : Math.max(0, lines.length - 1))
      return
    }

    if (node.ignored) {
      const before = lines.length
      for (const child of node.children) walk(child, parentLabel, depth)
      recordFocus(focusId, lines.length > before ? before : Math.max(0, lines.length - 1))
      return
    }

    if (isGenericContainer(node)) {
      if (label) {
        pushLine(focusId, depth, {
          kind: 'generic',
          label,
          ...noteFields,
          dedup: false,
          genericTag: genericWrapperTag(node),
        })
      }
      else recordFocus(focusId, Math.max(0, lines.length - 1))
      const childDepth = label ? depth + 1 : depth
      for (const child of node.children) walk(child, label, childDepth)
      return
    }

    if (role === 'generic' && label) {
      pushLine(focusId, depth, {
        kind: 'generic',
        label,
        ...noteFields,
        dedup: false,
        genericTag: genericWrapperTag(node),
      })
      return
    }

    if (isPassthroughRole(role)) {
      if (label) pushLine(focusId, depth, { kind: 'text', label, ...noteFields, dedup: false })
      else recordFocus(focusId, Math.max(0, lines.length - 1))
      for (const child of node.children) walk(child, label, depth)
      return
    }

    if (role === 'heading') {
      pushLine(focusId, depth, {
        kind: 'heading',
        label,
        ...noteFields,
        dedup,
        headingLevel: hLevel,
        role,
      })
      if (!dedup) for (const child of node.children) walk(child, label, depth)
      return
    }

    if (role === 'image') {
      pushLine(focusId, depth, { kind: 'image', label, ...noteFields, dedup: true, role })
      return
    }

    if (role === 'link') {
      const lineIndex = pushLine(focusId, depth, { kind: 'link', label, ...noteFields, dedup, role })
      if (!dedup) for (const child of node.children) walk(child, label, depth)
      else if (hasInteractiveDescendants(node)) {
        for (const child of node.children) walk(child, label, depth + 1)
      } else {
        recordDescendantFocus(node, lineIndex)
      }
      return
    }

    if (role === 'button') {
      const lineIndex = pushLine(focusId, depth, { kind: 'button', label, ...noteFields, dedup, role })
      if (!dedup) for (const child of node.children) walk(child, label, depth)
      else if (hasInteractiveDescendants(node)) {
        for (const child of node.children) walk(child, label, depth + 1)
      } else {
        recordDescendantFocus(node, lineIndex)
      }
      return
    }

    if (role === 'checkbox' || role === 'radio') {
      pushLine(focusId, depth, { kind: 'control', label, ...noteFields, dedup, role })
      if (!dedup) for (const child of node.children) walk(child, label, depth)
      return
    }

    if (role === 'paragraph') {
      pushLine(focusId, depth, { kind: 'text', label, ...noteFields, dedup, role })
      if (!dedup) for (const child of node.children) walk(child, label, depth)
      return
    }

    if (role === 'list') {
      recordFocus(focusId, Math.max(0, lines.length))
      for (const child of node.children) walk(child, parentLabel, depth)
      return
    }

    if (role === 'listitem') {
      pushLine(focusId, depth, { kind: 'listitem', label, ...noteFields, dedup: false, role })
      for (const child of node.children) walk(child, label, depth + 1)
      return
    }

    if (isLandmarkRole(role)) {
      pushLine(focusId, depth, {
        kind: 'landmark',
        label: dedup ? undefined : label,
        ...noteFields,
        dedup,
        role,
        landmarkRole: role,
      })
      for (const child of node.children) walk(child, label, 0)
      return
    }

    if (label) pushLine(focusId, depth, { kind: 'text', label, ...noteFields, dedup: false, role })
    else recordFocus(focusId, Math.max(0, lines.length - 1))
    if (!dedup) for (const child of node.children) walk(child, label, depth)
  }

  for (const root of roots) walk(root, undefined, 0)

  const { lineOffsets, totalHeight } = buildLineOffsets(lines)
  return { lines, exactLineIndex, focusLineIndex, lineOffsets, totalHeight }
}

export function resolveFocusedReaderLineIndex(
  flattened: FlattenedReaderTree,
  focusedNodeId: string | null,
): number | undefined {
  if (!focusedNodeId) return undefined

  return flattened.exactLineIndex.get(focusedNodeId) ?? flattened.focusLineIndex.get(focusedNodeId)
}

export function findVisibleLineRange(
  lineOffsets: number[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 8,
): { start: number; end: number } {
  const lineCount = lineOffsets.length - 1
  if (lineCount <= 0) return { start: 0, end: 0 }

  const viewBottom = scrollTop + viewportHeight

  let start = 0
  let low = 0
  let high = lineCount - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const bottom = lineOffsets[mid + 1]!
    if (bottom <= scrollTop) {
      start = mid + 1
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  let end = lineCount
  low = start
  high = lineCount - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const top = lineOffsets[mid]!
    if (top < viewBottom) {
      end = mid + 1
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return {
    start: Math.max(0, start - overscan),
    end: Math.min(lineCount, end + overscan),
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function notesHtml(notes?: string): string {
  return notes ? `<span class="sr-note"> (${escapeHtml(notes)})</span>` : ''
}

export function readerLinesToHtml(lines: ReaderLineItem[]): string {
  const parts: string[] = []

  for (const line of lines) {
    const notes = notesHtml(line.notes)

    switch (line.kind) {
      case 'heading': {
        const level = line.headingLevel ?? 2
        const label = line.label ? escapeHtml(line.label) : ''
        parts.push(
          `<h${level} class="sr-heading" data-node-id="${line.focusId}">${label}${notes}</h${level}>`,
        )
        break
      }
      case 'image': {
        const label = line.label
          ? `<em>[Image: ${escapeHtml(line.label)}]</em>`
          : '<em>[Image]</em>'
        parts.push(`<p class="sr-image" data-node-id="${line.focusId}">${label}${notes}</p>`)
        break
      }
      case 'link': {
        const label = line.label ? escapeHtml(line.label) : ''
        parts.push(
          `<div class="sr-link" data-node-id="${line.focusId}"><span class="sr-link-label">${label}</span>${notes}</div>`,
        )
        break
      }
      case 'button': {
        const label = line.label ? escapeHtml(line.label) : 'Button'
        parts.push(
          `<span class="sr-button" data-node-id="${line.focusId}"><button type="button" disabled>${label}</button>${notes}</span>`,
        )
        break
      }
      case 'control': {
        const role = escapeHtml(line.role ?? 'control')
        const label = line.label ? escapeHtml(line.label) : ''
        parts.push(
          `<p class="sr-control" data-node-id="${line.focusId}"><span class="sr-role">${role}</span> ${label}${notes}</p>`,
        )
        break
      }
      case 'listitem': {
        const label = line.label ? escapeHtml(line.label) : ''
        parts.push(`<li class="sr-listitem" data-node-id="${line.focusId}">${label}${notes}</li>`)
        break
      }
      case 'landmark': {
        const role = escapeHtml(line.landmarkRole ?? line.role ?? 'landmark')
        const name = line.label
          ? `<p class="sr-landmark-name">${escapeHtml(line.label)}</p>`
          : ''
        parts.push(
          `<section class="sr-landmark" data-role="${role}" data-node-id="${line.focusId}"><span class="sr-landmark-label">${role}</span>${name}${notes}</section>`,
        )
        break
      }
      case 'generic': {
        const tag = line.genericTag ?? 'div'
        const wrapperClass = tag === 'span' ? 'sr-span' : 'sr-div'
        const labelTag = tag === 'span' ? 'span' : 'p'
        parts.push(
          `<${tag} class="${wrapperClass}" data-node-id="${line.focusId}"><${labelTag} class="sr-text">${escapeHtml(line.label ?? '')}${notes}</${labelTag}></${tag}>`,
        )
        break
      }
      default:
        parts.push(
          `<p class="sr-text" data-node-id="${line.focusId}">${escapeHtml(line.label ?? '')}${notes}</p>`,
        )
    }
  }

  return parts.join('')
}
