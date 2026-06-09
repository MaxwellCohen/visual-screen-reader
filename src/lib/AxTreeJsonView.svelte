<script lang="ts">
  import type { AxTreeNode } from '../shared/ax-tree'
  import { axTreeToJson } from './flatten-ax-tree-json'
  import JsonViewer from './JsonViewer.svelte'

  let { roots }: { roots: AxTreeNode[] } = $props()

  const jsonValue = $derived(axTreeToJson(roots))
</script>

<JsonViewer value={jsonValue} expandDepth={2} />
