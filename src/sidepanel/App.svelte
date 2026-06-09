<script lang="ts">
  import { onMount } from 'svelte'
  import AxTreeJsonView from '../lib/AxTreeJsonView.svelte'
  import { axTreeToJsonString } from '../lib/flatten-ax-tree-json'
  import AxTreeReaderView from '../lib/AxTreeReaderView.svelte'
  import type { AxTreeNode } from '../shared/ax-tree'
  import { findAxTreeNode, getSpeakableLabel } from '../lib/ax-tree-speech'
  import type {
    AxTreeErrorMessage,
    AxTreeFocusMessage,
    AxTreePushMessage,
    BackgroundResponse,
  } from '../shared/messages'

  let loading = $state(false)
  let live = $state(false)
  let error = $state<string | null>(null)
  let tabTitle = $state('')
  let url = $state('')
  let tabId = $state<number | null>(null)
  let roots = $state<AxTreeNode[] | null>(null)
  let nodeCount = $state(0)
  let focusedNodeId = $state<string | null>(null)
  let source = $state<'cdp' | 'dom' | null>(null)
  let cdpError = $state<string | null>(null)
  let view: 'tree' | 'raw' = $state('tree')
  let copyFeedback = $state<string | null>(null)
  let readerView: { getHtml: () => string } | undefined = $state()
  let copyFeedbackTimeout: ReturnType<typeof setTimeout> | undefined
  let readerRoots = $state<AxTreeNode[] | null>(null)
  let readerFocusedNodeId = $state<string | null>(null)

  $effect(() => {
    if (view !== 'tree' || !roots) return
    readerFocusedNodeId = focusedNodeId
  })

  function syncReaderSnapshot(): void {
    if (!roots) return
    readerRoots = roots
    readerFocusedNodeId = focusedNodeId
  }

  const sourceLabel = $derived(
    source === 'cdp' ? 'browser AX tree (CDP)' : source === 'dom' ? 'DOM fallback' : '',
  )

  const focusedNode = $derived(
    roots && focusedNodeId ? findAxTreeNode(roots, focusedNodeId) : null,
  )
  const focusedLabel = $derived(
    focusedNode ? getSpeakableLabel(focusedNode) ?? focusedNode.role ?? 'Element' : null,
  )

  function showCopyFeedback(message: string): void {
    copyFeedback = message
    if (copyFeedbackTimeout) clearTimeout(copyFeedbackTimeout)
    copyFeedbackTimeout = setTimeout(() => {
      copyFeedback = null
    }, 2000)
  }

  async function copyText(text: string): Promise<void> {
    await navigator.clipboard.writeText(text)
    showCopyFeedback('Copied!')
  }

  async function copyHtml(html: string): Promise<void> {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([html], { type: 'text/plain' }),
        }),
      ])
    } catch {
      await navigator.clipboard.writeText(html)
    }
    showCopyFeedback('Copied!')
  }

  async function copyRawJson(): Promise<void> {
    if (!roots) return
    try {
      await copyText(axTreeToJsonString(roots))
    } catch (err) {
      showCopyFeedback(err instanceof Error ? err.message : 'Copy failed')
    }
  }

  async function copyScreenReaderHtml(): Promise<void> {
    const html = readerView?.getHtml()
    if (!html) return
    try {
      await copyHtml(html)
    } catch (err) {
      showCopyFeedback(err instanceof Error ? err.message : 'Copy failed')
    }
  }

  function applyAxTreeResult(response: AxTreePushMessage): void {
    tabId = response.tabId
    tabTitle = response.tabTitle
    url = response.url
    roots = response.roots
    nodeCount = response.nodeCount
    focusedNodeId = response.focusedNodeId
    source = response.source
    cdpError = response.cdpError ?? null
    error = null
    live = true
    if (view === 'tree') syncReaderSnapshot()
  }

  async function captureTree(options: { silent?: boolean } = {}) {
    const { silent = false } = options

    if (!silent) {
      loading = true
      error = null
      roots = null
      nodeCount = 0
      focusedNodeId = null
    }

    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'GET_AX_TREE',
      })) as BackgroundResponse | undefined

      if (!response) {
        if (!silent) error = 'No response from the extension background.'
        return
      }

      if (response.type === 'AX_TREE_ERROR') {
        if (!silent) error = response.error
        return
      }

      applyAxTreeResult(response)
    } catch (err) {
      if (!silent) error = err instanceof Error ? err.message : String(err)
    } finally {
      if (!silent) loading = false
    }
  }

  onMount(() => {
    let windowId: number | undefined

    void (async () => {
      const win = await chrome.windows.getCurrent()
      windowId = win.id
      if (windowId == null) return

      await chrome.runtime.sendMessage({ type: 'SIDE_PANEL_OPEN', windowId })
      await captureTree()
    })()

    const onMessage = (message: unknown) => {
      if (!message || typeof message !== 'object') return
      const typed = message as { type?: string }

      if (typed.type === 'AX_TREE_RESULT') {
        applyAxTreeResult(message as AxTreePushMessage)
        return
      }

      if (typed.type === 'AX_TREE_FOCUS') {
        const focus = message as AxTreeFocusMessage
        if (tabId != null && focus.tabId !== tabId) return
        focusedNodeId = focus.nodeId
        if (view === 'tree') readerFocusedNodeId = focus.nodeId
        return
      }

      if (typed.type === 'AX_TREE_ERROR') {
        error = (message as AxTreeErrorMessage).error
        roots = null
        nodeCount = 0
        focusedNodeId = null
        live = true
      }
    }

    chrome.runtime.onMessage.addListener(onMessage)

    return () => {
      if (copyFeedbackTimeout) clearTimeout(copyFeedbackTimeout)
      chrome.runtime.onMessage.removeListener(onMessage)
      if (windowId != null) {
        void chrome.runtime.sendMessage({ type: 'SIDE_PANEL_CLOSE', windowId })
      }
    }
  })
