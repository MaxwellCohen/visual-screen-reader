import type { AxNode } from '../shared/ax-tree'
import { buildAxTree, type AxTreeNode } from '../shared/ax-tree'

const CDP_PROTOCOL = '1.3'
const DOM_NODE_ID_ATTR = 'data-vsr-node-id'

const attachedTabs = new Set<number>()
let accessibilityEnabled = false

interface CdpDomNode {
  backendNodeId?: number
  attributes?: string[]
  children?: CdpDomNode[]
  contentDocument?: CdpDomNode
  shadowRoots?: CdpDomNode[]
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

function collectDomLinkFromNode(node: CdpDomNode, map: Map<number, string>): void {
  if (node.backendNodeId != null && node.attributes) {
    const attrs = node.attributes
    for (let i = 0; i < attrs.length - 1; i += 2) {
      if (attrs[i] === DOM_NODE_ID_ATTR && attrs[i + 1]) {
        map.set(node.backendNodeId, attrs[i + 1])
        break
      }
    }
  }
}

function walkDomTree(node: CdpDomNode | undefined, map: Map<number, string>): void {
  if (!node) return

  collectDomLinkFromNode(node, map)

  for (const child of node.children ?? []) {
    walkDomTree(child, map)
  }
  for (const shadow of node.shadowRoots ?? []) {
    walkDomTree(shadow, map)
  }
  walkDomTree(node.contentDocument, map)
}

async function fetchBackendDomLinks(tabId: number): Promise<Map<number, string>> {
  const doc = await sendDebuggerCommand<GetDocumentResult>(tabId, 'DOM.getDocument', {
    depth: -1,
    pierce: true,
  })
  const map = new Map<number, string>()
  walkDomTree(doc.root, map)
  return map
}

async function fetchBackendDomLinksViaDescribe(
  tabId: number,
  axNodes: AxNode[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>()
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
        if (result.node) collectDomLinkFromNode(result.node, map)
      } catch {
        // Some AX nodes reference backend ids that cannot be described.
      }
    }),
  )

  return map
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
  try {
    backendToDomNodeId = await fetchBackendDomLinks(tabId)
    if (backendToDomNodeId.size === 0 && axNodes.some((node) => node.backendDOMNodeId != null)) {
      backendToDomNodeId = await fetchBackendDomLinksViaDescribe(tabId, axNodes)
    }
  } catch (linkErr) {
    console.warn('[visual-screen-reader] CDP DOM linking failed; tree will render without DOM ids', linkErr)
  }

  return buildAxTree(axNodes, backendToDomNodeId)
}

chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId != null) attachedTabs.delete(source.tabId)
  accessibilityEnabled = false
  console.debug('[visual-screen-reader] debugger detached', source.tabId, reason)
})
