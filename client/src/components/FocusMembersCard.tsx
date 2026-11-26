import { PanelRight, Users, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type Employee, type OrgNode, type SourceSchool } from '../api'
import { useChartView } from './ChartViewContext'
import { TagPill } from './TagPill'

type Props = {
  node: OrgNode
  members: Employee[]
  onOpenPanel: () => void
  onClose: () => void
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function schoolLabel(m: Employee, schoolsById: Map<number, string>) {
  const names = (m.school_ids || [])
    .map((id) => schoolsById.get(id))
    .filter(Boolean) as string[]
  if (!names.length) return 'Chưa có'
  return names.join('/ ')
}

/**
 * Portal ra body (fixed) để không bị mờ/chặn click bởi node dimmed trong chart.
 * Neo theo getBoundingClientRect của node — cập nhật khi zoom/pan.
 */
export function FocusMembersCard({ node, members, onOpenPanel, onClose }: Props) {
  const { zoom, offset } = useChartView()
  const cardRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [schools, setSchools] = useState<SourceSchool[]>([])
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [cardBox, setCardBox] = useState<DOMRect | null>(null)
  const color = node.color || '#0284C7'
  const reduced = prefersReducedMotion()
  const gap = 40
  const cardW = 380
  const cardH = 460

  useEffect(() => {
    api.getSchools().then(setSchools).catch(() => setSchools([]))
  }, [])

  const schoolsById = useMemo(
    () => new Map(schools.map((s) => [s.id, s.name])),
    [schools],
  )

  const syncAnchor = () => {
    const el = document.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`) as HTMLElement | null
    if (el) setAnchor(el.getBoundingClientRect())
  }

  useLayoutEffect(() => {
    syncAnchor()
  }, [node.id, zoom, offset.x, offset.y, members.length])

  useEffect(() => {
    let raf = 0
    let alive = true
    const tick = () => {
      if (!alive) return
      syncAnchor()
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    const onResize = () => syncAnchor()
    window.addEventListener('resize', onResize)
    return () => {
      alive = false
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [node.id])

  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 768

  const pos = useMemo(() => {
    if (!anchor) return null
    if (isNarrow) {
      let top = anchor.bottom + gap
      let left = Math.min(
        window.innerWidth - cardW - 12,
        Math.max(12, anchor.left + anchor.width / 2 - cardW / 2),
      )
      if (top + cardH > window.innerHeight - 12) {
        top = Math.max(12, anchor.top - cardH - gap)
      }
      return { top, left, below: true }
    }
    let top = Math.min(
      window.innerHeight - cardH - 12,
      Math.max(12, anchor.top + anchor.height / 2 - cardH / 2),
    )
    let left = anchor.right + gap
    if (left + cardW > window.innerWidth - 12) {
      left = Math.max(12, anchor.left - cardW - gap)
    }
    return { top, left, below: false }
  }, [anchor, isNarrow])

  useLayoutEffect(() => {
    if (!cardRef.current || !pos) return
    setCardBox(cardRef.current.getBoundingClientRect())
  }, [pos, members.length])

  const line = useMemo(() => {
    if (!anchor || !cardBox || !pos) return null
    if (pos.below) {
      return {
        x1: anchor.left + anchor.width / 2,
        y1: anchor.bottom,
        x2: cardBox.left + cardBox.width / 2,
        y2: cardBox.top,
      }
    }
    const toRight = cardBox.left >= anchor.right - 4
    return {
      x1: toRight ? anchor.right : anchor.left,
      y1: anchor.top + anchor.height / 2,
      x2: toRight ? cardBox.left : cardBox.right,
      y2: cardBox.top + Math.min(56, cardBox.height / 2),
    }
  }, [anchor, cardBox, pos])

  if (!pos || typeof document === 'undefined') return null

  return createPortal(
    <>
      {line && (
        <svg
          className="pointer-events-none fixed inset-0 z-[46]"
          width="100%"
          height="100%"
          aria-hidden
        >
          <path
            d={`M ${line.x1} ${line.y1} C ${
              pos.below ? line.x1 : (line.x1 + line.x2) / 2
            } ${pos.below ? (line.y1 + line.y2) / 2 : line.y1}, ${
              pos.below ? line.x2 : (line.x1 + line.x2) / 2
            } ${pos.below ? (line.y1 + line.y2) / 2 : line.y2}, ${line.x2} ${line.y2}`}
            fill="none"
            stroke="#ffffff"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d={`M ${line.x1} ${line.y1} C ${
              pos.below ? line.x1 : (line.x1 + line.x2) / 2
            } ${pos.below ? (line.y1 + line.y2) / 2 : line.y1}, ${
              pos.below ? line.x2 : (line.x1 + line.x2) / 2
            } ${pos.below ? (line.y1 + line.y2) / 2 : line.y2}, ${line.x2} ${line.y2}`}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={line.x1} cy={line.y1} r={4} fill="#fff" />
          <circle cx={line.x1} cy={line.y1} r={3} fill={color} />
          <circle cx={line.x2} cy={line.y2} r={4} fill="#fff" />
          <circle cx={line.x2} cy={line.y2} r={3} fill={color} />
        </svg>
      )}

      <div
        ref={cardRef}
        data-no-pan
        data-focus-card
        className={`fixed z-[47] flex flex-col overflow-hidden rounded-2xl border-2 shadow-2xl ${
          reduced ? '' : 'animate-[focus-card-portal-in_0.3s_ease-out_both]'
        }`}
        style={{
          top: pos.top,
          left: pos.left,
          width: cardW,
          height: cardH,
          backgroundColor: '#ffffff',
          borderColor: color,
          opacity: 1,
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
          {members.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-slate-200 px-3 py-2.5"
              style={{ backgroundColor: '#f8fafc' }}
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
          ))}
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

      <style>{`
        @keyframes focus-card-portal-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[focus-card-portal-in_0\\.3s_ease-out_both\\] { animation: none !important; }
        }
      `}</style>
    </>,
    document.body,
  )
}