</script>

<main>
  <header class="panel-header">
    <div class="header-row">
      <h1 title="DOM events drive live updates; screen reader view uses the browser AX tree via CDP">
        Visual Screen Reader
      </h1>
      <div class="header-actions">
        {#if live}
          <span class="live-badge" title="Listening for DOM, navigation, and tab changes">Live</span>
        {/if}
        <button type="button" class="refresh-btn" onclick={() => captureTree()} disabled={loading}>
          {loading ? '…' : 'Refresh'}
        </button>
      </div>
    </div>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    {#if cdpError}
      <p class="warn" role="status">
        CDP unavailable — DOM fallback. {cdpError}
      </p>
    {/if}

    {#if roots}
      <div class="tab-meta">
        <span class="tab-title" title={tabTitle}>{tabTitle || 'Active tab'}</span>
        <span class="meta-sep" aria-hidden="true">·</span>
        <span class="stats">{nodeCount} nodes{#if sourceLabel} ({sourceLabel}){/if}</span>
      </div>
      {#if url}
        <p class="url" title={url}>{url}</p>
      {/if}

      <div class="view-controls">
        <div class="tabs">
          <button
            type="button"
            class:active={view === 'tree'}
            onclick={() => {
              view = 'tree'
              copyFeedback = null
              syncReaderSnapshot()
            }}
          >
            Reader
          </button>
          <button
            type="button"
            class:active={view === 'raw'}
            onclick={() => {
              view = 'raw'
              copyFeedback = null
            }}
          >
            JSON
          </button>
        </div>
        {#if view === 'tree'}
          <button type="button" class="copy-btn" onclick={() => void copyScreenReaderHtml()}>
            {copyFeedback ?? 'Copy HTML'}
          </button>
        {:else}
          <button type="button" class="copy-btn" onclick={() => void copyRawJson()}>
            {copyFeedback ?? 'Copy JSON'}
          </button>
        {/if}
      </div>
    {/if}
  </header>

  {#if roots}
    <section class="results">
      <div class="view-panel" class:hidden={view !== 'tree'} aria-hidden={view !== 'tree'}>
        {#if focusedLabel}
          <p class="focus-indicator" aria-live="polite">
            <span class="focus-label">In focus:</span>
            {#if focusedNode?.role}
              <span class="focus-role">{focusedNode.role}</span>
            {/if}
            <span class="focus-name">{focusedLabel}</span>
          </p>
        {/if}
        {#if readerRoots}
          <AxTreeReaderView
            bind:this={readerView}
            roots={readerRoots}
            focusedNodeId={readerFocusedNodeId}
          />
        {/if}
      </div>
      <div class="view-panel" class:hidden={view !== 'raw'} aria-hidden={view !== 'raw'}>
        {#if view === 'raw'}
          <AxTreeJsonView roots={roots} />
        {/if}
      </div>
    </section>
  {/if}
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    max-width: 100%;
  }

  .panel-header {
    flex-shrink: 0;
    background: var(--bg);
    border-bottom: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
    padding-bottom: 0.4rem;
    margin-bottom: 0.5rem;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-height: 1.75rem;
  }

  h1 {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0;
    color: var(--text-h);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-shrink: 0;
  }

  .live-badge {
    font-size: 0.625rem;
    font-weight: 600;
    color: #0a7a2f;
    background: #e6f6ec;
    border: 1px solid #9ed4b0;
    border-radius: 999px;
    padding: 0.1rem 0.4rem;
    line-height: 1.3;
  }

  .refresh-btn {
    padding: 0.15rem 0.5rem;
    font-size: 0.6875rem;
    cursor: pointer;
    border: 1px solid color-mix(in srgb, var(--text) 30%, transparent);
    background: color-mix(in srgb, var(--bg) 88%, var(--text-h));
    border-radius: 4px;
    color: var(--text-h);
  }

  .refresh-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--bg) 75%, var(--text-h));
  }

  button[type='button']:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error {
    color: #b00020;
    font-size: 0.75rem;
    margin: 0.25rem 0 0;
  }

  .warn {
    color: #8a5a00;
    background: #fff8e6;
    border: 1px solid #e6c200;
    border-radius: 3px;
    font-size: 0.6875rem;
    padding: 0.25rem 0.4rem;
    margin: 0.25rem 0 0;
  }

  .tab-meta {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    margin-top: 0.35rem;
    font-size: 0.6875rem;
    line-height: 1.3;
    min-width: 0;
  }

  .tab-title {
    font-weight: 600;
    color: var(--text-h);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1 1 auto;
  }

  .meta-sep {
    color: var(--text);
    flex-shrink: 0;
  }

  .stats {
    color: var(--text);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .url {
    font-size: 0.625rem;
    color: var(--text);
    margin: 0.15rem 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .view-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.35rem;
    margin-top: 0.35rem;
  }

  .results {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin-top: 0;
  }

  .view-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .view-panel.hidden {
    display: none;
  }

  .view-panel :global(.ax-speech-output) {
    flex: 1;
    min-height: 0;
    max-height: none;
  }

  .focus-indicator {
    font-size: 0.75rem;
    margin: 0 0 0.4rem;
    padding: 0.3rem 0.45rem;
    border-radius: 3px;
    background: color-mix(in srgb, #3b82f6 12%, var(--bg));
    border: 1px solid color-mix(in srgb, #3b82f6 35%, transparent);
    color: var(--text-h);
  }

  .focus-label {
    font-weight: 600;
    margin-right: 0.3rem;
  }

  .focus-role {
    font-size: 0.6875rem;
    text-transform: capitalize;
    color: var(--text);
    margin-right: 0.3rem;
  }

  .focus-name {
    font-weight: 500;
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
  }

  .copy-btn {
    padding: 0.15rem 0.45rem;
    font-size: 0.625rem;
    cursor: pointer;
    border: 1px solid color-mix(in srgb, var(--text) 30%, transparent);
    background: color-mix(in srgb, var(--bg) 88%, var(--text-h));
    border-radius: 3px;
    color: var(--text-h);
    flex-shrink: 0;
  }

  .copy-btn:hover {
    background: color-mix(in srgb, var(--bg) 75%, var(--text-h));
  }

  .tabs button {
    padding: 0.15rem 0.45rem;
    font-size: 0.6875rem;
    cursor: pointer;
    border: 1px solid color-mix(in srgb, var(--text) 25%, transparent);
    background: color-mix(in srgb, var(--bg) 92%, var(--text-h));
    border-radius: 3px;
    color: var(--text-h);
  }

  .tabs button.active {
    background: color-mix(in srgb, var(--text-h) 88%, var(--bg));
    color: var(--bg);
    border-color: transparent;
  }

</style>
