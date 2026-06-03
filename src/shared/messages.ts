import type { AxTreeNode } from './ax-tree'

export type GetAxTreeMessage = { type: 'GET_AX_TREE' }

export type DomAxTreeResultMessage = {
  type: 'DOM_AX_TREE_RESULT'
  roots: AxTreeNode[]
  nodeCount: number
}

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

export type BackgroundResponse = AxTreeResultMessage | AxTreeErrorMessage

export type ContentRequest = GetAxTreeMessage

export type ContentResponse = DomAxTreeResultMessage
