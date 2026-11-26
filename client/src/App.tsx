import { RefreshCw, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Employee, type OrgNode } from './api'
import { ChartViewport, type ChartMode, type ChartViewportHandle } from './components/ChartViewport'
import { EmployeeList } from './components/EmployeeList'
import { NodePanel } from './components/NodePanel'
import { OrgChart } from './components/OrgChart'

type View = 'tree' | 'people'

export default function App() {
  const [view, setView] = useState<View>('tree')
  const [showCounts, setShowCounts] = useState(true)
  const [tree, setTree] = useState<OrgNode[]>([])
  const [flat, setFlat] = useState<OrgNode[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [focused, setFocused] = useState<OrgNode | null>(null)
  const [focusMembers, setFocusMembers] = useState<Employee[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [chartMode, setChartMode] = useState<ChartMode>('select')
  const [chartFullscreen, setChartFullscreen] = useState(false)
  const viewportRef = useRef<ChartViewportHandle>(null)

  const notify = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3200)
  }

  const clearFocus = useCallback(() => {
    setFocused(null)
    setFocusMembers([])
    setPanelOpen(false)
    viewportRef.current?.resetView()
  }, [])

  const loadAll = useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const [nodes, people] = await Promise.all([
        api.getNodes(),
        api.getEmployees(q ? { q } : undefined),
      ])
      setTree(nodes.tree)
      setFlat(nodes.flat)
      setEmployees(people)
      setFocused((prev) => {
        if (!prev) return null
        return nodes.flat.find((n) => n.id === prev.id) || null
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll().catch((err) => notify(err.message))
  }, [loadAll])

  useEffect(() => {
    if (view !== 'tree') setChartFullscreen(false)
  }, [view])

  const enrichMembers = useCallback(
    (members: Employee[]) => {
      const byId = new Map(employees.map((e) => [e.id, e]))
      return members.map((m) => {
        const full = byId.get(m.id)
        if (!full) return m
        return {
          ...m,
          nodes: m.nodes?.length ? m.nodes : full.nodes,
          school_ids: m.school_ids?.length ? m.school_ids : full.school_ids,
        }
      })
    },
    [employees],
  )

  const onSelectNode = useCallback(
    async (node: OrgNode) => {
      setFocused(node)
      setPanelOpen(false)
      // Wait for focused styles + card mount, then zoom/pan node to ~1/3 left
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          viewportRef.current?.focusNode(node.id)
        })
      })
      try {
        const members = await api.getNodeMembers(node.id)
        setFocusMembers(enrichMembers(members))
      } catch {
        setFocusMembers([])
      }
    },
    [enrichMembers],
  )

  const onMoveNode = useCallback(
    async (nodeId: string, targetParentId: string | null, beforeId?: string | null) => {
      try {
        await api.moveNode(nodeId, {
          parent_id: targetParentId,
          before_id: beforeId ?? null,
        })
        notify('Đã cập nhật vị trí node')
        await loadAll()
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Không thể di chuyển node')
      }
    },
    [loadAll],
  )

  useEffect(() => {
    if (!focused) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        clearFocus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused, clearFocus])

  useEffect(() => {
    if (!focused) return
    api
      .getNodeMembers(focused.id)
      .then((members) => setFocusMembers(enrichMembers(members)))
      .catch(() => {})
  }, [employees, focused, enrichMembers])

  const compactChrome = chartFullscreen && view === 'tree'

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-50">
      {!compactChrome && (
        <header className="z-40 shrink-0 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-3 py-2 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm">
                <Sparkles size={14} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-bold text-slate-900 sm:text-base">IQ School Org</h1>
                <p className="hidden text-[11px] text-slate-500 sm:block">Cây phân tầng · dense</p>
              </div>
            </div>
            <nav className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              {(
                [
                  { id: 'tree', label: 'Sơ đồ' },
                  { id: 'people', label: 'Nhân sự' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                    view === item.id
                      ? 'bg-white text-sky-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <button
              type="button"
              onClick={() => loadAll()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:text-sm"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>
        </header>
      )}

      <main
        className={`flex min-h-0 w-full flex-1 flex-col overflow-hidden ${
          compactChrome ? 'max-w-none p-0' : 'mx-auto max-w-[1600px] px-3 py-2 sm:px-4'
        }`}
      >
        {view === 'tree' ? (
          <div className="relative flex min-h-0 flex-1 items-stretch">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {!compactChrome && (
                <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-500">Theo cấp / luồng:</span>
                  {[
                    { label: 'Cấp lãnh đạo', color: '#0EA5E9' },
                    { label: 'Luồng 1', color: '#3B82F6' },
                    { label: 'Luồng 2', color: '#10B981' },
                    { label: 'Luồng 3', color: '#F59E0B' },
                    { label: 'Luồng 4', color: '#8B5CF6' },
                  ].map((c) => (
                    <span
                      key={c.label}
                      className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[11px] font-semibold"
                      style={{ borderColor: `${c.color}55`, color: c.color }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                      {c.label}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {loading && !tree.length ? (
                  <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
                    Đang tải sơ đồ…
                  </div>
                ) : (
                  <ChartViewport
                    ref={viewportRef}
                    mode={chartMode}
                    onModeChange={setChartMode}
                    fullscreen={chartFullscreen}
                    onFullscreenChange={setChartFullscreen}
                    showCounts={showCounts}
                    onShowCountsChange={setShowCounts}
                    onRefresh={() => loadAll()}
                    loading={loading}
                    focusActive={Boolean(focused)}
                  >
                    <OrgChart
                      tree={tree}
                      flat={flat}
                      showCounts={showCounts}
                      selectedId={focused?.id}
                      focusedId={focused?.id}
                      focusOverlay={
                        focused && chartMode === 'select'
                          ? {
                              members: focusMembers,
                              hidden: panelOpen,
                              onOpenPanel: () => setPanelOpen(true),
                              onClose: clearFocus,
                            }
                          : null
                      }
                      mode={chartMode}
                      onSelectNode={onSelectNode}
                      onMoveNode={onMoveNode}
                    />
                  </ChartViewport>
                )}
              </div>
            </div>

            {panelOpen && focused && (
              <>
                <button
                  type="button"
                  aria-label="Đóng panel"
                  className="fixed inset-0 z-[48] bg-slate-900/55 backdrop-blur-[2px] transition-opacity duration-200"
                  onClick={clearFocus}
                />
                <div className="fixed inset-y-0 right-0 z-[50] flex h-[100dvh] w-full max-w-sm min-w-0 flex-col overflow-hidden bg-white shadow-2xl animate-[panel-in_0.28s_ease-out]">
                  <NodePanel
                    node={focused}
                    employees={employees}
                    tree={tree}
                    flat={flat}
                    onClose={clearFocus}
                    onChanged={() => loadAll()}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            <EmployeeList
              employees={employees}
              nodes={flat}
              tree={tree}
              onCreate={async (payload) => {
                await api.createEmployee(payload)
                notify('Đã thêm nhân sự')
                await loadAll()
              }}
              onUpdate={async (id, payload) => {
                await api.updateEmployee(id, payload)
                notify('Đã cập nhật nhân sự')
                await loadAll()
              }}
              onDelete={async (id) => {
                if (!confirm('Xóa nhân sự này?')) return
                await api.deleteEmployee(id)
                notify('Đã xóa')
                await loadAll()
              }}
              onImportExcel={async (file) => {
                const result = await api.importExcel(file)
                notify(`Excel: +${result.created} mới, ${result.updated} cập nhật`)
                await loadAll()
              }}
              onImportSource={async () => {
                const result = await api.importSource()
                notify(
                  `Đồng bộ ${result.employees} NS, ${result.links} liên kết` +
                    (result.unmatchedDepartments.length
                      ? ` · chưa map: ${result.unmatchedDepartments.slice(0, 5).join(', ')}`
                      : ''),
                )
                await loadAll()
              }}
            />
          </div>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      <style>{`
        @keyframes panel-in {
          from { transform: translateX(100%); opacity: 0.6; }
          to { transform: translateX(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[panel-in_0\\.28s_ease-out\\] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
