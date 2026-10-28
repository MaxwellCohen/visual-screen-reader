<script lang="ts">
  import JsonViewerNode from './JsonViewerNode.svelte'
  import {
    childPath,
    formatPrimitive,
    getCollectionPreview,
    getJsonType,
    getObjectPreview,
    isJsonNodeExpanded,
    JSON_ENTRY_PAGE_SIZE,
    toggleJsonNode,
    type JsonCollapseState,
  } from './json-viewer'

  let {
    value,
    path = '',
    depth = 0,
    collapseState = $bindable(),
    propertyKey,
  }: {
    value: unknown
    path?: string
    depth?: number
    collapseState: JsonCollapseState
    propertyKey?: string | number
  } = $props()

  const jsonType = $derived(getJsonType(value))
  const expanded = $derived(isJsonNodeExpanded(collapseState, path, depth))
  const isCollection = $derived(jsonType === 'array' || jsonType === 'object')

  const entries = $derived.by(() => {
    if (jsonType === 'array') return (value as unknown[]).map((item, index) => [index, item] as const)
    if (jsonType === 'object') return Object.entries(value as Record<string, unknown>)
    return []
  })

  let visibleEntryCount = $state(JSON_ENTRY_PAGE_SIZE)
  const visibleEntries = $derived(entries.slice(0, visibleEntryCount))
  const hiddenEntryCount = $derived(entries.length - visibleEntries.length)

  const preview = $derived.by(() => {
    if (jsonType === 'array') return getCollectionPreview(value as unknown[])
    if (jsonType === 'object') return getObjectPreview(value as Record<string, unknown>)
    return ''
  })

  const openBracket = $derived(jsonType === 'array' ? '[' : '{')
  const closeBracket = $derived(jsonType === 'array' ? ']' : '}')

  function toggle(): void {
    collapseState = toggleJsonNode(collapseState, path, depth)
  }
</script>

{#if propertyKey !== undefined}
  <span class="json-key">"{propertyKey}"</span><span class="json-colon">: </span>
{/if}

{#if !isCollection}
  <span class="json-value json-value--{jsonType}">{formatPrimitive(value as string | number | boolean | null)}</span>
{:else}
  <span class="json-row">
    <button
      type="button"
      class="json-toggle"
      aria-expanded={expanded}
      aria-label={expanded ? 'Collapse' : 'Expand'}
      onclick={toggle}
    >
      {expanded ? '▾' : '▸'}
    </button>
    <span class="json-bracket">{openBracket}</span>
    {#if !expanded}
      <button type="button" class="json-preview" onclick={toggle}>{preview}</button>
      <span class="json-bracket">{closeBracket}</span>
    {:else if entries.length === 0}
      <span class="json-bracket">{closeBracket}</span>
    {:else}
      <div class="json-children">
        {#each visibleEntries as [key, childValue], index (childPath(path, key))}
          <div class="json-child">
            <JsonViewerNode
              value={childValue}
              path={childPath(path, key)}
              depth={depth + 1}
              bind:collapseState
              propertyKey={jsonType === 'object' ? key : undefined}
            />
            {#if index < entries.length - 1}<span class="json-comma">,</span>{/if}
          </div>
        {/each}
        {#if hiddenEntryCount > 0}
          <button
            type="button"
            class="json-preview json-more"
            onclick={() => (visibleEntryCount += JSON_ENTRY_PAGE_SIZE)}
          >
            Show {Math.min(hiddenEntryCount, JSON_ENTRY_PAGE_SIZE)} more ({hiddenEntryCount} hidden)
          </button>
        {/if}
      </div>
      <span class="json-bracket json-bracket--close">{closeBracket}</span>
    {/if}
  </span>
{/if}

<style>
  .json-row {
    display: inline;
  }

  .json-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    margin: 0 0.1rem 0 0;
    padding: 0;
    border: none;
    border-radius: 2px;
    background: transparent;
    color: var(--text);
    font-size: 0.65rem;
    line-height: 1;
    cursor: pointer;
    vertical-align: baseline;
  }

  .json-toggle:hover {
    background: color-mix(in srgb, var(--text) 12%, transparent);
    color: var(--text-h);
  }

  .json-preview {
    margin: 0 0.2rem;
    padding: 0 0.25rem;
    border: none;
    border-radius: 2px;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  .json-preview:hover {
    background: color-mix(in srgb, var(--text) 14%, transparent);
    color: var(--text-h);
  }

  .json-more {
    margin-left: 0;
  }

  .json-key {
    color: #881391;
  }

  .json-colon,
  .json-comma {
    color: var(--text);
  }

  .json-bracket {
    color: var(--text-h);
  }

  .json-bracket--close {
    display: block;
  }

  .json-value--string {
    color: #0b6f3f;
  }

  .json-value--number {
    color: #1c00cf;
  }

  .json-value--boolean {
    color: #0d47a1;
  }

  .json-value--null {
    color: #808080;
    font-style: italic;
  }

  .json-children {
    margin-left: 1.1rem;
  }

  .json-child {
    white-space: pre-wrap;
    word-break: break-word;
  }

  @media (prefers-color-scheme: dark) {
    .json-key {
      color: #f48fb1;
    }

    .json-value--string {
      color: #7ee787;
    }

    .json-value--number {
      color: #79c0ff;
    }

    .json-value--boolean {
      color: #79c0ff;
    }

    .json-value--null {
      color: #8b949e;
    }
  }
</style>
