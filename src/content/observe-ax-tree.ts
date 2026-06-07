import { buildDomAxTree, countAxTreeNodes, getAxTreeNodeIdForElement } from './build-dom-ax-tree'
import type { DomAxTreeUpdatedMessage, DomFocusChangedMessage } from '../shared/messages'

const DEBOUNCE_MS = 200
const FOCUS_DEBOUNCE_MS = 100

let debounceTimer: ReturnType<typeof setTimeout> | undefined

function pushDomAxTreeUpdate(): void {
  const roots = buildDomAxTree()
  const message: DomAxTreeUpdatedMessage = {
    type: 'DOM_AX_TREE_UPDATED',
    roots,
    nodeCount: countAxTreeNodes(roots),
  }
  void chrome.runtime.sendMessage(message)
}

function scheduleDomAxTreeUpdate(): void {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(pushDomAxTreeUpdate, DEBOUNCE_MS)
}

function onRouteChange(): void {
  scheduleDomAxTreeUpdate()
}

function patchHistoryMethod(method: 'pushState' | 'replaceState'): void {
  const original = history[method].bind(history)
  history[method] = (...args: Parameters<History['pushState']>) => {
    original(...args)
    onRouteChange()
  }
}

let focusDebounceTimer: ReturnType<typeof setTimeout> | undefined
let lastFocusedNodeId: string | null | undefined

function pushFocusChange(nodeId: string | null): void {
  if (nodeId === lastFocusedNodeId) return
  lastFocusedNodeId = nodeId

  const message: DomFocusChangedMessage = {
    type: 'DOM_FOCUS_CHANGED',
    nodeId,
  }
  void chrome.runtime.sendMessage(message)
}

function scheduleFocusChange(target: Element): void {
  clearTimeout(focusDebounceTimer)
  focusDebounceTimer = setTimeout(() => {
    pushFocusChange(getAxTreeNodeIdForElement(target))
  }, FOCUS_DEBOUNCE_MS)
}

function onFocusIn(event: FocusEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return
  scheduleFocusChange(target)
}

export function startAxTreeObserver(): void {
  const observer = new MutationObserver(() => {
    scheduleDomAxTreeUpdate()
  })

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  })

  window.addEventListener('popstate', onRouteChange)
  window.addEventListener('hashchange', onRouteChange)
  patchHistoryMethod('pushState')
  patchHistoryMethod('replaceState')

  const navigation = (window as Window & { navigation?: EventTarget }).navigation
  navigation?.addEventListener('navigate', onRouteChange)

  document.addEventListener('focusin', onFocusIn, { capture: true, passive: true })

  const active = document.activeElement
  if (active instanceof Element) {
    pushFocusChange(getAxTreeNodeIdForElement(active))
  }

  scheduleDomAxTreeUpdate()
}
