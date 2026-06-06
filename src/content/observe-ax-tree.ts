import { buildDomAxTree, countAxTreeNodes } from './build-dom-ax-tree'
import type { DomAxTreeUpdatedMessage } from '../shared/messages'

const DEBOUNCE_MS = 200

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

  scheduleDomAxTreeUpdate()
}
