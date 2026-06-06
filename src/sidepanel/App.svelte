<script lang="ts">
  import { onMount } from 'svelte'
  import AxTreeReaderView from '../lib/AxTreeReaderView.svelte'
  import type { AxTreeNode } from '../shared/ax-tree'
  import type { AxTreeErrorMessage, AxTreePushMessage, BackgroundResponse } from '../shared/messages'

  let loading = $state(false)
  let live = $state(false)
  let error = $state<string | null>(null)
  let tabTitle = $state('')
  let url = $state('')
  let roots = $state<AxTreeNode[] | null>(null)
  let nodeCount = $state(0)
  let view: 'tree' | 'raw' = $state('tree')

  function applyAxTreeResult(response: AxTreePushMessage): void {
    tabTitle = response.tabTitle
    url = response.url
    roots = response.roots
    nodeCount = response.nodeCount
    error = null
    live = true
  }

  async function captureTree(options: { silent?: boolean } = {}) {
    const { silent = false } = options

    if (!silent) {
      loading = true
      error = null
      roots = null
      nodeCount = 0
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

      if (typed.type === 'AX_TREE_ERROR') {
        error = (message as AxTreeErrorMessage).error
        roots = null
        nodeCount = 0
        live = true
      }
    }

    chrome.runtime.onMessage.addListener(onMessage)

    return () => {
      chrome.runtime.onMessage.removeListener(onMessage)
      if (windowId != null) {
        void chrome.runtime.sendMessage({ type: 'SIDE_PANEL_CLOSE', windowId })
      }
    }
  })
</script>

<main>
  <h1>Visual Screen Reader</h1>
  <p class="hint">
    Builds an accessibility-style tree from the page DOM (roles, names, ARIA). Updates
    automatically when the DOM, page, or active tab changes.
  </p>

  <div class="actions">
    <button type="button" onclick={() => captureTree()} disabled={loading}>
      {loading ? 'Capturing…' : 'Refresh tree'}
    </button>
    {#if live}
      <span class="live-badge" title="Listening for DOM, navigation, and tab changes">Live</span>
    {/if}
  </div>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  {#if roots}
    <section class="results">
      <h2>{tabTitle || 'Active tab'}</h2>
      <p class="url">{url}</p>
      <p class="stats">{nodeCount} nodes (DOM-derived)</p>

      <div class="tabs">
        <button
          type="button"
          class:active={view === 'tree'}
          onclick={() => (view = 'tree')}
        >
          Screen reader view
        </button>
        <button
          type="button"
          class:active={view === 'raw'}
          onclick={() => (view = 'raw')}
        >
          Raw JSON
        </button>
      </div>

      {#if view === 'tree'}
        <AxTreeReaderView {roots} />
      {:else}
        <pre class="tree-output">{JSON.stringify(roots, null, 2)}</pre>
      {/if}
    </section>
  {/if}
</main>

<style>
  main {
    padding: 1rem;
    font-family: system-ui, sans-serif;
    max-width: 100%;
  }

  h1 {
    font-size: 1.25rem;
    margin: 0 0 0.5rem;
  }

  .hint {
    color: #555;
    font-size: 0.875rem;
    margin: 0 0 1rem;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .live-badge {
    font-size: 0.75rem;
    font-weight: 600;
    color: #0a7a2f;
    background: #e6f6ec;
    border: 1px solid #9ed4b0;
    border-radius: 999px;
    padding: 0.15rem 0.5rem;
  }

  button[type='button']:not(.tabs button) {
    padding: 0.5rem 1rem;
    cursor: pointer;
  }

  button[type='button']:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error {
    color: #b00020;
    margin-top: 1rem;
  }

  .results {
    margin-top: 1.5rem;
  }

  .results h2 {
    font-size: 1rem;
    margin: 0 0 0.25rem;
    color: var(--text-h);
  }

  .url {
    font-size: 0.75rem;
    color: #666;
    word-break: break-all;
    margin: 0 0 0.5rem;
  }

  .stats {
    font-size: 0.875rem;
    margin: 0 0 0.75rem;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .tabs button {
    padding: 0.25rem 0.75rem;
    font-size: 0.875rem;
    cursor: pointer;
    border: 1px solid #ccc;
    background: #f5f5f5;
    border-radius: 4px;
  }

  .tabs button.active {
    background: #333;
    color: #fff;
    border-color: #333;
  }

  .tree-output {
    font-size: 0.7rem;
    line-height: 1.35;
    color: var(--text-h);
    background: color-mix(in srgb, var(--bg) 88%, var(--text-h));
    border: 1px solid color-mix(in srgb, var(--text) 30%, transparent);
    border-radius: 4px;
    padding: 0.75rem;
    overflow: auto;
    max-height: 70vh;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
