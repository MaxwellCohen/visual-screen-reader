<script lang="ts">
  import type { AxTreeNode } from '../shared/ax-tree'
  import AxTreeReaderLine from './AxTreeReaderLine.svelte'
  import {
    findVisibleLineRange,
    flattenAxTreeForReader,
    readerLinesToHtml,
    resolveFocusedReaderLineIndex,
    VIRTUALIZE_LINE_THRESHOLD,
  } from './flatten-ax-tree-reader'

  let {
    roots,
    focusedNodeId = null,
  }: {
    roots: AxTreeNode[]
    focusedNodeId?: string | null
  } = $props()

  let container: HTMLDivElement | undefined = $state()
  let scrollTop = $state(0)
  let viewportHeight = $state(0)

  const flattened = $derived(flattenAxTreeForReader(roots))
  const useVirtual = $derived(flattened.lines.length > VIRTUALIZE_LINE_THRESHOLD)

  const visibleRange = $derived.by(() => {
    if (!useVirtual) return { start: 0, end: flattened.lines.length }
    return findVisibleLineRange(flattened.lineOffsets, scrollTop, viewportHeight)
  })

  const visibleLines = $derived(
    flattened.lines.slice(visibleRange.start, visibleRange.end),
  )

  const focusedLineIndex = $derived(resolveFocusedReaderLineIndex(flattened, focusedNodeId))

  export function getHtml(): string {
    return readerLinesToHtml(flattened.lines)
  }

  function onScroll(): void {
    if (!container) return
    scrollTop = container.scrollTop
  }

  function observeViewport(node: HTMLDivElement): { destroy: () => void } {
    const update = () => {
      viewportHeight = node.clientHeight
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return {
      destroy() {
        observer.disconnect()
      },
    }
  }

  $effect(() => {
    const lineIndex = focusedLineIndex
    if (lineIndex == null || !container) return

    if (useVirtual) {

      const top = flattened.lineOffsets[lineIndex]!
      const bottom = flattened.lineOffsets[lineIndex + 1]!
      const viewTop = container.scrollTop
      const viewBottom = viewTop + viewportHeight

      if (top < viewTop) {
        container.scrollTop = top
      } else if (bottom > viewBottom) {
        container.scrollTop = bottom - viewportHeight
      }
      return
    }

    const focusId = focusedNodeId
    if (!focusId) return
    const el = container.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(focusId)}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  })
</script>

<div
  class="ax-speech-output"
  bind:this={container}
  onscroll={onScroll}
  use:observeViewport
