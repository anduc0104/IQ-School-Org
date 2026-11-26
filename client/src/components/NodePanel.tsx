import { Palette, Plus, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  api,
  employeeDescription,
  type Employee,
  type OrgNode,
  type SourceClass,
  type SourceDepartment,
  type SourceSchool,
} from '../api'
import { collectSubtreeIds, flattenOrgOptions } from '../lib/orgTree'
import { SearchSelect } from './SearchSelect'
import { TagPill } from './TagPill'

type Props = {
  node: OrgNode
  employees: Employee[]
  tree: OrgNode[]
  flat: OrgNode[]
  onClose: () => void
  onChanged: () => void
}

export function NodePanel({ node, employees, tree, flat, onClose, onChanged }: Props) {
  const [name, setName] = useState(node.name)
  const [color, setColor] = useState(node.color)
  const [cascade, setCascade] = useState(false)
  const [showOnTree, setShowOnTree] = useState(node.show_members_on_tree)
  const [members, setMembers] = useState<Employee[]>([])
  const [newChild, setNewChild] = useState('')
  const [pickEmployee, setPickEmployee] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'edit' | 'members'>('edit')

  const [schools, setSchools] = useState<SourceSchool[]>([])
  const [classes, setClasses] = useState<SourceClass[]>([])
  const [departments, setDepartments] = useState<SourceDepartment[]>([])
  const [schoolId, setSchoolId] = useState('')
  const [classId, setClassId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [orgNodeId, setOrgNodeId] = useState('')
  const [metaLoaded, setMetaLoaded] = useState(false)

  useEffect(() => {
    setName(node.name)
    setColor(node.color)
    setShowOnTree(node.show_members_on_tree)
    api.getNodeMembers(node.id).then(setMembers).catch(console.error)
  }, [node])

  useEffect(() => {
    if (tab !== 'members' || metaLoaded) return
    Promise.all([api.getSchools(), api.getClasses({ active: true }), api.getDepartments()])
      .then(([s, c, d]) => {
        setSchools(s)
        setClasses(c)
        setDepartments(d)
        setMetaLoaded(true)
      })
      .catch(console.error)
  }, [tab, metaLoaded])

  useEffect(() => {
    setClassId('')
  }, [schoolId])

  useEffect(() => {
    setPickEmployee('')
  }, [schoolId, classId, departmentId, orgNodeId])

  const orgOptions = useMemo(() => flattenOrgOptions(tree, flat), [tree, flat])

  const orgSubtreeIds = useMemo(
    () => (orgNodeId ? collectSubtreeIds(orgNodeId, flat) : null),
    [orgNodeId, flat],
  )

  const classOptions = useMemo(() => {
    const sid = schoolId ? Number(schoolId) : null
    return classes
      .filter((c) => (sid == null ? true : c.school_id === sid))
      .map((c) => ({
        value: String(c.id),
        label: c.name,
        hint: [c.school_year, schools.find((s) => s.id === c.school_id)?.name]
          .filter(Boolean)
          .join(' · '),
      }))
  }, [classes, schoolId, schools])

  const schoolOptions = useMemo(
    () => schools.map((s) => ({ value: String(s.id), label: s.name, hint: s.address || undefined })),
    [schools],
  )

  const departmentOptions = useMemo(
    () =>
      departments.map((d) => ({
        value: String(d.id),
        label: d.name,
        hint: d.dept_type === 'DEPT_BACKOFFICE' ? 'Khối văn phòng' : d.dept_type || undefined,
      })),
    [departments],
  )

  const availableEmployees = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.id))
    let list = employees.filter((e) => !memberIds.has(e.id) && !e.is_disabled)

    if (classId) {
      const cid = Number(classId)
      list = list.filter((e) => (e.class_ids || []).includes(cid))
    } else if (schoolId) {
      const sid = Number(schoolId)
      list = list.filter((e) => (e.school_ids || []).includes(sid))
    }

    if (departmentId) {
      const did = Number(departmentId)
      list = list.filter((e) => (e.department_ids || []).includes(did))
    }

    if (orgSubtreeIds) {
      list = list.filter((e) => (e.nodes || []).some((n) => orgSubtreeIds.has(n.id)))
    }

    return list
  }, [employees, members, schoolId, classId, departmentId, orgSubtreeIds])

  const employeeOptions = useMemo(
    () =>
      availableEmployees.map((e) => ({
        value: e.id,
        label: e.name,
        hint: employeeDescription(e),
      })),
    [availableEmployees],
  )

  async function save() {
    setBusy(true)
    try {
      await api.updateNode(node.id, {
        name,
        color,
        show_members_on_tree: showOnTree,
        cascade_color: cascade,
      })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function addChild() {
    if (!newChild.trim()) return
    setBusy(true)
    try {
      await api.createNode({ parent_id: node.id, name: newChild.trim(), color })
      setNewChild('')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function addMember() {
    if (!pickEmployee) return
    setBusy(true)
    try {
      await api.addNodeMember(node.id, pickEmployee)
      setPickEmployee('')
      setMembers(await api.getNodeMembers(node.id))
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(employeeId: string) {
    await api.removeNodeMember(node.id, employeeId)
    setMembers(await api.getNodeMembers(node.id))
    onChanged()
  }

  async function removeNode() {
    if (!confirm(`Xóa node "${node.name}" và toàn bộ node con?`)) return
    await api.deleteNode(node.id)
    onChanged()
    onClose()
  }

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

      <div className="flex shrink-0 gap-1 border-b border-slate-100 px-4 pt-3">
        {[
          { id: 'edit', label: 'Chỉnh sửa', icon: Palette },
          { id: 'members', label: 'Nhân sự', icon: Users },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as 'edit' | 'members')}
            className={`inline-flex items-center gap-2 rounded-t-lg px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'bg-sky-50 text-sky-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4">
        {tab === 'edit' ? (
          <>
            <label className="block min-w-0 text-sm">
              <span className="mb-1 block font-medium text-slate-700">Tên node</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2 outline-none ring-sky-500 focus:ring-2"
              />
            </label>
            <label className="block min-w-0 text-sm">
              <span className="mb-1 block font-medium text-slate-700">Màu đại diện</span>
              <div className="flex min-w-0 items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                />
                <input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none ring-sky-500 focus:ring-2"
                />
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} />
              Áp màu cho toàn bộ node con
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showOnTree}
                onChange={(e) => setShowOnTree(e.target.checked)}
              />
              Hiện tên nhân sự trên cây (mặc định ẩn)
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
            >
              Lưu thay đổi
            </button>

            <div className="min-w-0 rounded-2xl border border-dashed border-slate-200 p-3 sm:p-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">Thêm node con</p>
              <div className="flex min-w-0 items-stretch gap-2">
                <input
                  value={newChild}
                  onChange={(e) => setNewChild(e.target.value)}
                  placeholder="Tên node mới"
                  className="min-w-0 flex-1 basis-0 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
                />
                <button
                  type="button"
                  onClick={addChild}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-teal-600 px-3 py-2 text-sm font-semibold whitespace-nowrap text-white hover:bg-teal-700"
                >
                  <Plus size={16} /> Thêm
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={removeNode}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100"
            >
              <Trash2 size={16} /> Xóa node
            </button>
          </>
        ) : (
          <>
            <div className="min-w-0 space-y-3 rounded-2xl border border-dashed border-slate-200 p-3 sm:p-4">
              <p className="text-sm font-semibold text-slate-800">Thêm nhân sự vào node</p>

              <div className="space-y-2.5">
                <SearchSelect
                  label="Điểm trường"
                  options={schoolOptions}
                  value={schoolId}
                  onChange={setSchoolId}
                  placeholder="Tất cả điểm trường"
                />
                <SearchSelect
                  label="Lớp"
                  options={classOptions}
                  value={classId}
                  onChange={setClassId}
                  placeholder={schoolId ? 'Chọn lớp…' : 'Chọn điểm trường trước (hoặc tìm tất cả)'}
                  emptyText={schoolId ? 'Không có lớp' : 'Chọn điểm trường để lọc lớp'}
                />
                <SearchSelect
                  label="Phòng ban (Org)"
                  options={orgOptions}
                  value={orgNodeId}
                  onChange={setOrgNodeId}
                  placeholder="Tất cả phòng ban trên cây"
                />
                <SearchSelect
                  label="Phòng ban (iq-system)"
                  options={departmentOptions}
                  value={departmentId}
                  onChange={setDepartmentId}
                  placeholder="Tất cả phòng ban iq-system"
                />
                <SearchSelect
                  label="Nhân sự"
                  options={employeeOptions}
                  value={pickEmployee}
                  onChange={setPickEmployee}
                  placeholder={`Tìm nhân sự (${employeeOptions.length})…`}
                  emptyText="Không khớp bộ lọc"
                />
              </div>

              <button
                type="button"
                disabled={busy || !pickEmployee}
                onClick={addMember}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                <UserPlus size={16} /> Thêm vào node
              </button>
            </div>

            <ul className="min-w-0 space-y-2">
              {members.map((m) => {
                const enriched = employees.find((e) => e.id === m.id) || m
                const tags = enriched.nodes || m.nodes || []
                return (
                  <li
                    key={m.id}
                    className="flex min-w-0 items-start justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{m.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {employeeDescription(enriched) || 'Chưa gắn lớp / phòng ban'}
                      </p>
                      {tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {tags.map((t) => (
                            <TagPill key={t.id} label={t.name} color={t.color} size="sm" />
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMember(m.id)}
                      className="shrink-0 rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                      aria-label="Gỡ nhân sự"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                )
              })}
              {!members.length && (
                <p className="text-sm text-slate-500">Chưa có nhân sự trong node này.</p>
              )}
            </ul>
          </>
        )}
      </div>
    </aside>
  )
}
