import { PanelRightOpen, RefreshCw, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, clearDataCache, type Employee, type OrgNode } from './api'
import { ChartViewport, type ChartMode, type ChartViewportHandle } from './components/ChartViewport'
import { EmployeeList } from './components/EmployeeList'
import { NodePanel } from './components/NodePanel'
import { OrgChart } from './components/OrgChart'
import { PeopleSidebar } from './components/PeopleSidebar'

type View = 'tree' | 'people'

export default function App() {
  const [view, setView] = useState<View>('tree')
  const [showCounts, setShowCounts] = useState(true)
  const [tree, setTree] = useState<OrgNode[]>([])
  const [flat, setFlat] = useState<OrgNode[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [focused, setFocused] = useState<OrgNode | null>(null)
  const [focusMembers, setFocusMembers] = useState<Employee[]>([])
  const [highlightMemberId, setHighlightMemberId] = useState<string | null>(null)
  const [highlightNonce, setHighlightNonce] = useState(0)
  const [panelOpen, setPanelOpen] = useState(false)
  const [peopleSidebarOpen, setPeopleSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1100,
  )
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [chartMode] = useState<ChartMode>('select')
  const [chartFullscreen, setChartFullscreen] = useState(false)
  const viewportRef = useRef<ChartViewportHandle>(null)

  const notify = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3200)
  }

  const clearFocus = useCallback(() => {
    setFocused(null)
    setFocusMembers([])
    setHighlightMemberId(null)
    setPanelOpen(false)
    viewportRef.current?.resetView()
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    clearDataCache()
    try {
      const [nodes, people] = await Promise.all([api.getNodes(), api.getEmployees()])
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
    (node: OrgNode, memberId?: string | null) => {
      setFocused(node)
      setPanelOpen(false)
      setHighlightMemberId(memberId ?? null)
      if (memberId) setHighlightNonce((n) => n + 1)
      // Card hiện ngay từ cache — không chờ API
      setFocusMembers(employees.filter((e) => (e.nodes || []).some((n) => n.id === node.id)))
      requestAnimationFrame(() => {
        viewportRef.current?.focusNode(node.id)
      })
      api
        .getNodeMembers(node.id)
        .then((members) => setFocusMembers(enrichMembers(members)))
        .catch(() => {})
    },
    [employees, enrichMembers],
  )

  const onSelectEmployee = useCallback(
    (emp: Employee, node: OrgNode) => {
      onSelectNode(node, emp.id)
    },
    [onSelectNode],
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
                <p className="hidden text-[11px] text-slate-500 sm:block">
                  Sơ đồ tĩnh · đọc từ JSON
                </p>
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
              onClick={() => loadAll().catch((err) => notify(err.message))}
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
                  <span
                    className="hidden items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-500 lg:inline-flex"
                    title="Giữ Ctrl khi zoom hoặc kéo nền sơ đồ"
                  >
                    <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-px font-mono text-[10px] font-semibold text-slate-700">
                      Ctrl
                    </kbd>
                    + lăn = zoom · + kéo = di chuyển
                  </span>
                  <div className="ml-auto">
                    <button
                      type="button"
                      onClick={() => setPeopleSidebarOpen((v) => !v)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                        peopleSidebarOpen
                          ? 'border-sky-200 bg-sky-50 text-sky-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                      title={peopleSidebarOpen ? 'Đóng danh sách nhân sự' : 'Mở danh sách nhân sự'}
                    >
                      <PanelRightOpen size={14} />
                      {peopleSidebarOpen ? 'Ẩn NS' : 'Nhân sự'}
                    </button>
                  </div>
                </div>
              )}

              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                {loading && !tree.length ? (
                  <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
                    Đang tải sơ đồ…
                  </div>
                ) : (
                  <ChartViewport
                    ref={viewportRef}
                    mode={chartMode}
                    onModeChange={() => {}}
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
                        focused
                          ? {
                              members: focusMembers,
                              highlightMemberId,
                              highlightNonce,
                              hidden: panelOpen,
                              onOpenPanel: () => setPanelOpen(true),
                              onClose: clearFocus,
                            }
                          : null
                      }
                      mode={chartMode}
                      onSelectNode={(node) => onSelectNode(node)}
                    />
                  </ChartViewport>
                )}

                {compactChrome && !peopleSidebarOpen && (
                  <button
                    type="button"
                    onClick={() => setPeopleSidebarOpen(true)}
                    className="absolute top-14 right-3 z-30 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/95 px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-md backdrop-blur hover:bg-white"
                    title="Mở danh sách nhân sự"
                  >
                    <PanelRightOpen size={14} />
                    Nhân sự
                  </button>
                )}
              </div>
            </div>

            {!compactChrome && (
              <PeopleSidebar
                open={peopleSidebarOpen}
                onClose={() => setPeopleSidebarOpen(false)}
                tree={tree}
                flat={flat}
                employees={employees}
                onSelectNode={(node) => onSelectNode(node)}
                onSelectEmployee={onSelectEmployee}
              />
            )}

            {compactChrome && peopleSidebarOpen && (
              <>
                <button
                  type="button"
                  aria-label="Đóng sidebar nhân sự"
                  className="fixed inset-0 z-[48] bg-slate-900/40"
                  onClick={() => setPeopleSidebarOpen(false)}
                />
                <div className="fixed inset-y-0 right-0 z-[49] flex h-[100dvh] animate-[panel-in_0.28s_ease-out]">
                  <PeopleSidebar
                    open
                    onClose={() => setPeopleSidebarOpen(false)}
                    tree={tree}
                    flat={flat}
                    employees={employees}
                    onSelectNode={(node) => onSelectNode(node)}
                    onSelectEmployee={onSelectEmployee}
                  />
                </div>
              </>
            )}

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
                    members={focusMembers}
                    onClose={clearFocus}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            <EmployeeList employees={employees} nodes={flat} tree={tree} />
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
