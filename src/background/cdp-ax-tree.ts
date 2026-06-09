import type { AxTreeNode } from '../shared/ax-tree'
import { readDomNodeIdAttribute } from '../shared/dom-link'
import { buildAxTree, type AxNode } from './cdp-ax-adapter'

const CDP_PROTOCOL = '1.3'

const attachedTabs = new Set<number>()
let accessibilityEnabled = false

interface CdpDomNode {
  backendNodeId?: number
  localName?: string
  attributes?: string[]
  children?: CdpDomNode[]
  contentDocument?: CdpDomNode
  shadowRoots?: CdpDomNode[]
}

interface BackendDomInfo {
  domNodeIds: Map<number, string>
  tagNames: Map<number, string>
}

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

export async function attachDebugger(tabId: number): Promise<void> {
  if (attachedTabs.has(tabId)) return

  await new Promise<void>((resolve, reject) => {
    chrome.debugger.attach({ tabId }, CDP_PROTOCOL, () => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else {
        attachedTabs.add(tabId)
        resolve()
      }
    })
  })
}

async function ensureAccessibilityEnabled(tabId: number): Promise<void> {
  if (accessibilityEnabled) return
  await sendDebuggerCommand(tabId, 'Accessibility.enable', {})
  accessibilityEnabled = true
}

export async function detachDebugger(tabId: number): Promise<void> {
  if (!attachedTabs.has(tabId)) return

  await new Promise<void>((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      attachedTabs.delete(tabId)
      accessibilityEnabled = false
      resolve()
    })
  })
}

export async function detachAllDebuggers(): Promise<void> {
  await Promise.all([...attachedTabs].map((tabId) => detachDebugger(tabId)))
}

function collectDomInfoFromNode(node: CdpDomNode, info: BackendDomInfo): void {
  if (node.backendNodeId == null) return

  if (node.localName) {
    info.tagNames.set(node.backendNodeId, node.localName.toLowerCase())
  }

  const domNodeId = readDomNodeIdAttribute(node.attributes)
  if (domNodeId) {
    info.domNodeIds.set(node.backendNodeId, domNodeId)
  }
}

function walkDomTree(node: CdpDomNode | undefined, info: BackendDomInfo): void {
  if (!node) return

  collectDomInfoFromNode(node, info)

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
        if (result.node) collectDomInfoFromNode(result.node, info)
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

chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId != null) attachedTabs.delete(source.tabId)
  accessibilityEnabled = false
  console.debug('[visual-screen-reader] debugger detached', source.tabId, reason)
})
