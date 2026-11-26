import type { OrgNode } from '../api'

/** Collect a node id plus all descendant ids from a flat org list. */
export function collectSubtreeIds(rootId: string, flat: OrgNode[]): Set<string> {
  const children = new Map<string, string[]>()
  for (const n of flat) {
    if (!n.parent_id) continue
    const list = children.get(n.parent_id)
    if (list) list.push(n.id)
    else children.set(n.parent_id, [n.id])
  }

  const ids = new Set<string>()
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop()!
    if (ids.has(id)) continue
    ids.add(id)
    const kids = children.get(id)
    if (kids) stack.push(...kids)
  }
  return ids
}

/** Flatten tree for SearchSelect, with depth hint. */
export function flattenOrgOptions(
  tree: OrgNode[],
  flat: OrgNode[],
): { value: string; label: string; hint?: string }[] {
  const byId = new Map(flat.map((n) => [n.id, n]))
  const out: { value: string; label: string; hint?: string }[] = []

  const walk = (nodes: OrgNode[], depth: number) => {
    for (const n of nodes) {
      const parent = n.parent_id ? byId.get(n.parent_id) : null
      out.push({
        value: n.id,
        label: `${'· '.repeat(Math.min(depth, 4))}${n.name}`.trim(),
        hint: parent?.name,
      })
      if (n.children?.length) walk(n.children, depth + 1)
    }
  }
  walk(tree, 0)
  return out
}
