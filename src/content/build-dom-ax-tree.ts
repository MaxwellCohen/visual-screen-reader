import type { AxTreeNode } from '../shared/ax-tree'

export const DOM_NODE_ID_ATTR = 'data-vsr-node-id'

const IGNORED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'link',
  'meta',
  'head',
])

function isHidden(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.hidden) return true
  const style = getComputedStyle(el)
  return style.display === 'none' || style.visibility === 'hidden'
}

function getImplicitRole(el: Element): string {
  const tag = el.tagName.toLowerCase()

  if (tag === 'a' && el.hasAttribute('href')) return 'link'
  if (tag === 'button') return 'button'
  if (tag === 'select') return 'combobox'
  if (tag === 'textarea') return 'textbox'
  if (tag === 'img') return 'image'
  if (/^h[1-6]$/.test(tag)) return 'heading'
  if (tag === 'p') return 'paragraph'
  if (tag === 'ul' || tag === 'ol') return 'list'
  if (tag === 'li') return 'listitem'
  if (tag === 'nav') return 'navigation'
  if (tag === 'main') return 'main'
  if (tag === 'header') return 'banner'
  if (tag === 'footer') return 'contentinfo'
  if (tag === 'form') return 'form'
  if (tag === 'table') return 'table'
  if (tag === 'tr') return 'row'
  if (tag === 'td' || tag === 'th') return 'cell'

  if (tag === 'input' && el instanceof HTMLInputElement) {
    const type = el.type || 'text'
    if (type === 'checkbox') return 'checkbox'
    if (type === 'radio') return 'radio'
    if (type === 'button' || type === 'submit' || type === 'reset') return 'button'
    return 'textbox'
  }

  return 'generic'
}

function getRole(el: Element): string {
  return el.getAttribute('role')?.trim() || getImplicitRole(el)
}

function getAccessibleName(el: Element): string | undefined {
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter((part): part is string => Boolean(part))
    if (parts.length > 0) return parts.join(' ')
  }

  const ariaLabel = el.getAttribute('aria-label')?.trim()
  if (ariaLabel) return ariaLabel

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const fromLabel = el.labels?.[0]?.textContent?.trim()
    if (fromLabel) return fromLabel
    if (el.placeholder) return el.placeholder
    if (el.type !== 'password' && el.value) return el.value
  }

  if (el instanceof HTMLImageElement && el.alt) return el.alt.trim()

  if (el instanceof HTMLAnchorElement || el instanceof HTMLButtonElement) {
    const text = el.textContent?.trim()
    if (text) return text
  }

  const title = el.getAttribute('title')?.trim()
  if (title) return title

  return undefined
}

function getAccessibleDescription(el: Element): string | undefined {
  const describedBy = el.getAttribute('aria-describedby')
  if (describedBy) {
    const parts = describedBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter((part): part is string => Boolean(part))
    if (parts.length > 0) return parts.join(' ')
  }

  return el.getAttribute('aria-description')?.trim()
}

const NOTABLE_ATTRIBUTES = new Set([
  'id',
  'class',
  'href',
  'src',
  'alt',
  'type',
  'placeholder',
  'title',
  'for',
  'name',
  'value',
  'lang',
  'dir',
])

function getNodeAttributes(el: Element): Record<string, string> | undefined {
  const attrs: Record<string, string> = {}

  for (const attr of el.attributes) {
    if (attr.name.startsWith('aria-') || attr.name.startsWith('data-') || NOTABLE_ATTRIBUTES.has(attr.name)) {
      attrs[attr.name] = attr.value
    }
  }

  return Object.keys(attrs).length > 0 ? attrs : undefined
}

function getNodeStates(el: Element): Record<string, boolean | string> | undefined {
  const states: Record<string, boolean | string> = {}

  if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    if (el.disabled) states.disabled = true
    if ('required' in el && el.required) states.required = true
    if ('readOnly' in el && el.readOnly) states.readOnly = true
  }

  if (el instanceof HTMLInputElement) {
    if (el.checked) states.checked = true
    if (el.indeterminate) states.indeterminate = true
  }

  if (el instanceof HTMLDetailsElement) {
    states.expanded = el.open
  }

  const expanded = el.getAttribute('aria-expanded')
  if (expanded === 'true' || expanded === 'false') states.expanded = expanded === 'true'

  const selected = el.getAttribute('aria-selected')
  if (selected === 'true' || selected === 'false') states.selected = selected === 'true'

  const pressed = el.getAttribute('aria-pressed')
  if (pressed === 'true' || pressed === 'false') states.pressed = pressed === 'true'
  else if (pressed === 'mixed') states.pressed = 'mixed'

  const current = el.getAttribute('aria-current')
  if (current) states.current = current

  if (el instanceof HTMLElement && el.hidden) states.hidden = true

  return Object.keys(states).length > 0 ? states : undefined
}

