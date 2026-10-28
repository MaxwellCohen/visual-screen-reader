import { countAxTreeNodes } from '../shared/ax-tree'
import type { DomAxTreeResultMessage, DomFocusResultMessage } from '../shared/messages'
import { buildDomAxTree, getFocusedAxTreeNodeId } from './build-dom-ax-tree'
import { setAxTreeWatching, startAxTreeObserver } from './observe-ax-tree'

if (window === window.top) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'SET_WATCHING') {
      setAxTreeWatching(message.watching === true)
      return
    }

    if (message?.type === 'GET_DOM_FOCUS') {
      const response: DomFocusResultMessage = {
        type: 'DOM_FOCUS_RESULT',
        focusedNodeId: getFocusedAxTreeNodeId(),
      }
      sendResponse(response)
      return
    }

    if (message?.type !== 'GET_DOM_AX_TREE') return

    const roots = buildDomAxTree()
    const response: DomAxTreeResultMessage = {
      type: 'DOM_AX_TREE_RESULT',
      roots,
      nodeCount: countAxTreeNodes(roots),
      focusedNodeId: getFocusedAxTreeNodeId(),
    }
    sendResponse(response)
  })

  startAxTreeObserver()
  console.debug('[visual-screen-reader] content script loaded')
}
