<script lang="ts">
  import type { ReaderLineItem } from './flatten-ax-tree-reader'

  let {
    line,
    focused = false,
  }: {
    line: ReaderLineItem
    focused?: boolean
  } = $props()

  // The "link" token is redundant with the link styling/chip, so drop it.
  const tokens = $derived((line.noteTokens ?? []).filter((token) => token !== 'link'))

  function isUrl(token: string): boolean {
    return /^(https?:\/\/|\/)/i.test(token)
  }

  function isDescription(token: string): boolean {
    return token.startsWith('description:')
  }

  function pillClass(token: string): string {
    if (isUrl(token)) return 'sr-pill sr-pill-url'
    if (isDescription(token)) return 'sr-pill sr-pill-desc'
    return 'sr-pill sr-pill-state'
  }

  function pillText(token: string): string {
    return isDescription(token) ? token.replace(/^description:\s*/, '') : token
  }

  const pad = $derived(`calc(0.4rem + ${line.depth * 0.75}rem)`)
</script>

{#snippet pills()}
  {#if tokens.length > 0}
    <span class="sr-pills">
      {#each tokens as token (token)}
        <span class={pillClass(token)} title={token}>{pillText(token)}</span>
      {/each}
    </span>
  {/if}
{/snippet}

{#if line.kind === 'heading'}
  <svelte:element
    this={`h${line.headingLevel ?? 2}`}
    class="sr-line sr-heading"
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left={pad}
  >
    <span class="sr-tag sr-tag-heading" aria-hidden="true">H{line.headingLevel ?? 2}</span>
    {#if line.label}<span class="sr-heading-text">{line.label}</span>{/if}
    {@render pills()}
  </svelte:element>
{:else if line.kind === 'image'}
  <p
    class="sr-line sr-image"
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left={pad}
  >
    <span class="sr-tag sr-tag-image" aria-hidden="true">IMG</span>
    {#if line.label}
      <span class="sr-image-alt">{line.label}</span>
    {:else}
      <span class="sr-image-empty">unlabeled image</span>
    {/if}
    {@render pills()}
  </p>
{:else if line.kind === 'link'}
  <div
    class="sr-line sr-link"
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left={pad}
  >
    <span class="sr-link-icon" aria-hidden="true">↗</span>
    {#if line.label}<span class="sr-link-label">{line.label}</span>{/if}
    {@render pills()}
  </div>
{:else if line.kind === 'button'}
  <span
    class="sr-line sr-button"
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left={pad}
  >
    <button type="button" disabled>{line.label ?? 'Button'}</button>
    {@render pills()}
  </span>
{:else if line.kind === 'control'}
  <p
    class="sr-line sr-control"
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left={pad}
  >
    <span class="sr-tag sr-tag-control">{line.role}</span>
    {#if line.label}<span class="sr-control-label">{line.label}</span>{/if}
    {@render pills()}
  </p>
{:else if line.kind === 'listitem'}
  <div
    class="sr-line sr-listitem"
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left="calc({pad} + 1.25rem)"
  >
    <span class="sr-list-bullet" aria-hidden="true">•</span>
    {#if line.label}<span>{line.label}</span>{/if}
    {@render pills()}
  </div>
{:else if line.kind === 'landmark'}
  <section
    class="sr-line sr-landmark"
    data-role={line.landmarkRole}
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:margin-left="{line.depth * 0.75}rem"
  >
    <span class="sr-landmark-label">{line.landmarkRole}</span>
    {#if line.label}
      <p class="sr-landmark-name">{line.label}</p>
    {/if}
    {@render pills()}
  </section>
{:else if line.kind === 'generic'}
  {@const genericTag = line.genericTag ?? 'div'}
  <svelte:element
    this={genericTag}
    class="sr-line"
    class:sr-div={genericTag === 'div'}
    class:sr-span={genericTag === 'span'}
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left={pad}
  >
    <svelte:element this={genericTag === 'span' ? 'span' : 'p'} class="sr-text">
      {line.label}
    </svelte:element>
    {@render pills()}
  </svelte:element>
{:else}
  <p
    class="sr-line sr-text"
    data-node-id={line.focusId}
    class:sr-focused={focused}
    style:padding-left={pad}
  >
    {#if line.label}<span>{line.label}</span>{/if}
    {@render pills()}
  </p>
{/if}

<style>
  .sr-listitem {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
  }

  .sr-list-bullet {
    flex-shrink: 0;
    color: var(--accent);
  }
</style>
