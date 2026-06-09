import type { AxTreeNode } from './ax-tree'

export type GetAxTreeMessage = { type: 'GET_AX_TREE' }

export type DomAxTreeResultMessage = {
  type: 'DOM_AX_TREE_RESULT'
  roots: AxTreeNode[]
  nodeCount: number
  focusedNodeId: string | null
}

/** DOM change trigger — content script stamps node ids; background fetches CDP tree. */
export type DomAxTreeUpdatedMessage = {
  type: 'DOM_AX_TREE_UPDATED'
  focusedNodeId: string | null
}

export type DomFocusChangedMessage = {
  type: 'DOM_FOCUS_CHANGED'
  nodeId: string | null
}

export type SidePanelOpenMessage = { type: 'SIDE_PANEL_OPEN'; windowId: number }
export type SidePanelCloseMessage = { type: 'SIDE_PANEL_CLOSE'; windowId: number }

/** Tells a content script whether the side panel is open for its tab. */
export type SetWatchingMessage = { type: 'SET_WATCHING'; watching: boolean }

export type AxTreeResultMessage = {
  type: 'AX_TREE_RESULT'
  tabId: number
  tabTitle: string
  url: string
  roots: AxTreeNode[]
  nodeCount: number
  focusedNodeId: string | null
  source: 'cdp' | 'dom'
  /** Set when CDP capture failed and the DOM-derived tree was used instead. */
  cdpError?: string
}

export type AxTreeFocusMessage = {
  type: 'AX_TREE_FOCUS'
  tabId: number
  nodeId: string | null
}

export type AxTreeErrorMessage = {
  type: 'AX_TREE_ERROR'
  error: string
}

export type AxTreePushMessage = AxTreeResultMessage

export type BackgroundResponse = AxTreeResultMessage | AxTreeErrorMessage

export type ContentRequest = GetAxTreeMessage | SetWatchingMessage

export type ContentResponse = DomAxTreeResultMessage

export type ContentToBackgroundMessage = DomAxTreeUpdatedMessage | DomFocusChangedMessage

export type SidePanelToBackgroundMessage =
  | GetAxTreeMessage
  | SidePanelOpenMessage
  | SidePanelCloseMessage
