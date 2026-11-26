import type { OrgNode } from '../api'

export type DiagramMode = 'flowchart-tb' | 'flowchart-lr' | 'mindmap'

const idCache = new Map<string, string>()

export function safeId(id: string) {
  if (idCache.has(id)) return idCache.get(id)!
  const short = `n${idCache.size + 1}`
  idCache.set(id, short)
  return short
}

export function resetIdCache() {
  idCache.clear()
}

function escapeLabel(text: string) {
  return text.replace(/"/g, "'").replace(/[\[\]{}|]/g, ' ').replace(/\s+/g, ' ').trim()
}

function walk(
  nodes: OrgNode[],
  visit: (node: OrgNode, parent?: OrgNode) => void,
  parent?: OrgNode,
) {
  for (const node of nodes) {
    visit(node, parent)
    if (node.children?.length) walk(node.children, visit, node)
  }
}

export function buildMermaid(tree: OrgNode[], mode: DiagramMode, showCounts: boolean) {
  resetIdCache()

  if (mode === 'mindmap') {
    const lines = ['mindmap', '  root((IQ School))']
    const render = (nodes: OrgNode[], depth: number) => {
      for (const node of nodes) {
        const pad = '  '.repeat(depth + 1)
        const count = showCounts && node.member_count ? ` (${node.member_count})` : ''
        lines.push(`${pad}${escapeLabel(node.name)}${count}`)
        if (node.children?.length) render(node.children, depth + 1)
      }
    }
    render(tree, 1)
    return lines.join('\n')
  }

  const dir = mode === 'flowchart-lr' ? 'LR' : 'TB'
  const lines = [`flowchart ${dir}`]

  walk(tree, (node, parent) => {
    const id = safeId(node.id)
    const count =
      showCounts && (node.member_count || 0) > 0 ? ` (${node.member_count})` : ''
    const label = `${escapeLabel(node.name)}${count}`
    lines.push(`  ${id}["${label}"]`)
    if (parent) lines.push(`  ${safeId(parent.id)} --> ${id}`)
  })

  return lines.join('\n')
}
