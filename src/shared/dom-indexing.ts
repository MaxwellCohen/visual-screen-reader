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

export function childDomNodeId(parentNodeId: string, childIndex: number): string {
  return `${parentNodeId}.${childIndex}`
}

export function domNodeIdFromPath(pathFromBody: number[]): string {
  return pathFromBody.length === 0
    ? DOM_ROOT_NODE_ID
    : `${DOM_ROOT_NODE_ID}.${pathFromBody.join('.')}`
}

export function isIgnoredDomTag(localName: string): boolean {
  return IGNORED_DOM_TAGS.has(localName.toLowerCase())
}

export function isAriaHiddenTrue(value: string | null | undefined): boolean {
  return value === 'true'
}

/** Excluded before children are visited (ignored tag or hidden). */
export function isExcludedBeforeChildren(tag: string, hidden: boolean): boolean {
  return isIgnoredDomTag(tag) || hidden
}

/** Excluded after children are visited (aria-hidden with no included descendants). */
export function isExcludedAfterChildren(ariaHidden: boolean, hasIncludedChild: boolean): boolean {
  return ariaHidden && !hasIncludedChild
}

export function shouldIncludeIndexedNode(input: {
  tag: string
  hidden: boolean
  ariaHidden: boolean
  hasIncludedChild: boolean
}): boolean {
  if (isExcludedBeforeChildren(input.tag, input.hidden)) return false
  if (isExcludedAfterChildren(input.ariaHidden, input.hasIncludedChild)) return false
  return true
}

/**
 * Attribute-only hidden check (matches CDP linker).
 * Computed display/visibility are intentionally ignored so body-relative paths
 * stay identical between the live DOM builder and CDP DOM linking.
 */
export function isElementHiddenByAttribute(el: Element): boolean {
  return el instanceof HTMLElement && el.hidden === true
}

/**
 * Walk element children with stable body-relative index assignment.
 * Index counts every child in DOM order, including excluded siblings.
 */
export function walkIndexedChildren<TChild, TResult>(
  children: Iterable<TChild>,
  parentNodeId: string,
  walkChild: (child: TChild, childNodeId: string) => TResult | null | undefined | false,
): { results: TResult[]; hasIncludedChild: boolean } {
  const results: TResult[] = []
  let hasIncludedChild = false
  let childIndex = 0

  for (const child of children) {
    const childNodeId = childDomNodeId(parentNodeId, childIndex)
    childIndex += 1
    const result = walkChild(child, childNodeId)
    if (result) {
      hasIncludedChild = true
      results.push(result)
    }
  }

  return { results, hasIncludedChild }
}
