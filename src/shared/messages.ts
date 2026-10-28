import type { AxTreeNode } from './ax-tree'

/** Side panel → background: capture the active tab of the panel's window. */
export type GetAxTreeMessage = { type: 'GET_AX_TREE'; windowId: number }

/** Background → content: build the DOM-derived fallback tree. */
export type GetDomAxTreeMessage = { type: 'GET_DOM_AX_TREE' }

/** Background → content: report the focused element's DOM path (cheap; no tree build). */
export type GetDomFocusMessage = { type: 'GET_DOM_FOCUS' }

export type DomAxTreeResultMessage = {
  type: 'DOM_AX_TREE_RESULT'
  roots: AxTreeNode[]
  nodeCount: number
  focusedNodeId: string | null
}

export type DomFocusResultMessage = {
  type: 'DOM_FOCUS_RESULT'
  focusedNodeId: string | null
}

/** DOM change trigger — content script reports focus; background fetches CDP tree. */
export type DomAxTreeUpdatedMessage = {
  type: 'DOM_AX_TREE_UPDATED'
  focusedNodeId: string | null
}

export type DomFocusChangedMessage = {
  type: 'DOM_FOCUS_CHANGED'
  nodeId: string | null
}

/** Tells a content script whether the side panel is open for its tab. */
export type SetWatchingMessage = { type: 'SET_WATCHING'; watching: boolean }

/**
 * Side panels hold a long-lived port named `${SIDE_PANEL_PORT_PREFIX}${windowId}`.
 * The port scopes pushes to one window and its disconnect is the reliable "panel closed" signal.
 */
export const SIDE_PANEL_PORT_PREFIX = 'sidepanel:'

export function sidePanelPortName(windowId: number): string {
  return `${SIDE_PANEL_PORT_PREFIX}${windowId}`
}

export function parseSidePanelPortName(name: string): number | null {
  if (!name.startsWith(SIDE_PANEL_PORT_PREFIX)) return null
  const windowId = Number(name.slice(SIDE_PANEL_PORT_PREFIX.length))
  return Number.isInteger(windowId) ? windowId : null
}

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

/** Messages the background pushes to a side panel over its port. */
export type SidePanelPushMessage = BackgroundResponse | AxTreeFocusMessage

export type ContentRequest = GetDomAxTreeMessage | GetDomFocusMessage | SetWatchingMessage

export type ContentResponse = DomAxTreeResultMessage

export type ContentFocusResponse = DomFocusResultMessage

export type ContentToBackgroundMessage = DomAxTreeUpdatedMessage | DomFocusChangedMessage

export type SidePanelToBackgroundMessage = GetAxTreeMessage
