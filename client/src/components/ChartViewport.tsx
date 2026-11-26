import {
  Expand,
  Maximize2,
  Minimize2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ChartViewContext } from './ChartViewContext'

export type ChartMode = 'select' | 'rearrange'

export type ChartViewportHandle = {
  focusNode: (nodeId: string) => void
  resetView: () => void
}

type Props = {
  children: ReactNode
  mode: ChartMode
  onModeChange: (mode: ChartMode) => void
  fullscreen: boolean
  onFullscreenChange: (next: boolean) => void
  showCounts: boolean
  onShowCountsChange: (next: boolean) => void
  onRefresh?: () => void
  loading?: boolean
  focusActive?: boolean
}

const MIN_ZOOM = 0.4
const MAX_ZOOM = 2.2
const ZOOM_STEP = 0.12
const FOCUS_ZOOM = 1.55

export const ChartViewport = forwardRef<ChartViewportHandle, Props>(function ChartViewport(
  {
    children,
    mode,
    onModeChange,
    fullscreen,
    onFullscreenChange,
    showCounts,
    onShowCountsChange,
    onRefresh,
    loading,
    focusActive,
  },
  ref,
) {
  const shellRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [smooth, setSmooth] = useState(false)
  const [panning, setPanning] = useState(false)
  const zoomRef = useRef(zoom)
  const offsetRef = useRef(offset)
  zoomRef.current = zoom
  offsetRef.current = offset

  const dragRef = useRef<{
    active: boolean
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const focusToken = useRef(0)

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

  /** Zoom toward a screen point (keeps that point stable under the cursor). */
  const zoomAtClientPoint = useCallback((clientX: number, clientY: number, nextZoom: number) => {
    const shell = shellRef.current
    if (!shell) {
      setZoom(clampZoom(nextZoom))
      return
    }
    const rect = shell.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const mx = clientX - cx
    const my = clientY - cy
    const oldZoom = zoomRef.current
    const nz = clampZoom(nextZoom)
    if (nz === oldZoom) return
    const ratio = nz / oldZoom
    const prev = offsetRef.current
    const nextOffset = {
      x: mx - (mx - prev.x) * ratio,
      y: my - (my - prev.y) * ratio,
    }
    setSmooth(false)
    setZoom(nz)
    setOffset(nextOffset)
  }, [])

  const zoomBy = useCallback(
    (delta: number) => {
      const shell = shellRef.current
      if (!shell) {
        setSmooth(false)
        setZoom((z) => clampZoom(Number((z + delta).toFixed(2))))
        return
      }
      const rect = shell.getBoundingClientRect()
      zoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, zoomRef.current + delta)
    },
    [zoomAtClientPoint],
  )

  const resetView = useCallback(() => {
    focusToken.current += 1
    setSmooth(true)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    window.setTimeout(() => setSmooth(false), 320)
  }, [])

  const focusNode = useCallback((nodeId: string) => {
    const token = ++focusToken.current
    setSmooth(true)
    setZoom(FOCUS_ZOOM)

    const panToThird = () => {
      if (token !== focusToken.current) return
      const shell = shellRef.current
      const el = document.querySelector(
        `[data-node-id="${CSS.escape(nodeId)}"]`,
      ) as HTMLElement | null
      if (!shell || !el) return

      const shellRect = shell.getBoundingClientRect()
      const nodeRect = el.getBoundingClientRect()
      const nodeCx = nodeRect.left + nodeRect.width / 2
      const nodeCy = nodeRect.top + nodeRect.height / 2
      const targetX = shellRect.left + shellRect.width / 3
      const targetY = shellRect.top + shellRect.height / 2

      setOffset((prev) => ({
        x: prev.x + (targetX - nodeCx),
        y: prev.y + (targetY - nodeCy),
      }))
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panToThird()
        window.setTimeout(panToThird, 280)
        window.setTimeout(() => {
          if (token === focusToken.current) setSmooth(false)
        }, 360)
      })
    })
  }, [])

  useImperativeHandle(ref, () => ({ focusNode, resetView }), [focusNode, resetView])

  // Ctrl + scroll → zoom toward cursor (does not clear focus / card)
  useEffect(() => {
    const el = shellRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null
      // Không giữ Ctrl → để card list / vùng scroll tự xử lý
      if (!(e.ctrlKey || e.metaKey)) return
      // Ctrl+scroll: luôn zoom biểu đồ (kể cả khi trỏ trên card)
      e.preventDefault()
      e.stopPropagation()
      void target
      const dir = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      zoomAtClientPoint(e.clientX, e.clientY, Number((zoomRef.current + dir).toFixed(2)))
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAtClientPoint])

  useEffect(() => {
    if (!fullscreen || focusActive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFullscreenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, focusActive, onFullscreenChange])

  // Ctrl + drag → kéo nền (không đụng focus/card)
  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    if (!(e.ctrlKey || e.metaKey)) return

    const target = e.target as HTMLElement
    if (target.closest('[data-no-pan]')) return

    e.preventDefault()
    setSmooth(false)
    setPanning(true)
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d?.active) return
    setOffset({
      x: d.originX + (e.clientX - d.startX),
      y: d.originY + (e.clientY - d.startY),
    })
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragRef.current?.active) return
    dragRef.current.active = false
    setPanning(false)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  // Mode switcher UI removed — Ctrl+scroll zoom, Ctrl+kéo pan. Props kept for App compat.
  void mode
  void onModeChange

  return (
    <ChartViewContext.Provider value={{ zoom, offset }}>
      <div
        className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-100 ${
          fullscreen ? 'fixed inset-0 z-[45] rounded-none' : 'rounded-xl border border-slate-200 shadow-sm'
        }`}
      >
        <div
          className={`pointer-events-none absolute top-2 right-2 left-2 z-20 flex flex-wrap items-start justify-end gap-2 ${
            fullscreen ? 'top-3 right-3 left-3' : ''
          }`}
        >
          <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/90 bg-white/95 p-1 shadow-md backdrop-blur">
            <button
              type="button"
              title="Thu nhỏ"
              onClick={() => zoomBy(-ZOOM_STEP)}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
            >
              <ZoomOut size={16} />
            </button>
            <span className="min-w-[3.25rem] text-center text-xs font-semibold tabular-nums text-slate-700">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              title="Phóng to"
              onClick={() => zoomBy(ZOOM_STEP)}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
            >
              <ZoomIn size={16} />
            </button>
            <button
              type="button"
              title="Reset view"
              onClick={resetView}
              className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              100%
            </button>
            <div className="mx-0.5 h-5 w-px bg-slate-200" />
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
              <input
                type="checkbox"
                checked={showCounts}
                onChange={(e) => onShowCountsChange(e.target.checked)}
                className="rounded border-slate-300"
              />
              Số NS
            </label>
            {onRefresh && (
              <button
                type="button"
                title="Làm mới"
                onClick={onRefresh}
                className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
            )}
            <button
              type="button"
              title={fullscreen ? 'Thoát toàn màn hình (Esc)' : 'Toàn màn hình sơ đồ'}
              onClick={() => onFullscreenChange(!fullscreen)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                fullscreen ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span className="hidden sm:inline">{fullscreen ? 'Thu nhỏ' : 'Full'}</span>
            </button>
          </div>
        </div>

        <div
          ref={shellRef}
          className={`relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_1px_1px,#e2e8f0_1px,transparent_0)] bg-[size:18px_18px] ${
            panning ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="origin-center will-change-transform"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              transition:
                smooth && !dragRef.current?.active
                  ? 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)'
                  : 'none',
            }}
          >
            <div className={`min-h-full ${fullscreen ? 'p-4 pt-14' : 'p-3 pt-14'}`}>{children}</div>
          </div>
        </div>

        {fullscreen && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded-lg bg-slate-900/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
            <Expand size={12} /> Ctrl+scroll zoom · Ctrl+kéo nền · Esc thoát focus
          </div>
        )}
      </div>
    </ChartViewContext.Provider>
  )
})
