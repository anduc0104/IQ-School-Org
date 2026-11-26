export type OrgNode = {
  id: string
  parent_id: string | null
  name: string
  color: string
  level: number
  sort_order: number
  node_type: string
  show_members_on_tree: boolean
  member_count?: number
  notes?: string | null
  children?: OrgNode[]
}

export type Employee = {
  id: string
  source_id?: number | null
  name: string
  english_name?: string | null
  email?: string | null
  phone?: string | null
  role_code?: string | null
  username?: string | null
  class_names?: string[]
  main_class?: string | null
  school_ids?: number[]
  class_ids?: number[]
  department_ids?: number[]
  department_names?: string[]
  is_disabled?: boolean
  extra?: {
    mainSchoolId?: number | null
    gvcn_class?: string | null
    gvbm_class?: string | null
  } | null
  nodes?: { id: string; name: string; color: string; is_primary?: boolean }[]
}

/** Description: GVCN → GVBM → phòng ban (iq_system) */
export function employeeDescription(e: Employee): string | undefined {
  return (
    e.extra?.gvcn_class ||
    e.extra?.gvbm_class ||
    e.main_class ||
    (e.department_names || [])[0] ||
    undefined
  )
}

export type SourceSchool = { id: number; name: string; address?: string | null }
export type SourceClass = {
  id: number
  school_id: number
  name: string
  school_year?: string | null
  grade?: string | null
  class_type?: string | null
  is_active?: boolean
}
export type SourceDepartment = { id: number; name: string; dept_type?: string | null }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || res.statusText)
  }
  return res.json()
}

export const api = {
  getNodes: () => request<{ flat: OrgNode[]; tree: OrgNode[] }>('/api/nodes'),
  createNode: (body: Partial<OrgNode> & { name: string }) =>
    request<OrgNode>('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  updateNode: (id: string, body: Record<string, unknown>) =>
    request<OrgNode>(`/api/nodes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  moveNode: (id: string, body: { parent_id: string | null; before_id?: string | null }) =>
    request<OrgNode>(`/api/nodes/${id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteNode: (id: string) => request<{ ok: boolean }>(`/api/nodes/${id}`, { method: 'DELETE' }),
  getNodeMembers: (id: string) => request<Employee[]>(`/api/nodes/${id}/members`),
  addNodeMember: (id: string, employee_id: string) =>
    request<{ ok: boolean }>(`/api/nodes/${id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id }),
    }),
  removeNodeMember: (id: string, employeeId: string) =>
    request<{ ok: boolean }>(`/api/nodes/${id}/members/${employeeId}`, { method: 'DELETE' }),
  getEmployees: (params?: { q?: string; node_id?: string }) => {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.node_id) qs.set('node_id', params.node_id)
    const suffix = qs.toString() ? `?${qs}` : ''
    return request<Employee[]>(`/api/employees${suffix}`)
  },
  createEmployee: (body: Record<string, unknown>) =>
    request<Employee>('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  updateEmployee: (id: string, body: Record<string, unknown>) =>
    request<Employee>(`/api/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteEmployee: (id: string) =>
    request<{ ok: boolean }>(`/api/employees/${id}`, { method: 'DELETE' }),
  importSource: () =>
    request<{ employees: number; links: number; unmatchedDepartments: string[] }>(
      '/api/employees/import/source',
      { method: 'POST' },
    ),
  importExcel: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ created: number; updated: number; rows: number }>(
      '/api/employees/import/excel',
      { method: 'POST', body: form },
    )
  },
  getSchools: () => request<SourceSchool[]>('/api/meta/schools'),
  getClasses: (params?: { school_id?: number; active?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.school_id != null) qs.set('school_id', String(params.school_id))
    if (params?.active) qs.set('active', '1')
    const suffix = qs.toString() ? `?${qs}` : ''
    return request<SourceClass[]>(`/api/meta/classes${suffix}`)
  },
  getDepartments: () => request<SourceDepartment[]>('/api/meta/departments'),
}
