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

/** Description: GVCN → GVBM → phòng ban */
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

const DATA = `${import.meta.env.BASE_URL}data`

type Cache = {
  nodes?: { flat: OrgNode[]; tree: OrgNode[] }
  employees?: Employee[]
  schools?: SourceSchool[]
  classes?: SourceClass[]
  departments?: SourceDepartment[]
}

let cache: Cache = {}

export function clearDataCache() {
  cache = {}
}

async function loadJson<T>(file: string): Promise<T> {
  const res = await fetch(`${DATA}/${file}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Không tải được ${file}: ${res.statusText}`)
  return res.json()
}

async function ensureNodes() {
  if (!cache.nodes) {
    const data = await loadJson<{ flat: OrgNode[]; tree: OrgNode[] }>('nodes.json')
    cache.nodes = { flat: data.flat, tree: data.tree }
  }
  return cache.nodes
}

async function ensureEmployees() {
  if (!cache.employees) {
    const data = await loadJson<{ employees: Employee[] }>('employees.json')
    cache.employees = data.employees
  }
  return cache.employees
}

function matchQuery(e: Employee, q: string) {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const hay = [
    e.name,
    e.english_name,
    e.email,
    e.main_class,
    e.role_code,
    ...(e.class_names || []),
    ...(e.nodes || []).map((n) => n.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(needle)
}

export const api = {
  getNodes: async () => ensureNodes(),

  getEmployees: async (params?: { q?: string; node_id?: string }) => {
    let list = await ensureEmployees()
    if (params?.node_id) {
      list = list.filter((e) => (e.nodes || []).some((n) => n.id === params.node_id))
    }
    if (params?.q) {
      list = list.filter((e) => matchQuery(e, params.q!))
    }
    return list
  },

  getNodeMembers: async (id: string) => {
    const list = await ensureEmployees()
    return list
      .filter((e) => (e.nodes || []).some((n) => n.id === id))
      .sort((a, b) => {
        const aPri = (a.nodes || []).find((n) => n.id === id)?.is_primary ? 1 : 0
        const bPri = (b.nodes || []).find((n) => n.id === id)?.is_primary ? 1 : 0
        if (bPri !== aPri) return bPri - aPri
        return a.name.localeCompare(b.name, 'vi')
      })
  },

  getSchools: async () => {
    if (!cache.schools) cache.schools = await loadJson<SourceSchool[]>('schools.json')
    return cache.schools
  },

  getClasses: async (params?: { school_id?: number; active?: boolean }) => {
    if (!cache.classes) cache.classes = await loadJson<SourceClass[]>('classes.json')
    let list = cache.classes
    if (params?.school_id != null) {
      list = list.filter((c) => c.school_id === params.school_id)
    }
    if (params?.active) {
      list = list.filter((c) => c.is_active !== false)
    }
    return list
  },

  getDepartments: async () => {
    if (!cache.departments) {
      cache.departments = await loadJson<SourceDepartment[]>('departments.json')
    }
    return cache.departments
  },
}
