// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { buildDomAxTree, getAxTreeNodeIdForElement, getFocusedAxTreeNodeId } from './build-dom-ax-tree'

function findByRole(nodes: ReturnType<typeof buildDomAxTree>, role: string) {
  const found: ReturnType<typeof buildDomAxTree>[number][] = []

  function walk(node: (typeof found)[number]): void {
    if (node.role === role) found.push(node)
    for (const child of node.children) walk(child)
  }

  for (const root of nodes) walk(root)
  return found
}

describe('build-dom-ax-tree heuristics', () => {
  it('maps implicit roles for common interactive elements', () => {
    document.body.innerHTML = `
      <a href="/home">Home</a>
      <button>Save</button>
      <img alt="Logo" src="logo.png" />
      <h2>Title</h2>
      <nav><span>Nav</span></nav>
      <input type="checkbox" />
      <input type="text" />
    `

    const tree = buildDomAxTree()
    expect(findByRole(tree, 'link')[0]?.name).toBe('Home')
    expect(findByRole(tree, 'button')[0]?.name).toBe('Save')
    expect(findByRole(tree, 'image')[0]?.name).toBe('Logo')
    expect(findByRole(tree, 'heading')[0]?.level).toBe(2)
    expect(findByRole(tree, 'navigation')).toHaveLength(1)
    expect(findByRole(tree, 'checkbox')).toHaveLength(1)
    expect(findByRole(tree, 'textbox')).toHaveLength(1)
  })

  it('prefers explicit role and aria-label over implicit naming', () => {
    document.body.innerHTML = `
      <div role="button" aria-label="Close dialog">×</div>
      <span id="lbl">Email</span>
      <input aria-labelledby="lbl" type="email" />
    `

    const tree = buildDomAxTree()
    const button = findByRole(tree, 'button')[0]
    expect(button?.name).toBe('Close dialog')

    const textbox = findByRole(tree, 'textbox')[0]
    expect(textbox?.name).toBe('Email')
  })

  it('captures disabled/checked/expanded states', () => {
    document.body.innerHTML = `
      <button disabled>No</button>
      <input type="checkbox" checked />
      <details open><summary>More</summary><p>Extra</p></details>
      <div role="button" aria-expanded="true">Menu</div>
    `

    const tree = buildDomAxTree()
    expect(findByRole(tree, 'button')[0]?.states?.disabled).toBe(true)
    expect(findByRole(tree, 'checkbox')[0]?.states?.checked).toBe(true)
    expect(findByRole(tree, 'button').some((node) => node.states?.expanded === true)).toBe(true)
  })

  it('resolves focus to the nearest included ancestor path', () => {
    document.body.innerHTML = `
      <main><button id="go">Go</button><div hidden><button id="hidden">Nope</button></div></main>
    `

    const go = document.getElementById('go')!
    go.focus()
    expect(getFocusedAxTreeNodeId()).toBe('body.0.0')
    expect(getAxTreeNodeIdForElement(go)).toBe('body.0.0')
  })

  it('excludes hidden-attribute subtrees from indexing', () => {
    document.body.innerHTML = '<div hidden><button>Nope</button></div><p>Here</p>'
    const tree = buildDomAxTree()
    expect(findByRole(tree, 'button')).toHaveLength(0)
    expect(findByRole(tree, 'paragraph')[0]?.nodeId).toBe('body.1')
  })
})
