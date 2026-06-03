<script lang="ts">
  import type { AxTreeNode } from '../shared/ax-tree'
  import {
    formatNotes,
    getRoleNotes,
    getSpeakableLabel,
    getStateNotes,
    headingLevel,
    isLandmarkRole,
    isPassthroughRole,
    shouldDedupChildren,
  } from './ax-tree-speech'
  import AxTreeNodeView from './AxTreeNodeView.svelte'

  let { node }: { node: AxTreeNode } = $props()

  const label = $derived(getSpeakableLabel(node))
  const notesText = $derived(formatNotes(getStateNotes(node), getRoleNotes(node)))
  const dedup = $derived(shouldDedupChildren(node))
  const role = $derived(node.role ?? 'generic')
  const hLevel = $derived(headingLevel(node.level))
</script>

{#snippet notes()}
  {#if notesText}
    <span class="sr-note"> ({notesText})</span>
  {/if}
{/snippet}

{#snippet childNodes()}
  {#each node.children as child (child.nodeId)}
    <AxTreeNodeView node={child} />
  {/each}
{/snippet}

{#if node.ignored}
  {@render childNodes()}
{:else if isPassthroughRole(role)}
  {#if label}
    <p class="sr-text">
      {label}{@render notes()}
    </p>
  {/if}
  {@render childNodes()}
{:else if role === 'heading'}
  <svelte:element this={`h${hLevel}`} class="sr-heading">
    {#if dedup}
      {label}{@render notes()}
    {:else}
      {#if label}{label}{/if}
      {@render childNodes()}
      {@render notes()}
    {/if}
  </svelte:element>
{:else if role === 'image'}
  <p class="sr-image">
    {#if label}
      <em>[Image: {label}]</em>
    {:else}
      <em>[Image]</em>
    {/if}
    {@render notes()}
  </p>
{:else if role === 'link'}
  <span class="sr-link">
    {#if dedup}
      {label}{@render notes()}
    {:else}
      {#if label}{label}{/if}
      {@render childNodes()}
      {@render notes()}
    {/if}
  </span>
{:else if role === 'button'}
  <span class="sr-button">
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
  <p class="sr-control">
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
  <p class="sr-text">
    {#if dedup}
      {label}{@render notes()}
    {:else}
      {#if label}{label}{/if}
      {@render childNodes()}
      {@render notes()}
    {/if}
  </p>
{:else if role === 'list'}
  <ul class="sr-list">
    {@render childNodes()}
  </ul>
{:else if role === 'listitem'}
  <li class="sr-listitem">
    {#if label}{label}{/if}
    {@render childNodes()}
    {@render notes()}
  </li>
{:else if isLandmarkRole(role)}
  <section class="sr-landmark" data-role={role}>
    <span class="sr-landmark-label">{role}</span>
    {#if label && !dedup}
      <p class="sr-landmark-name">{label}</p>
    {/if}
    {@render childNodes()}
    {@render notes()}
  </section>
{:else}
  {#if label}
    <p class="sr-text">
      {label}{@render notes()}
    </p>
  {/if}
  {#if !dedup}
    {@render childNodes()}
  {/if}
{/if}