>
  <div class:virtual-track={useVirtual} style:height={useVirtual ? `${flattened.totalHeight}px` : undefined}>
    <div
      class:virtual-window={useVirtual}
      style:transform={useVirtual ? `translateY(${flattened.lineOffsets[visibleRange.start]}px)` : undefined}
    >
      {#each visibleLines as line, index (`${visibleRange.start + index}`)}
        <AxTreeReaderLine
          {line}
          focused={focusedLineIndex != null && focusedLineIndex === visibleRange.start + index}
        />
      {/each}
    </div>
  </div>
</div>

<style>
  .ax-speech-output {
    font-family: system-ui, sans-serif;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--text-h);
    background: color-mix(in srgb, var(--bg) 94%, var(--text-h));
    border: 1px solid color-mix(in srgb, var(--text) 22%, transparent);
    border-radius: 8px;
    padding: 0.4rem;
    overflow: auto;
    max-height: 70vh;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--text) 40%, transparent) transparent;
  }

  .virtual-track {
    position: relative;
    width: 100%;
  }

  .virtual-window {
    will-change: transform;
  }

  /* Shared row treatment ---------------------------------------------------- */
  .ax-speech-output :global(.sr-line) {
    position: relative;
    margin: 0;
    padding-top: 0.18rem;
    padding-bottom: 0.18rem;
    padding-right: 0.4rem;
    border-radius: 6px;
    transition: background-color 0.1s ease;
  }

  .ax-speech-output :global(.sr-line.sr-div:hover),
  .ax-speech-output :global(.sr-line.sr-text:hover),
  .ax-speech-output :global(.sr-line.sr-heading:hover),
  .ax-speech-output :global(.sr-line.sr-image:hover),
  .ax-speech-output :global(.sr-line.sr-link:hover),
  .ax-speech-output :global(.sr-line.sr-button:hover),
  .ax-speech-output :global(.sr-line.sr-control:hover),
  .ax-speech-output :global(.sr-line.sr-listitem:hover),
  .ax-speech-output :global(.sr-line.sr-landmark:hover) {
    background: color-mix(in srgb, var(--text-h) 7%, transparent);
  }

  /* Role chips -------------------------------------------------------------- */
  .ax-speech-output :global(.sr-tag) {
    display: inline-block;
    font-size: 0.625rem;
    font-weight: 700;
    line-height: 1.45;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    padding: 0 0.32rem;
    border-radius: 4px;
    vertical-align: middle;
    margin-right: 0.4rem;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
  }

  .ax-speech-output :global(.sr-tag-control) {
    text-transform: capitalize;
  }

  /* State / metadata pills -------------------------------------------------- */
  .ax-speech-output :global(.sr-pills) {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    margin-left: 0.4rem;
    vertical-align: middle;
  }

  .ax-speech-output :global(.sr-pill) {
    display: inline-block;
    font-size: 0.625rem;
    line-height: 1.5;
    padding: 0 0.4rem;
    border-radius: 999px;
    white-space: nowrap;
  }

  .ax-speech-output :global(.sr-pill-state) {
    background: color-mix(in srgb, var(--text) 16%, transparent);
    color: var(--text);
  }

  .ax-speech-output :global(.sr-pill-desc) {
    font-style: italic;
    background: color-mix(in srgb, var(--text) 12%, transparent);
    color: var(--text);
  }

  .ax-speech-output :global(.sr-pill-url) {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    max-width: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
  }

  /* Headings ---------------------------------------------------------------- */
  .ax-speech-output :global(.sr-heading) {
    margin: 0.5rem 0 0.1rem;
    font-weight: 700;
    color: var(--text-h);
  }

  .ax-speech-output :global(.sr-heading:first-child) {
    margin-top: 0;
  }

  .ax-speech-output :global(h1.sr-heading) {
    font-size: 1.15rem;
  }
  .ax-speech-output :global(h2.sr-heading) {
    font-size: 1.05rem;
  }
  .ax-speech-output :global(h3.sr-heading) {
    font-size: 0.95rem;
  }
  .ax-speech-output :global(h4.sr-heading),
  .ax-speech-output :global(h5.sr-heading),
  .ax-speech-output :global(h6.sr-heading) {
    font-size: 0.875rem;
  }

  /* Images ------------------------------------------------------------------ */
  .ax-speech-output :global(.sr-image) {
    color: var(--text-h);
  }

  .ax-speech-output :global(.sr-image-empty) {
    color: var(--text);
    font-style: italic;
  }

  /* Links ------------------------------------------------------------------- */
  .ax-speech-output :global(.sr-link) {
    color: var(--text-h);
  }

  .ax-speech-output :global(.sr-link-icon) {
    color: var(--accent);
    margin-right: 0.2rem;
    font-size: 0.75rem;
  }

  .ax-speech-output :global(.sr-link-label) {
    color: var(--accent);
    text-decoration: underline;
    text-decoration-thickness: 0.07em;
    text-underline-offset: 0.14em;
  }

  .ax-speech-output :global(.sr-line.sr-link:hover .sr-link-label) {
    text-decoration-thickness: 0.12em;
  }

  /* Buttons ----------------------------------------------------------------- */
  .ax-speech-output :global(.sr-button) {
    display: block;
  }

  .ax-speech-output :global(.sr-button button) {
    font: inherit;
    font-size: 0.8125rem;
    color: var(--text-h);
    background: color-mix(in srgb, var(--bg) 55%, var(--text-h));
    border: 1px solid color-mix(in srgb, var(--text) 35%, transparent);
    border-radius: 5px;
    padding: 0.1rem 0.55rem;
    cursor: default;
  }

  /* Controls / generic text ------------------------------------------------- */
  .ax-speech-output :global(.sr-control),
  .ax-speech-output :global(.sr-text) {
    color: var(--text-h);
  }

  .ax-speech-output :global(.sr-div) {
    display: block;
  }

  .ax-speech-output :global(.sr-span) {
    display: inline;
  }

  .ax-speech-output :global(.sr-text) {
    margin: 0;
  }

  /* List items -------------------------------------------------------------- */
  .ax-speech-output :global(.sr-listitem) {
    color: var(--text-h);
  }

  /* Landmarks --------------------------------------------------------------- */
  .ax-speech-output :global(.sr-landmark) {
    margin-top: 0.6rem;
    margin-bottom: 0.2rem;
    padding-left: 0.55rem;
    border-left: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  }

  .ax-speech-output :global(.sr-landmark-label) {
    display: inline-block;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin-bottom: 0.1rem;
  }

  .ax-speech-output :global(.sr-landmark-name) {
    margin: 0.05rem 0;
    font-weight: 600;
    color: var(--text-h);
  }

  .ax-speech-output :global(p) {
    margin: 0;
  }

  /* Focus ------------------------------------------------------------------- */
  .ax-speech-output :global(.sr-focused) {
    outline: 2px solid #3b82f6;
    outline-offset: 1px;
    border-radius: 5px;
    background: color-mix(in srgb, #3b82f6 14%, transparent);
  }
</style>
