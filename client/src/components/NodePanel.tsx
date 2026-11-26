import { Users, X } from 'lucide-react'
import { employeeDescription, type Employee, type OrgNode } from '../api'
import { TagPill } from './TagPill'

type Props = {
  node: OrgNode
  employees: Employee[]
  members: Employee[]
  onClose: () => void
}

export function NodePanel({ node, employees, members, onClose }: Props) {
  return (
    <aside className="flex h-full max-h-full w-full min-w-0 flex-col overflow-hidden border-l border-slate-200 bg-white shadow-xl lg:border-0 lg:shadow-none">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Node</p>
          <h2 className="truncate text-lg font-semibold text-slate-900">{node.name}</h2>
          <p className="text-sm text-slate-500">{members.length} nhân sự</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
          aria-label="Đóng"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-5 py-2.5 text-sm font-medium text-sky-700">
        <Users size={16} />
        Danh sách nhân sự
      </div>

      <div className="min-h-0 min-w-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4">
        {members.map((m) => {
          const enriched = employees.find((e) => e.id === m.id) || m
          const tags = enriched.nodes || m.nodes || []
          return (
            <div
              key={m.id}
              className="flex min-w-0 items-start justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{m.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {employeeDescription(enriched) || 'Chưa gắn lớp / phòng ban'}
                </p>
                {enriched.email && (
                  <p className="truncate text-xs text-slate-400">{enriched.email}</p>
                )}
                {tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {tags.map((t) => (
                      <TagPill key={t.id} label={t.name} color={t.color} size="sm" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {!members.length && (
          <p className="text-sm text-slate-500">Chưa có nhân sự trong node này.</p>
        )}
      </div>
    </aside>
  )
}
