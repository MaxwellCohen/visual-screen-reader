import { buildDomAxTree, getFocusedAxTreeNodeId, stampDomNodeIds } from './build-dom-ax-tree'
import { countAxTreeNodes } from '../shared/ax-tree'
import { setAxTreeWatching, startAxTreeObserver } from './observe-ax-tree'
import type { DomAxTreeResultMessage } from '../shared/messages'

if (window === window.top) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'SET_WATCHING') {
      setAxTreeWatching(message.watching === true)
      return
    }

    if (message?.type !== 'GET_AX_TREE') return

    stampDomNodeIds()
    const roots = buildDomAxTree()
    const response: DomAxTreeResultMessage = {
      type: 'DOM_AX_TREE_RESULT',
      roots,
      nodeCount: countAxTreeNodes(roots),
      focusedNodeId: getFocusedAxTreeNodeId(),
    }
    sendResponse(response)
    return true
  })

  startAxTreeObserver()
  console.debug('[visual-screen-reader] content script loaded')
}
