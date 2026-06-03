import { buildDomAxTree, countAxTreeNodes } from './build-dom-ax-tree'
import type { DomAxTreeResultMessage } from '../shared/messages'

if (window === window.top) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'GET_AX_TREE') return

    const roots = buildDomAxTree()
    const response: DomAxTreeResultMessage = {
      type: 'DOM_AX_TREE_RESULT',
      roots,
      nodeCount: countAxTreeNodes(roots),
    }
    sendResponse(response)
    return true
  })

  console.debug('[visual-screen-reader] content script loaded')
}
