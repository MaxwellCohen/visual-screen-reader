<script lang="ts">
  import JsonViewerNode from './JsonViewerNode.svelte'
  import {
    collapseAllJsonNodes,
    createJsonCollapseState,
    expandAllJsonNodes,
    type JsonCollapseState,
  } from './json-viewer'

  let {
    value,
    expandDepth = 2,
  }: {
    value: unknown
    expandDepth?: number
  } = $props()

  let collapseState = $state<JsonCollapseState>(createJsonCollapseState(2))

  $effect(() => {
    collapseState = createJsonCollapseState(expandDepth)
  })

  function expandAll(): void {
    collapseState = expandAllJsonNodes(collapseState)
  }

  function collapseAll(): void {
    collapseState = collapseAllJsonNodes(collapseState)
  }
</script>

<div class="json-viewer">
  <div class="json-toolbar">
    <button type="button" class="json-toolbar-btn" onclick={expandAll}>Expand all</button>
    <button type="button" class="json-toolbar-btn" onclick={collapseAll}>Collapse all</button>
  </div>
  <div class="json-root">
    {#if Array.isArray(value)}
      <span class="json-bracket">[</span>
      <div class="json-children json-children--root">
        {#each value as item, index (index)}
          <div class="json-child">
            <JsonViewerNode
              value={item}
              path={String(index)}
              depth={1}
              bind:collapseState
            />
            {#if index < value.length - 1}<span class="json-comma">,</span>{/if}
          </div>
        {/each}
      </div>
      <span class="json-bracket">]</span>
    {:else}
      <JsonViewerNode value={value} bind:collapseState />
    {/if}
  </div>
</div>

<style>
  .json-viewer {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.7rem;
    line-height: 1.45;
    color: var(--text-h);
    background: color-mix(in srgb, var(--bg) 88%, var(--text-h));
    border: 1px solid color-mix(in srgb, var(--text) 30%, transparent);
    border-radius: 4px;
    overflow: hidden;
  }

  .json-toolbar {
    display: flex;
    gap: 0.35rem;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
    background: color-mix(in srgb, var(--bg) 94%, var(--text-h));
    flex-shrink: 0;
  }

  .json-toolbar-btn {
    padding: 0.1rem 0.4rem;
    font-size: 0.625rem;
    font-family: inherit;
    cursor: pointer;
    border: 1px solid color-mix(in srgb, var(--text) 25%, transparent);
    background: color-mix(in srgb, var(--bg) 92%, var(--text-h));
    border-radius: 3px;
    color: var(--text-h);
  }

  .json-toolbar-btn:hover {
    background: color-mix(in srgb, var(--bg) 75%, var(--text-h));
  }

  .json-root {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0.75rem;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .json-bracket {
    color: var(--text-h);
  }

  .json-comma {
    color: var(--text);
  }

  .json-children--root {
    margin-left: 1.1rem;
  }

  .json-child {
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
