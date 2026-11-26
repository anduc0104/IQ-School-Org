import { PanelRight, Users, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type Employee, type OrgNode, type SourceSchool } from '../api'
import { useChartView } from './ChartViewContext'
import { TagPill } from './TagPill'

type Props = {
  node: OrgNode
  members: Employee[]
  highlightMemberId?: string | null
  highlightNonce?: number
  onOpenPanel: () => void
  onClose: () => void
}

function schoolLabel(m: Employee, schoolsById: Map<number, string>) {
  const names = (m.school_ids || [])
    .map((id) => schoolsById.get(id))
    .filter(Boolean) as string[]
  if (!names.length) return 'Chưa có'
  return names.join('/ ')
}

const CARD_W = 380
const CARD_H = 460
const GAP = 40

type Layout = {
  top: number
  left: number
  below: boolean
  x1: number
  y1: number
  x2: number
  y2: number
}

function computeLayout(anchor: DOMRect): Layout {
  const narrow = window.innerWidth < 768
  if (narrow) {
    let top = anchor.bottom + GAP
    let left = Math.min(
      window.innerWidth - CARD_W - 12,
      Math.max(12, anchor.left + anchor.width / 2 - CARD_W / 2),
    )
    if (top + CARD_H > window.innerHeight - 12) {
      top = Math.max(12, anchor.top - CARD_H - GAP)
    }
    return {
      top,
      left,
      below: true,
      x1: anchor.left + anchor.width / 2,
      y1: anchor.bottom,
      x2: left + CARD_W / 2,
      y2: top,
    }
  }

  let top = Math.min(
    window.innerHeight - CARD_H - 12,
    Math.max(12, anchor.top + anchor.height / 2 - CARD_H / 2),
  )
  let left = anchor.right + GAP
  if (left + CARD_W > window.innerWidth - 12) {
    left = Math.max(12, anchor.left - CARD_W - GAP)
  }
  const toRight = left >= anchor.right - 4
  return {
    top,
    left,
    below: false,
    x1: toRight ? anchor.right : anchor.left,
    y1: anchor.top + anchor.height / 2,
    x2: toRight ? left : left + CARD_W,
    y2: top + Math.min(56, CARD_H / 2),
  }
}

function sameLayout(a: Layout | null, b: Layout) {
  if (!a) return false
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.x1 - b.x1) < 0.5 &&
    Math.abs(a.y1 - b.y1) < 0.5 &&
    Math.abs(a.x2 - b.x2) < 0.5 &&
    Math.abs(a.y2 - b.y2) < 0.5
  )
}

