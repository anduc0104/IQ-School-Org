import { ChevronDown, ChevronRight, FolderTree } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { OrgNode } from '../api'
import { TagPill } from './TagPill'

type Props = {
  tree: OrgNode[]
  value: string[]
  onChange: (ids: string[]) => void
  label?: string
}

function TreeRow({
  node,
  depth,
  value,
  expanded,
  toggleExpand,
  toggle,
}: {
  node: OrgNode
  depth: number
  value: string[]
  expanded: Set<string>
  toggleExpand: (id: string) => void
  toggle: (id: string) => void
}) {
  const hasKids = (node.children || []).length > 0
  const open = expanded.has(node.id)
  const checked = value.includes(node.id)

  return (
    <div>
      <div
        className="flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-slate-50"
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
          onClick={() => hasKids && toggleExpand(node.id)}
          aria-label={open ? 'Thu gọn' : 'Mở rộng'}
        >
          {hasKids ? (
            open ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          )}
        </button>
        <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggle(node.id)}
            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: node.color }}
          />
          <span className={checked ? 'font-semibold text-slate-900' : ''}>{node.name}</span>
          {node.node_type === 'stream' && (
            <span className="text-[10px] font-medium text-slate-400 uppercase">luồng</span>
          )}
        </label>
      </div>
      {hasKids && open &&
        (node.children || []).map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            value={value}
            expanded={expanded}
            toggleExpand={toggleExpand}
            toggle={toggle}
          />
        ))}
    </div>
  )
}

export function TreeTagPicker({
  tree,
  value,
  onChange,
  label = 'Phòng ban / tag',
}: Props) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>()
    const seed = (nodes: OrgNode[], depth = 0) => {
      for (const n of nodes) {
        if (depth < 3) init.add(n.id)
        if (n.children?.length) seed(n.children, depth + 1)
      }
    }
    seed(tree)
    return init
  })

  const byId = useMemo(() => {
    const map = new Map<string, OrgNode>()
    const walk = (nodes: OrgNode[]) => {
      for (const n of nodes) {
        map.set(n.id, n)
        if (n.children?.length) walk(n.children)
      }
    }
    walk(tree)
    return map
  }, [tree])

  const selectedNodes = value.map((id) => byId.get(id)).filter(Boolean) as OrgNode[]

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((x) => x !== id))
    else onChange([...value, id])
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs font-medium text-slate-500 hover:text-rose-600"
          >
            Xóa hết
          </button>
        )}
      </div>

      {/* Selected preview tags */}
      <div className="min-h-10 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2">
        {selectedNodes.length ? (
          <div className="flex flex-wrap gap-1.5">
            {selectedNodes.map((n) => (
              <TagPill
                key={n.id}
                label={n.name}
                color={n.color}
                onRemove={() => toggle(n.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Chưa chọn tag — mở cây bên dưới để chọn</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        <span className="inline-flex items-center gap-2">
          <FolderTree size={16} className="text-sky-600" />
          Chọn theo cây thư mục
          {value.length > 0 && (
            <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[11px] text-white">
              {value.length}
            </span>
          )}
        </span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {open && (
        <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          {tree.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              value={value}
              expanded={expanded}
              toggleExpand={toggleExpand}
              toggle={toggle}
            />
          ))}
          {!tree.length && (
            <p className="px-2 py-3 text-sm text-slate-500">Chưa có cây tổ chức</p>
          )}
        </div>
      )}

      </div>
  )
}
