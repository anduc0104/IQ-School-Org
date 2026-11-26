import { ChevronDown, ChevronRight, PanelRightClose, Search, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { employeeDescription, type Employee, type OrgNode } from '../api'
import { collectSubtreeIds } from '../lib/orgTree'
import { TagPill } from './TagPill'

type Props = {
  open: boolean
  onClose: () => void
  tree: OrgNode[]
  flat: OrgNode[]
  employees: Employee[]
  onSelectNode?: (node: OrgNode) => void
  onSelectEmployee?: (emp: Employee, node: OrgNode) => void
}

function matchesQuery(emp: Employee, q: string) {
  if (!q) return true
  const hay = [
    emp.name,
    emp.english_name,
    ...(emp.department_names || []),
    emp.main_class,
    ...(emp.nodes || []).map((n) => n.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

function EmployeeCard({
  emp,
  onClick,
}: {
  emp: Employee
  onClick?: () => void
}) {
  const subtitle =
    (emp.department_names || [])[0] || employeeDescription(emp) || emp.main_class || null
  const tags = emp.nodes || []

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50/40 hover:shadow focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      <h4 className="text-sm font-bold text-slate-900">{emp.name}</h4>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <TagPill key={t.id} label={t.name} color={t.color} size="sm" />
          ))}
        </div>
      )}
    </button>
  )
}