function getHeadingLevel(el: Element, role: string): number | undefined {
  const match = el.tagName.match(/^H([1-6])$/i)
  if (match) return Number(match[1])

  if (role === 'heading') {
    const ariaLevel = el.getAttribute('aria-level')
    if (ariaLevel != null) {
      const n = Number(ariaLevel)
      if (Number.isFinite(n) && n >= 1 && n <= 6) return n
    }
  }

  return undefined
}

function getNodeContent(el: Element): string | undefined {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.type === 'password') return undefined
    const value = el.value?.trim()
    if (value) return value
  }

  const directText: string[] = []
  for (const child of el.childNodes) {
    if (child.nodeType !== Node.TEXT_NODE) continue
    const text = child.textContent?.trim()
    if (text) directText.push(text)
  }
  if (directText.length > 0) return directText.join(' ')

  if (el.children.length === 0) {
    const text = el.textContent?.trim()
    if (text) return text
  }

  return undefined
}

function walkElement(el: Element, nodeId: string): AxTreeNode | null {
  const tag = el.tagName.toLowerCase()
  if (IGNORED_TAGS.has(tag) || isHidden(el)) return null

  const children: AxTreeNode[] = []
  let childIndex = 0
  for (const child of el.children) {
    const treeChild = walkElement(child, `${nodeId}.${childIndex}`)
    childIndex += 1
    if (treeChild) children.push(treeChild)
  }

  const role = getRole(el)
  const name = getAccessibleName(el)
  const description = getAccessibleDescription(el)
  const content = getNodeContent(el)
  const textContent = el.textContent?.trim() || undefined
  const attributes = getNodeAttributes(el)
  const states = getNodeStates(el)
  const level = role === 'heading' ? getHeadingLevel(el, role) : undefined
  const ignored = el.getAttribute('aria-hidden') === 'true'

  if (ignored && children.length === 0) return null

  return {
    nodeId,
    ignored,
    role,
    name,
    description,
    content,
    textContent,
    tagName: tag,
    attributes,
    states,
    level,
    children,
  }
}

function childIndexAmongSiblings(el: Element): number {
  const parent = el.parentElement
  if (!parent) return -1
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i] === el) return i
  }
  return -1
}

function nodeIdPathFromBody(el: Element): string | null {
  if (el === document.body) return 'body'

  const path: number[] = []
  let current: Element | null = el

  while (current && current !== document.body) {
    const index = childIndexAmongSiblings(current)
    if (index < 0) return null
    path.unshift(index)
    current = current.parentElement
  }

  if (current !== document.body) return null
  return `body.${path.join('.')}`
}

/** Whether an element would appear in the DOM-derived AX tree (without building it). */
function elementIncludedInAxTree(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (IGNORED_TAGS.has(tag) || isHidden(el)) return false

  if (el.getAttribute('aria-hidden') === 'true') {
    for (const child of el.children) {
      if (elementIncludedInAxTree(child)) return true
    }
    return false
  }

  return true
}

/** Nearest ancestor (or self) that appears in the DOM-derived AX tree. */
export function getAxTreeNodeIdForElement(el: Element): string | null {
  let current: Element | null = el
  while (current && current !== document.documentElement) {
    if (current === document.body) return 'body'
    if (elementIncludedInAxTree(current)) return nodeIdPathFromBody(current)
    current = current.parentElement
  }
  return null
}

export function getFocusedAxTreeNodeId(): string | null {
  const active = document.activeElement
  if (!(active instanceof Element)) return null
  if (active === document.body || active === document.documentElement) return null
  return getAxTreeNodeIdForElement(active)
}

function stampElement(el: Element, nodeId: string): void {
  el.setAttribute(DOM_NODE_ID_ATTR, nodeId)
}

function clearStamp(el: Element): void {
  el.removeAttribute(DOM_NODE_ID_ATTR)
}

function stampElementTree(el: Element, nodeId: string): void {
  const tag = el.tagName.toLowerCase()
  if (IGNORED_TAGS.has(tag) || isHidden(el)) {
    clearStamp(el)
    return
  }

  const ignored = el.getAttribute('aria-hidden') === 'true'
  let hasIncludedChild = false
  let childIndex = 0

  for (const child of el.children) {
    const childNodeId = `${nodeId}.${childIndex}`
    childIndex += 1
    stampElementTree(child, childNodeId)
    if (child.hasAttribute(DOM_NODE_ID_ATTR)) hasIncludedChild = true
  }

  if (ignored && !hasIncludedChild) {
    clearStamp(el)
    return
  }

  stampElement(el, nodeId)
}

/** Stamp stable DOM paths on elements so CDP AX nodes can be linked back to the page. */
export function stampDomNodeIds(): void {
  if (document.body) stampElementTree(document.body, 'body')
}

export function buildDomAxTree(): AxTreeNode[] {
  const roots: AxTreeNode[] = []

  if (document.body) {
    const bodyTree = walkElement(document.body, 'body')
    if (bodyTree) roots.push(bodyTree)
  }

  return roots
}
