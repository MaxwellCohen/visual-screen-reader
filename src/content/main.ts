import { buildDomAxTree, countAxTreeNodes, getAxTreeNodeIdForElement } from './build-dom-ax-tree'
import { startAxTreeObserver } from './observe-ax-tree'
import type { DomAxTreeResultMessage } from '../shared/messages'

if (window === window.top) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'GET_AX_TREE') return

    const roots = buildDomAxTree()
    const active = document.activeElement
    const response: DomAxTreeResultMessage = {
      type: 'DOM_AX_TREE_RESULT',
      roots,
      nodeCount: countAxTreeNodes(roots),
      focusedNodeId:
        active instanceof Element ? getAxTreeNodeIdForElement(active) : null,
    }
    sendResponse(response)
    return true
  })

  startAxTreeObserver()
  console.debug('[visual-screen-reader] content script loaded')
}
