<script lang="ts">
  import type { ReaderLineItem } from './flatten-ax-tree-reader'

  let {
    line,
    focused = false,
  }: {
    line: ReaderLineItem
    focused?: boolean
  } = $props()
</script>

{#if line.kind === 'heading'}
  <svelte:element
    this={`h${line.headingLevel ?? 2}`}
    class="sr-heading"
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left="{line.depth * 0.75}rem"
  >
    {#if line.label}{line.label}{/if}
    {#if line.notes}<span class="sr-note"> ({line.notes})</span>{/if}
  </svelte:element>
{:else if line.kind === 'image'}
  <p
    class="sr-image"
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left="{line.depth * 0.75}rem"
  >
    {#if line.label}
      <em>[Image: {line.label}]</em>
    {:else}
      <em>[Image]</em>
    {/if}
    {#if line.notes}<span class="sr-note"> ({line.notes})</span>{/if}
  </p>
{:else if line.kind === 'link'}
  <div
    class="sr-link"
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left="{line.depth * 0.75}rem"
  >
    {#if line.label}<span class="sr-link-label">{line.label}</span>{/if}
    {#if line.notes}<span class="sr-note"> ({line.notes})</span>{/if}
  </div>
{:else if line.kind === 'button'}
  <span
    class="sr-button"
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left="{line.depth * 0.75}rem"
  >
    <button type="button" disabled>{line.label ?? 'Button'}</button>
    {#if line.notes}<span class="sr-note"> ({line.notes})</span>{/if}
  </span>
{:else if line.kind === 'control'}
  <p
    class="sr-control"
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left="{line.depth * 0.75}rem"
  >
    <span class="sr-role">{line.role}</span>
    {#if line.label}{line.label}{/if}
    {#if line.notes}<span class="sr-note"> ({line.notes})</span>{/if}
  </p>
{:else if line.kind === 'listitem'}
  <div
    class="sr-listitem"
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left="calc({line.depth * 0.75}rem + 1.25rem)"
  >
    <span class="sr-list-bullet" aria-hidden="true">•</span>
    {#if line.label}{line.label}{/if}
    {#if line.notes}<span class="sr-note"> ({line.notes})</span>{/if}
  </div>
{:else if line.kind === 'landmark'}
  <section
    class="sr-landmark"
    data-role={line.landmarkRole}
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:margin-left="{line.depth * 0.75}rem"
  >
    <span class="sr-landmark-label">{line.landmarkRole}</span>
    {#if line.label}
      <p class="sr-landmark-name">{line.label}</p>
    {/if}
    {#if line.notes}<span class="sr-note"> ({line.notes})</span>{/if}
  </section>
{:else if line.kind === 'generic'}
  {@const genericTag = line.genericTag ?? 'div'}
  <svelte:element
    this={genericTag}
    class:sr-div={genericTag === 'div'}
    class:sr-span={genericTag === 'span'}
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left="{line.depth * 0.75}rem"
  >
    <svelte:element this={genericTag === 'span' ? 'span' : 'p'} class="sr-text">
      {line.label}
      {#if line.notes}<span class="sr-note"> ({line.notes})</span>{/if}
    </svelte:element>
  </svelte:element>
{:else}
  <p
    class="sr-text"
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left="{line.depth * 0.75}rem"
  >
    {#if line.label}{line.label}{/if}
    {#if line.notes}<span class="sr-note"> ({line.notes})</span>{/if}
  </p>
{/if}

<style>
  .sr-listitem {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    margin: 0.15rem 0;
  }

  .sr-list-bullet {
    flex-shrink: 0;
    color: var(--text);
  }
</style>
