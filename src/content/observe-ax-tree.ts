import {
  getAxTreeNodeIdForElement,
  getFocusedAxTreeNodeId,
  stampDomNodeIds,
} from './build-dom-ax-tree'
import type { DomAxTreeUpdatedMessage, DomFocusChangedMessage } from '../shared/messages'

const DEBOUNCE_MS = 200
const FOCUS_DEBOUNCE_MS = 100

let debounceTimer: ReturnType<typeof setTimeout> | undefined

function pushDomAxTreeUpdate(): void {
  stampDomNodeIds()
  const focusedNodeId = getFocusedAxTreeNodeId()
  const message: DomAxTreeUpdatedMessage = {
    type: 'DOM_AX_TREE_UPDATED',
    focusedNodeId,
  }
  void chrome.runtime.sendMessage(message)

  // Keep dedup state aligned after positional nodeIds may have changed.
  lastFocusedNodeId = focusedNodeId
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

function scheduleFocusClear(): void {
  clearTimeout(focusDebounceTimer)
  focusDebounceTimer = setTimeout(() => {
    if (!document.hasFocus()) {
      pushFocusChange(null)
      return
    }

    const active = document.activeElement
    if (!(active instanceof Element) || active === document.body || active === document.documentElement) {
      pushFocusChange(null)
    } else {
      pushFocusChange(getAxTreeNodeIdForElement(active))
    }
  }, FOCUS_DEBOUNCE_MS)
}

function onFocusIn(event: FocusEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return
  scheduleFocusChange(target)
}

function onWindowBlur(): void {
  scheduleFocusClear()
}

function onWindowFocus(): void {
  const active = document.activeElement
  if (active instanceof Element && active !== document.body && active !== document.documentElement) {
    scheduleFocusChange(active)
  } else {
    pushFocusChange(null)
  }
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
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('focus', onWindowFocus)

  pushFocusChange(getFocusedAxTreeNodeId())

  scheduleDomAxTreeUpdate()
}
