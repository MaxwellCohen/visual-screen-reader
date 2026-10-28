import type { AxTreeNode } from '../shared/ax-tree'
import {
  findBodyCdpNode,
  linkBackendDomNodeIdsFromBody,
  type BackendDomLinkInfo,
} from '../shared/dom-link'
import { buildAxTree, type AxNode } from './cdp-ax-adapter'

const CDP_PROTOCOL = '1.3'

/** `chrome.debugger` only exists in Chromium; Firefox falls back to the DOM-derived tree. */
export const hasCdp = typeof chrome !== 'undefined' && chrome.debugger != null

const attachedTabs = new Set<number>()
const accessibilityEnabledTabs = new Set<number>()

interface CdpDomNode {
  backendNodeId?: number
  nodeType?: number
  localName?: string
  attributes?: string[]
  children?: CdpDomNode[]
  contentDocument?: CdpDomNode
  shadowRoots?: CdpDomNode[]
}

interface BackendDomInfo extends BackendDomLinkInfo {}

interface GetFullAxTreeResult {
  nodes?: AxNode[]
}

interface GetDocumentResult {
  root?: CdpDomNode
}

function sendDebuggerCommand<T>(
  tabId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params ?? {}, (result) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(result as T)
    })
  })
}

export function isDebuggerAttached(tabId: number): boolean {
  return attachedTabs.has(tabId)
}

function attachOnce(tabId: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.debugger.attach({ tabId }, CDP_PROTOCOL, () => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve()
    })
  })
}

/** Detach this extension's session (if any); errors are expected when nothing is attached. */
function detachQuietly(tabId: number): Promise<void> {
  return new Promise<void>((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      void chrome.runtime.lastError
      resolve()
    })
  })
}

export async function attachDebugger(tabId: number): Promise<void> {
  if (attachedTabs.has(tabId)) return

  try {
    await attachOnce(tabId)
  } catch (err) {
    // After a service worker restart `attachedTabs` is empty but our previous session can still be
    // attached. `detach` only affects this extension's own session, so retry once after it.
    await detachQuietly(tabId)
    try {
      await attachOnce(tabId)
    } catch {
      throw err
    }
  }

  attachedTabs.add(tabId)
}

async function ensureAccessibilityEnabled(tabId: number): Promise<void> {
  if (accessibilityEnabledTabs.has(tabId)) return
  await sendDebuggerCommand(tabId, 'Accessibility.enable', {})
  accessibilityEnabledTabs.add(tabId)
}

export async function detachDebugger(tabId: number): Promise<void> {
  if (!attachedTabs.has(tabId)) return

  await new Promise<void>((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      attachedTabs.delete(tabId)
      accessibilityEnabledTabs.delete(tabId)
      resolve()
    })
  })
}

export async function detachAllDebuggers(): Promise<void> {
  await Promise.all([...attachedTabs].map((tabId) => detachDebugger(tabId)))
}

function collectTagNameFromNode(node: CdpDomNode, info: BackendDomInfo): void {
  if (node.backendNodeId == null || !node.localName) return
  info.tagNames.set(node.backendNodeId, node.localName.toLowerCase())
}

function walkDomTree(node: CdpDomNode | undefined, info: BackendDomInfo): void {
  if (!node) return

  collectTagNameFromNode(node, info)

  for (const child of node.children ?? []) {
    walkDomTree(child, info)
  }
  for (const shadow of node.shadowRoots ?? []) {
    walkDomTree(shadow, info)
  }
  walkDomTree(node.contentDocument, info)
}

function emptyBackendDomInfo(): BackendDomInfo {
  return { domNodeIds: new Map(), tagNames: new Map() }
}

async function fetchBackendDomInfo(tabId: number): Promise<BackendDomInfo> {
  const doc = await sendDebuggerCommand<GetDocumentResult>(tabId, 'DOM.getDocument', {
    depth: -1,
    pierce: true,
  })
  const info = emptyBackendDomInfo()
  walkDomTree(doc.root, info)
  const body = findBodyCdpNode(doc.root)
  if (body) linkBackendDomNodeIdsFromBody(body, info)
  return info
}

async function fetchBackendDomInfoViaDescribe(
  tabId: number,
  axNodes: AxNode[],
): Promise<BackendDomInfo> {
  const info = emptyBackendDomInfo()
  const backendIds = [
    ...new Set(
      axNodes.map((node) => node.backendDOMNodeId).filter((id): id is number => id != null),
    ),
  ]

  await Promise.all(
    backendIds.map(async (backendNodeId) => {
      try {
        const result = await sendDebuggerCommand<{ node?: CdpDomNode }>(tabId, 'DOM.describeNode', {
          backendNodeId,
          depth: 0,
        })
        if (result.node) collectTagNameFromNode(result.node, info)
      } catch {
        // Some AX nodes reference backend ids that cannot be described.
      }
    }),
  )

  return info
}

async function fetchCdpAxNodes(tabId: number): Promise<AxNode[]> {
  await ensureAccessibilityEnabled(tabId)
  const result = await sendDebuggerCommand<GetFullAxTreeResult>(tabId, 'Accessibility.getFullAXTree', {})
  const nodes = result.nodes ?? []
  if (nodes.length === 0) {
    throw new Error('Accessibility.getFullAXTree returned no nodes.')
  }
  return nodes
}

export async function fetchLinkedCdpAxTree(tabId: number): Promise<AxTreeNode[]> {
  await attachDebugger(tabId)

  const axNodes = await fetchCdpAxNodes(tabId)

  let backendToDomNodeId = new Map<number, string>()
  let backendToTagName = new Map<number, string>()
  try {
    const domInfo = await fetchBackendDomInfo(tabId)
    backendToDomNodeId = domInfo.domNodeIds
    backendToTagName = domInfo.tagNames
    if (backendToDomNodeId.size === 0 && axNodes.some((node) => node.backendDOMNodeId != null)) {
      const described = await fetchBackendDomInfoViaDescribe(tabId, axNodes)
      backendToDomNodeId = described.domNodeIds
      backendToTagName = described.tagNames
    }
  } catch (linkErr) {
    console.warn('[visual-screen-reader] CDP DOM linking failed; tree will render without DOM ids', linkErr)
  }

  return buildAxTree(axNodes, backendToDomNodeId, backendToTagName)
}

if (hasCdp) {
  chrome.debugger.onDetach.addListener((source, reason) => {
    if (source.tabId != null) {
      attachedTabs.delete(source.tabId)
      accessibilityEnabledTabs.delete(source.tabId)
    }
    console.debug('[visual-screen-reader] debugger detached', source.tabId, reason)
  })
}