/** Portal fixed — layout bằng React state (ổn định UI). Sync nhẹ khi zoom/pan. */
export function FocusMembersCard({
  node,
  members,
  highlightMemberId,
  highlightNonce = 0,
  onOpenPanel,
  onClose,
}: Props) {
  const { zoom, offset } = useChartView()
  const [schools, setSchools] = useState<SourceSchool[]>([])
  const [layout, setLayout] = useState<Layout | null>(null)
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const color = node.color || '#0284C7'
  const syncGen = useRef(0)

  useEffect(() => {
    let cancelled = false
    api
      .getSchools()
      .then((s) => {
        if (!cancelled) setSchools(s)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const schoolsById = useMemo(
    () => new Map(schools.map((s) => [s.id, s.name])),
    [schools],
  )

  const sync = () => {
    const el = document.querySelector(
      `[data-node-id="${CSS.escape(node.id)}"]`,
    ) as HTMLElement | null
    if (!el) return
    const next = computeLayout(el.getBoundingClientRect())
    setLayout((prev) => (sameLayout(prev, next) ? prev : next))
  }

  useLayoutEffect(() => {
    sync()
  }, [node.id, zoom, offset.x, offset.y])

  // Trong lúc chart transition (~280ms), sync vài nhịp — không loop mỗi frame
  useEffect(() => {
    const gen = ++syncGen.current
    const times = [40, 120, 220, 320]
    const timers = times.map((ms) =>
      window.setTimeout(() => {
        if (syncGen.current === gen) sync()
      }, ms),
    )
    const onResize = () => sync()
    window.addEventListener('resize', onResize)
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', onResize)
    }
  }, [node.id, zoom, offset.x, offset.y])

  // Scroll tới nhân viên được chọn từ sidebar
  useEffect(() => {
    if (!highlightMemberId || !layout) return
    setActiveHighlight(highlightMemberId)
    const timers = [80, 200, 360, 520].map((ms) =>
      window.setTimeout(() => {
        const el = listRef.current?.querySelector(
          `[data-member-id="${CSS.escape(highlightMemberId)}"]`,
        ) as HTMLElement | null
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }, ms),
    )
    const clear = window.setTimeout(() => setActiveHighlight(null), 2800)
    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(clear)
    }
  }, [highlightMemberId, highlightNonce, node.id, members.length, layout])

  if (typeof document === 'undefined' || !layout) return null

  const { top, left, below, x1, y1, x2, y2 } = layout
  const c1x = below ? x1 : (x1 + x2) / 2
  const c1y = below ? (y1 + y2) / 2 : y1
  const c2x = below ? x2 : (x1 + x2) / 2
  const c2y = below ? (y1 + y2) / 2 : y2
  const d = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`

  return createPortal(
    <>
      <svg
        className="pointer-events-none fixed inset-0 z-[46]"
        width="100%"
        height="100%"
        aria-hidden
      >
        <path d={d} fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
        <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <circle cx={x1} cy={y1} r={4} fill="#fff" />
        <circle cx={x1} cy={y1} r={3} fill={color} />
        <circle cx={x2} cy={y2} r={4} fill="#fff" />
        <circle cx={x2} cy={y2} r={3} fill={color} />
      </svg>

      <div
        data-no-pan
        data-focus-card
        className="fixed z-[47] flex flex-col overflow-hidden rounded-2xl border-2 bg-white shadow-2xl"
        style={{
          top,
          left,
          width: CARD_W,
          height: CARD_H,
          backgroundColor: '#ffffff',
          borderColor: color,
        }}
        role="dialog"
        aria-label={`Nhân sự ${node.name}`}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-start gap-2 border-b border-slate-200 px-3.5 py-3"
          style={{ backgroundColor: '#ffffff' }}
        >
          <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-slate-900">{node.name}</p>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Users size={12} aria-hidden />
              {members.length} nhân sự
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-sky-400"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <ul
          ref={listRef}
          data-no-pan
          className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2.5"
          style={{ backgroundColor: '#ffffff' }}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) return
            e.stopPropagation()
          }}
        >
          {members.map((m) => {
            const highlighted = activeHighlight === m.id
            return (
              <li
                key={m.id}
                data-member-id={m.id}
                className={`rounded-xl border px-3 py-2.5 transition ${
                  highlighted
                    ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-300/70'
                    : 'border-slate-200'
                }`}
                style={{ backgroundColor: highlighted ? undefined : '#f8fafc' }}
              >
                <p className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">{m.name}</span>
                  <span className="text-slate-500"> - [{schoolLabel(m, schoolsById)}]</span>
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(m.nodes || []).length ? (
                    (m.nodes || []).map((n) => (
                      <TagPill key={n.id} label={n.name} color={n.color} size="sm" />
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-400">Chưa gắn node</span>
                  )}
                </div>
              </li>
            )
          })}
          {!members.length && (
            <li className="px-2 py-6 text-center text-sm text-slate-500">Chưa có nhân sự</li>
          )}
        </ul>

        <div className="flex shrink-0 border-t border-slate-200 p-2.5" style={{ backgroundColor: '#ffffff' }}>
          <button
            type="button"
            onClick={onOpenPanel}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
          >
            <PanelRight size={16} aria-hidden />
            Mở chi tiết
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