function NodeSection({
  node,
  flat,
  employeesByNode,
  depth,
  query,
  forceOpen,
  expanded,
  toggleExpand,
  onSelectNode,
  onSelectEmployee,
}: {
  node: OrgNode
  flat: OrgNode[]
  employeesByNode: Map<string, Employee[]>
  depth: number
  query: string
  forceOpen: boolean
  expanded: Set<string>
  toggleExpand: (id: string) => void
  onSelectNode?: (node: OrgNode) => void
  onSelectEmployee?: (emp: Employee, node: OrgNode) => void
}) {
  const members = employeesByNode.get(node.id) || []
  const children = node.children || []
  const hasKids = children.length > 0
  const q = query.trim().toLowerCase()
  const isOpen = forceOpen || expanded.has(node.id)

  const subtreeUniqueIds = useMemo(() => {
    const ids = collectSubtreeIds(node.id, flat)
    const set = new Set<string>()
    for (const id of ids) {
      for (const e of employeesByNode.get(id) || []) {
        if (matchesQuery(e, q)) set.add(e.id)
      }
    }
    return set
  }, [node.id, flat, employeesByNode, q])

  const filteredMembers = useMemo(
    () => members.filter((e) => matchesQuery(e, q)),
    [members, q],
  )

  const visibleChildren = useMemo(() => {
    if (!q) return children
    return children.filter((c) => {
      const ids = collectSubtreeIds(c.id, flat)
      for (const id of ids) {
        for (const e of employeesByNode.get(id) || []) {
          if (matchesQuery(e, q)) return true
        }
      }
      return false
    })
  }, [children, q, flat, employeesByNode])

  if (q && subtreeUniqueIds.size === 0) return null

  const color = node.color || '#0284C7'
  const count = subtreeUniqueIds.size
  const showEmployees = !hasKids || filteredMembers.length > 0

  return (
    <div>
      <div
        className="group flex items-center gap-0.5 rounded-lg hover:bg-slate-50"
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          className="flex h-7 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          onClick={() => (hasKids || filteredMembers.length > 0) && toggleExpand(node.id)}
          aria-label={isOpen ? 'Thu gọn' : 'Mở rộng'}
        >
          {hasKids || filteredMembers.length > 0 ? (
            isOpen ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectNode?.(node)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-1 text-left"
          title={`Xem node ${node.name}`}
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 group-hover:text-slate-900">
            {node.name}
          </span>
          {node.node_type === 'stream' && (
            <span className="hidden text-[10px] font-medium tracking-wide text-slate-400 uppercase sm:inline">
              luồng
            </span>
          )}
          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500">
            {count}
          </span>
        </button>

        {onSelectNode && (
          <button
            type="button"
            title={`Focus ${node.name}`}
            onClick={() => onSelectNode(node)}
            className="mr-1 shrink-0 rounded-md px-1.5 py-1 text-[10px] font-semibold text-sky-600 opacity-80 hover:bg-sky-50 hover:opacity-100"
          >
            Xem
          </button>
        )}
      </div>

      {isOpen && (
        <div>
          {showEmployees && filteredMembers.length > 0 && (
            <div
              className="space-y-2 py-1.5"
              style={{ paddingLeft: 22 + depth * 14, paddingRight: 8 }}
            >
              {filteredMembers.map((emp) => (
                <EmployeeCard
                  key={emp.id}
                  emp={emp}
                  onClick={() => onSelectEmployee?.(emp, node)}
                />
              ))}
            </div>
          )}
          {visibleChildren.map((child) => (
            <NodeSection
              key={child.id}
              node={child}
              flat={flat}
              employeesByNode={employeesByNode}
              depth={depth + 1}
              query={query}
              forceOpen={forceOpen}
              expanded={expanded}
              toggleExpand={toggleExpand}
              onSelectNode={onSelectNode}
              onSelectEmployee={onSelectEmployee}
            />
          ))}
          {!filteredMembers.length && !visibleChildren.length && (
            <p
              className="py-1 text-[11px] text-slate-400"
              style={{ paddingLeft: 22 + depth * 14 }}
            >
              Chưa có nhân sự
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function seedExpanded(tree: OrgNode[], maxDepth = 1) {
  const init = new Set<string>()
  const walk = (nodes: OrgNode[], depth: number) => {
    for (const n of nodes) {
      if (depth <= maxDepth) init.add(n.id)
      if (n.children?.length) walk(n.children, depth + 1)
    }
  }
  walk(tree, 0)
  return init
}

export function PeopleSidebar({
  open,
  onClose,
  tree,
  flat,
  employees,
  onSelectNode,
  onSelectEmployee,
}: Props) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => seedExpanded(tree, 0))
  const treeKey = tree.map((t) => t.id).join('|')

  useEffect(() => {
    if (tree.length) setExpanded(seedExpanded(tree, 0))
  }, [treeKey])

  const employeesByNode = useMemo(() => {
    const map = new Map<string, Employee[]>()
    for (const emp of employees) {
      for (const n of emp.nodes || []) {
        const list = map.get(n.id)
        if (list) list.push(emp)
        else map.set(n.id, [emp])
      }
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    }
    return map
  }, [employees])

  const assignedCount = useMemo(
    () => employees.filter((e) => (e.nodes || []).length > 0).length,
    [employees],
  )

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!open) return null

  const forceOpen = query.trim().length > 0

  return (
    <aside className="flex h-full w-[min(100%,360px)] min-w-[280px] shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white shadow-sm">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-100 px-3 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Users size={15} className="text-sky-600" aria-hidden />
            <h2 className="text-sm font-bold text-slate-900">Nhân sự theo cấp</h2>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {assignedCount}/{employees.length} đã gắn sơ đồ
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          aria-label="Đóng sidebar nhân sự"
          title="Đóng"
        >
          <PanelRightClose size={18} />
        </button>
      </div>

      <div className="shrink-0 border-b border-slate-100 px-3 py-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-2 left-2.5 text-slate-400"
            size={15}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm nhân viên, tag…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs outline-none ring-sky-500 focus:bg-white focus:ring-2"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-2">
        {tree.map((root) => (
          <NodeSection
            key={root.id}
            node={root}
            flat={flat}
            employeesByNode={employeesByNode}
            depth={0}
            query={query}
            forceOpen={forceOpen}
            expanded={expanded}
            toggleExpand={toggleExpand}
            onSelectNode={onSelectNode}
            onSelectEmployee={onSelectEmployee}
          />
        ))}
        {!tree.length && (
          <p className="px-3 py-8 text-center text-sm text-slate-500">Chưa có dữ liệu sơ đồ</p>
        )}
      </div>
    </aside>
  )
}
