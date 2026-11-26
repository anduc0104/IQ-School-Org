import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Filter,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Employee, OrgNode } from '../api'
import { MultiSelect } from './MultiSelect'
import { TagPill } from './TagPill'
import { TreeTagPicker } from './TreeTagPicker'

type Props = {
  employees: Employee[]
  nodes: OrgNode[]
  tree: OrgNode[]
  onCreate: (payload: Record<string, unknown>) => Promise<void>
  onUpdate: (id: string, payload: Record<string, unknown>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onImportExcel: (file: File) => Promise<void>
  onImportSource: () => Promise<void>
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export function EmployeeList({
  employees,
  nodes,
  tree,
  onCreate,
  onUpdate,
  onDelete,
  onImportExcel,
  onImportSource,
}: Props) {
  const [q, setQ] = useState('')
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [filterClasses, setFilterClasses] = useState<string[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '',
    english_name: '',
    email: '',
    phone: '',
    main_class: '',
    role_code: '',
    node_ids: [] as string[],
  })

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const classOptions = useMemo(() => {
    const set = new Set<string>()
    for (const e of employees) {
      if (e.main_class) set.add(e.main_class)
      for (const c of e.class_names || []) if (c) set.add(c)
    }
    return [...set]
      .sort((a, b) => a.localeCompare(b, 'vi'))
      .map((c) => ({ value: c, label: c }))
  }, [employees])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return employees.filter((emp) => {
      if (needle) {
        const hay = [
          emp.name,
          emp.english_name,
          emp.email,
          emp.main_class,
          emp.role_code,
          ...(emp.class_names || []),
          ...(emp.nodes || []).map((n) => n.name),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(needle)) return false
      }

      if (filterTags.length) {
        const empTagIds = new Set((emp.nodes || []).map((n) => n.id))
        const hit = filterTags.some((id) => empTagIds.has(id))
        if (!hit) return false
      }

      if (filterClasses.length) {
        const classes = new Set(
          [emp.main_class, ...(emp.class_names || [])].filter(Boolean) as string[],
        )
        const hit = filterClasses.some((c) => classes.has(c))
        if (!hit) return false
      }

      return true
    })
  }, [employees, q, filterTags, filterClasses])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))

  useEffect(() => {
    setPage(1)
  }, [q, filterTags, filterClasses, pageSize])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  function openCreate() {
    setCreating(true)
    setEditing(null)
    setForm({
      name: '',
      english_name: '',
      email: '',
      phone: '',
      main_class: '',
      role_code: '',
      node_ids: [],
    })
  }

  function openEdit(emp: Employee) {
    setEditing(emp)
    setCreating(true)
    setForm({
      name: emp.name || '',
      english_name: emp.english_name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      main_class: emp.main_class || '',
      role_code: emp.role_code || '',
      node_ids: (emp.nodes || []).map((n) => n.id),
    })
  }

  async function submit() {
    if (!form.name.trim()) return
    if (editing) await onUpdate(editing.id, form)
    else await onCreate(form)
    setCreating(false)
    setEditing(null)
  }

  const activeFilterCount = filterTags.length + filterClasses.length

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Nhân sự</h2>
          <p className="text-sm text-slate-500">
            {filtered.length}/{employees.length} người
            {activeFilterCount > 0 ? ` · ${activeFilterCount} bộ lọc` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onImportSource()}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Đồng bộ iq_dotnet_api
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <FileSpreadsheet size={16} />
            Import Excel
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onImportExcel(file)
                e.target.value = ''
              }}
            />
          </label>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            <Plus size={16} /> Thêm
          </button>
        </div>
      </div>

      {/* Search + advanced toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-2.5 left-3 text-slate-400" size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm tên, lớp, email, tag…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 pl-10 text-sm outline-none ring-sky-500 focus:ring-2"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
            showAdvanced || activeFilterCount
              ? 'border-sky-200 bg-sky-50 text-sky-700'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Filter size={16} />
          Bộ lọc nâng cao
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {showAdvanced && (
        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
          <TreeTagPicker
            tree={tree}
            value={filterTags}
            onChange={setFilterTags}
            label="Lọc theo tag / phòng ban"
          />
          <MultiSelect
            label="Lọc theo lớp (multiple)"
            options={classOptions}
            value={filterClasses}
            onChange={setFilterClasses}
            placeholder="Chọn lớp…"
          />
        </div>
      )}

      {/* Active filter chips summary */}
      {(filterTags.length > 0 || filterClasses.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
            Đang lọc:
          </span>
          {filterTags.map((id) => {
            const n = nodeById.get(id)
            if (!n) return null
            return (
              <TagPill
                key={id}
                label={n.name}
                color={n.color}
                onRemove={() => setFilterTags((ids) => ids.filter((x) => x !== id))}
              />
            )
          })}
          {filterClasses.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700"
            >
              Lớp: {c}
              <button
                type="button"
                onClick={() => setFilterClasses((xs) => xs.filter((x) => x !== c))}
                aria-label={`Bỏ lớp ${c}`}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              setFilterTags([])
              setFilterClasses([])
            }}
            className="text-xs font-medium text-rose-600 hover:underline"
          >
            Xóa bộ lọc
          </button>
        </div>
      )}

      {creating && (
        <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            {editing ? 'Sửa nhân sự' : 'Thêm nhân sự'}
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {(
              [
                ['name', 'Họ tên'],
                ['english_name', 'Tên tiếng Anh'],
                ['email', 'Email'],
                ['phone', 'SĐT'],
                ['main_class', 'Lớp chính'],
                ['role_code', 'Vai trò'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm">
                <span className="mb-1 block text-slate-600">{label}</span>
                <input
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none ring-sky-500 focus:ring-2"
                />
              </label>
            ))}
          </div>

          <div className="mt-4">
            <TreeTagPicker
              tree={tree}
              value={form.node_ids}
              onChange={(node_ids) => setForm((f) => ({ ...f, node_ids }))}
              label="Gắn tag phòng ban (theo cây)"
            />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={submit}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Lưu
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 font-semibold">Họ tên</th>
                <th className="px-4 py-3 font-semibold">Lớp</th>
                <th className="px-4 py-3 font-semibold">Phòng ban / tag</th>
                <th className="px-4 py-3 font-semibold">Vai trò</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((emp) => (
                <tr key={emp.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openEdit(emp)}
                      className="text-left font-semibold text-slate-800 hover:text-sky-700"
                    >
                      {emp.name}
                    </button>
                    {emp.english_name && (
                      <p className="text-xs text-slate-400">{emp.english_name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{emp.main_class || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(emp.nodes || []).map((n) => (
                        <TagPill key={n.id} label={n.name} color={n.color} />
                      ))}
                      {!emp.nodes?.length && <span className="text-slate-400">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{emp.role_code || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onDelete(emp.id)}
                      className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                      aria-label="Xóa"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {!pageItems.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Không có nhân sự khớp bộ lọc
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>
              {(page - 1) * pageSize + (pageItems.length ? 1 : 0)}–
              {Math.min(page * pageSize, filtered.length)} / {filtered.length}
            </span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}/trang
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} /> Trước
            </button>
            <span className="min-w-20 px-2 text-center text-sm font-semibold text-slate-700">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Sau <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
