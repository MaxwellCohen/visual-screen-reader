import type { AxTreeNode } from './ax-tree'

export type GetAxTreeMessage = { type: 'GET_AX_TREE' }

export type DomAxTreeResultMessage = {
  type: 'DOM_AX_TREE_RESULT'
  roots: AxTreeNode[]
  nodeCount: number
}

export type DomAxTreeUpdatedMessage = {
  type: 'DOM_AX_TREE_UPDATED'
  roots: AxTreeNode[]
  nodeCount: number
}

export type SidePanelOpenMessage = { type: 'SIDE_PANEL_OPEN'; windowId: number }
export type SidePanelCloseMessage = { type: 'SIDE_PANEL_CLOSE'; windowId: number }

export type AxTreeResultMessage = {
  type: 'AX_TREE_RESULT'
  tabId: number
  tabTitle: string
  url: string
  roots: AxTreeNode[]
  nodeCount: number
  source: 'dom'
}

export type AxTreeErrorMessage = {
  type: 'AX_TREE_ERROR'
  error: string
}

export type AxTreePushMessage = AxTreeResultMessage

export type BackgroundResponse = AxTreeResultMessage | AxTreeErrorMessage

export type ContentRequest = GetAxTreeMessage

export type ContentResponse = DomAxTreeResultMessage

export type ContentToBackgroundMessage = DomAxTreeUpdatedMessage

export type SidePanelToBackgroundMessage =
  | GetAxTreeMessage
  | SidePanelOpenMessage
  | SidePanelCloseMessage
