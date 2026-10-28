import { getAxTreeNodeIdForElement, getFocusedAxTreeNodeId } from './build-dom-ax-tree'
import type { DomAxTreeUpdatedMessage, DomFocusChangedMessage } from '../shared/messages'

const DEBOUNCE_MS = 200
const FOCUS_DEBOUNCE_MS = 25

let debounceTimer: ReturnType<typeof setTimeout> | undefined
let focusDebounceTimer: ReturnType<typeof setTimeout> | undefined
let watching = false
let started = false
let mutationObserver: MutationObserver | undefined
let lastFocusedNodeId: string | null | undefined

const MUTATION_OBSERVER_OPTIONS: MutationObserverInit = {
  subtree: true,
  childList: true,
  attributes: true,
  characterData: true,
}

/** Fire-and-forget; the background may be restarting, or this script orphaned by an extension reload. */
function sendToBackground(message: DomAxTreeUpdatedMessage | DomFocusChangedMessage): void {
  try {
    void chrome.runtime.sendMessage(message)?.catch(() => {})
  } catch {
    // Extension context invalidated.
  }
}

/**
 * Only the active tab of a window with an open side panel is watched. The MutationObserver is
 * connected just while watching so idle tabs don't pay for observing every DOM change.
 */
export function setAxTreeWatching(value: boolean): void {
  if (watching === value) {
    if (value) scheduleDomAxTreeUpdate()
    return
  }

  watching = value
  if (!watching) {
    mutationObserver?.disconnect()
    clearTimeout(debounceTimer)
    clearTimeout(focusDebounceTimer)
    lastFocusedNodeId = undefined
    return
  }

  if (started) mutationObserver?.observe(document.documentElement, MUTATION_OBSERVER_OPTIONS)
  pushFocusChange(getFocusedAxTreeNodeId())
  scheduleDomAxTreeUpdate()
}

function pushDomAxTreeUpdate(): void {
  if (!watching) return
  const focusedNodeId = getFocusedAxTreeNodeId()
  const message: DomAxTreeUpdatedMessage = {
    type: 'DOM_AX_TREE_UPDATED',
    focusedNodeId,
  }
  sendToBackground(message)

  // Keep dedup state aligned after positional nodeIds may have changed.
  lastFocusedNodeId = focusedNodeId
}

function scheduleDomAxTreeUpdate(): void {
  if (!watching) return
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(pushDomAxTreeUpdate, DEBOUNCE_MS)
}

function onRouteChange(): void {
  scheduleDomAxTreeUpdate()
}

function onFormFieldChange(event: Event): void {
  const target = event.target
  if (!(target instanceof Element)) return
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    scheduleDomAxTreeUpdate()
  }
}

function pushFocusChange(nodeId: string | null): void {
  if (!watching) return
  if (nodeId === lastFocusedNodeId) return
  lastFocusedNodeId = nodeId

  const message: DomFocusChangedMessage = {
    type: 'DOM_FOCUS_CHANGED',
    nodeId,
  }
  sendToBackground(message)
}

function scheduleFocusChange(target: Element): void {
  if (!watching) return
  clearTimeout(focusDebounceTimer)
  focusDebounceTimer = setTimeout(() => {
    pushFocusChange(getAxTreeNodeIdForElement(target))
  }, FOCUS_DEBOUNCE_MS)
}

function scheduleFocusClear(): void {
  if (!watching) return
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
  if (started) return
  started = true

  mutationObserver = new MutationObserver(() => {
    scheduleDomAxTreeUpdate()
  })
  if (watching) mutationObserver.observe(document.documentElement, MUTATION_OBSERVER_OPTIONS)

  // Content scripts run in an isolated world, so patching `history.pushState` here would never see
  // the page's own calls. SPA navigations are caught by the Navigation API, DOM mutations, and
  // `chrome.tabs.onUpdated` URL changes in the background.
  window.addEventListener('popstate', onRouteChange)
  window.addEventListener('hashchange', onRouteChange)

  const navigation = (window as Window & { navigation?: EventTarget }).navigation
  navigation?.addEventListener('navigate', onRouteChange)

  document.addEventListener('focusin', onFocusIn, { capture: true, passive: true })
  document.addEventListener('input', onFormFieldChange, { capture: true, passive: true })
  document.addEventListener('change', onFormFieldChange, { capture: true, passive: true })
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('focus', onWindowFocus)
}

/** Tear down observers/listeners started by `startAxTreeObserver` (tests + HMR). */
export function stopAxTreeObserver(): void {
  if (!started) return
  started = false
  watching = false
  lastFocusedNodeId = undefined

  clearTimeout(debounceTimer)
  clearTimeout(focusDebounceTimer)
  debounceTimer = undefined
  focusDebounceTimer = undefined

  mutationObserver?.disconnect()
  mutationObserver = undefined

  window.removeEventListener('popstate', onRouteChange)
  window.removeEventListener('hashchange', onRouteChange)

  const navigation = (window as Window & { navigation?: EventTarget }).navigation
  navigation?.removeEventListener('navigate', onRouteChange)

  document.removeEventListener('focusin', onFocusIn, { capture: true })
  document.removeEventListener('input', onFormFieldChange, { capture: true })
  document.removeEventListener('change', onFormFieldChange, { capture: true })
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('focus', onWindowFocus)
}
