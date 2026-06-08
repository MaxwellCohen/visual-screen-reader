<script lang="ts">
  import type { AxTreeNode } from '../shared/ax-tree'
  import AxTreeNodeView from './AxTreeNodeView.svelte'

  let {
    roots,
    focusedNodeId = null,
  }: {
    roots: AxTreeNode[]
    focusedNodeId?: string | null
  } = $props()

  let container: HTMLDivElement | undefined = $state()

  export function getHtml(): string {
    return container?.innerHTML ?? ''
  }

  $effect(() => {
    const nodeId = focusedNodeId
    if (!nodeId || !container) return

    const el = container.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(nodeId)}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
</script>

<div class="ax-speech-output" bind:this={container}>
  {#each roots as root (root.nodeId)}
    <AxTreeNodeView node={root} {focusedNodeId} />
  {/each}
</div>

<style>
  .ax-speech-output {
    font-family: system-ui, sans-serif;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--text-h);
    background: color-mix(in srgb, var(--bg) 88%, var(--text-h));
    border: 1px solid color-mix(in srgb, var(--text) 30%, transparent);
    border-radius: 4px;
    padding: 0.75rem;
    overflow: auto;
    max-height: 70vh;
  }

  .ax-speech-output :global(.sr-note) {
    font-size: 0.75rem;
    color: var(--text);
    font-style: normal;
  }

  .ax-speech-output :global(.sr-heading) {
    margin: 0.75rem 0 0.35rem;
    font-weight: 600;
    color: var(--text-h);
  }

  .ax-speech-output :global(.sr-heading:first-child) {
    margin-top: 0;
  }

  .ax-speech-output :global(.sr-image) {
    margin: 0.35rem 0;
    color: var(--text-h);
  }

  .ax-speech-output :global(.sr-link) {
    color: var(--accent);
    text-decoration: underline;
    display: inline;
  }

  .ax-speech-output :global(.sr-button) {
    display: inline-block;
    margin: 0.25rem 0;
  }

  .ax-speech-output :global(.sr-button button) {
    font: inherit;
    color: var(--text-h);
    background: color-mix(in srgb, var(--bg) 70%, var(--text-h));
    border: 1px solid color-mix(in srgb, var(--text) 35%, transparent);
    cursor: default;
  }

  .ax-speech-output :global(.sr-control) {
    margin: 0.25rem 0;
  }

  .ax-speech-output :global(.sr-role) {
    text-transform: capitalize;
    font-size: 0.75rem;
    color: var(--text);
    margin-right: 0.35rem;
  }

  .ax-speech-output :global(.sr-div) {
    display: block;
  }

  .ax-speech-output :global(.sr-list) {
    margin: 0.35rem 0;
    padding-left: 1.25rem;
  }

  .ax-speech-output :global(.sr-listitem) {
    margin: 0.15rem 0;
  }

  .ax-speech-output :global(.sr-landmark) {
    margin: 0.75rem 0;
    padding-left: 0.5rem;
    border-left: 3px solid color-mix(in srgb, var(--text) 40%, transparent);
  }

  .ax-speech-output :global(.sr-landmark-label) {
    display: block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text);
    margin-bottom: 0.35rem;
  }

  .ax-speech-output :global(.sr-landmark-name) {
    margin: 0 0 0.35rem;
  }

  .ax-speech-output :global(.sr-text),
  .ax-speech-output :global(.sr-listitem),
  .ax-speech-output :global(.sr-control),
  .ax-speech-output :global(.sr-landmark-name) {
    color: var(--text-h);
  }

  .ax-speech-output :global(p) {
    margin: 0.25rem 0;
    color: var(--text-h);
  }

  .ax-speech-output :global(.sr-focused) {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
    border-radius: 3px;
    background: color-mix(in srgb, #2563eb 10%, transparent);
  }
</style>
