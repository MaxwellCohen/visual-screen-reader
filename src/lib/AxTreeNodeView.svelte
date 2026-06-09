<script lang="ts">
  import type { AxTreeNode } from '../shared/ax-tree'
  import { getAxTreeFocusId } from '../shared/ax-tree'
  import {
    formatNotes,
    getRoleNotes,
    getSpeakableLabel,
    getStateNotes,
    headingLevel,
    genericWrapperTag,
    isGenericContainer,
    isLandmarkRole,
    isPassthroughRole,
    isRedundantTextNode,
    shouldDedupChildren,
  } from './ax-tree-speech'
  import AxTreeNodeView from './AxTreeNodeView.svelte'

  let {
    node,
    focusedNodeId = null,
    parentLabel = undefined,
  }: {
    node: AxTreeNode
    focusedNodeId?: string | null
    parentLabel?: string
  } = $props()

  const label = $derived(getSpeakableLabel(node))
  const redundantText = $derived(isRedundantTextNode(node, parentLabel))
  const notesText = $derived(formatNotes(getStateNotes(node), getRoleNotes(node)))
  const dedup = $derived(shouldDedupChildren(node))
  const role = $derived(node.role ?? 'generic')
  const hLevel = $derived(headingLevel(node.level))
  const focusId = $derived(getAxTreeFocusId(node))
  const focused = $derived(focusedNodeId === focusId)
</script>

{#snippet notes()}
  {#if notesText}
    <span class="sr-note"> ({notesText})</span>
  {/if}
{/snippet}

{#snippet childNodes()}
  {#each node.children as child (child.nodeId)}
    <AxTreeNodeView node={child} {focusedNodeId} parentLabel={label} />
  {/each}
{/snippet}

{#if redundantText}
  <span data-node-id={focusId} class:sr-focused={focused} style="display: contents">
    {@render childNodes()}
  </span>
{:else if node.ignored}
  <span data-node-id={focusId} class:sr-focused={focused} style="display: contents">
    {@render childNodes()}
  </span>
{:else if isGenericContainer(node)}
  {@const genericTag = genericWrapperTag(node)}
  <svelte:element
    this={genericTag}
    class:sr-div={genericTag === 'div'}
    class:sr-span={genericTag === 'span'}
    data-node-id={focusId}
    class:sr-focused={focused}
  >
    {#if label}
      <svelte:element this={genericTag === 'span' ? 'span' : 'p'} class="sr-text">
        {label}{@render notes()}
      </svelte:element>
    {/if}
    {@render childNodes()}
  </svelte:element>
{:else if role === 'generic' && label}
  {@const genericTag = genericWrapperTag(node)}
  <svelte:element
    this={genericTag}
    class:sr-div={genericTag === 'div'}
    class:sr-span={genericTag === 'span'}
    data-node-id={focusId}
    class:sr-focused={focused}
  >
    <svelte:element this={genericTag === 'span' ? 'span' : 'p'} class="sr-text">
      {label}{@render notes()}
    </svelte:element>
  </svelte:element>
{:else if isPassthroughRole(role)}
  {#if label}
    <p class="sr-text" data-node-id={focusId} class:sr-focused={focused}>
      {label}{@render notes()}
    </p>
    {@render childNodes()}
  {:else}
    <span data-node-id={focusId} class:sr-focused={focused} style="display: contents">
      {@render childNodes()}
    </span>
  {/if}
{:else if role === 'heading'}
  <svelte:element
    this={`h${hLevel}`}
    class="sr-heading"
    data-node-id={focusId}
    class:sr-focused={focused}
  >
    {#if dedup}
      {label}{@render notes()}
    {:else}
      {#if label}{label}{/if}
      {@render childNodes()}
      {@render notes()}
    {/if}
  </svelte:element>
{:else if role === 'image'}
  <p class="sr-image" data-node-id={focusId} class:sr-focused={focused}>
    {#if label}
      <em>[Image: {label}]</em>
    {:else}
      <em>[Image]</em>
    {/if}
    {@render notes()}
  </p>
{:else if role === 'link'}
  <div class="sr-link" data-node-id={focusId} class:sr-focused={focused}>
    {#if dedup}
      <span class="sr-link-label">{label}</span>{@render notes()}
    {:else}
      {#if label}<span class="sr-link-label">{label}</span>{/if}
      {@render childNodes()}
      {@render notes()}
    {/if}
  </div>
{:else if role === 'button'}
  <span class="sr-button" data-node-id={focusId} class:sr-focused={focused}>
    {#if dedup}
      <button type="button" disabled>{label}</button>{@render notes()}
    {:else}
      <button type="button" disabled>
        {#if label}{label}{:else}Button{/if}
      </button>
      {@render childNodes()}
      {@render notes()}
    {/if}
  </span>
{:else if role === 'checkbox' || role === 'radio'}
  <p class="sr-control" data-node-id={focusId} class:sr-focused={focused}>
    <span class="sr-role">{role}</span>
    {#if label}
      {label}
    {/if}
    {@render notes()}
    {#if !dedup}
      {@render childNodes()}
    {/if}
  </p>
{:else if role === 'paragraph'}
  <p class="sr-text" data-node-id={focusId} class:sr-focused={focused}>
    {#if dedup}
      {label}{@render notes()}
    {:else}
      {#if label}{label}{/if}
      {@render childNodes()}
      {@render notes()}
    {/if}
  </p>
{:else if role === 'list'}
  <ul class="sr-list" data-node-id={focusId} class:sr-focused={focused}>
    {@render childNodes()}
  </ul>
{:else if role === 'listitem'}
  <li class="sr-listitem" data-node-id={focusId} class:sr-focused={focused}>
    {#if label}{label}{/if}
    {@render childNodes()}
    {@render notes()}
  </li>
{:else if isLandmarkRole(role)}
  <section
    class="sr-landmark"
    data-role={role}
    data-node-id={focusId}
    class:sr-focused={focused}
  >
    <span class="sr-landmark-label">{role}</span>
    {#if label && !dedup}
      <p class="sr-landmark-name">{label}</p>
    {/if}
    {@render childNodes()}
    {@render notes()}
  </section>
{:else}
  {#if label}
    <p class="sr-text" data-node-id={focusId} class:sr-focused={focused}>
      {label}{@render notes()}
    </p>
  {/if}
  {#if !dedup}
    {#if !label}
      <span data-node-id={focusId} class:sr-focused={focused} style="display: contents">
        {@render childNodes()}
      </span>
    {:else}
      {@render childNodes()}
    {/if}
  {/if}
{/if}
