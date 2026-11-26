import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

export type SearchOption = {
  value: string
  label: string
  hint?: string
}

type Props = {
  label?: string
  options: SearchOption[]
  value: string
  onChange: (next: string) => void
  placeholder?: string
  disabled?: boolean
  emptyText?: string
}

export function SearchSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Chọn…',
  disabled,
  emptyText = 'Không có kết quả',
}: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(needle) ||
        (o.hint || '').toLowerCase().includes(needle),
    )
  }, [options, q])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={rootRef} className="min-w-0 space-y-1.5">
      {label && <span className="block text-sm font-medium text-slate-700">{label}</span>}
      <div className="relative min-w-0">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <span className={`min-w-0 flex-1 truncate ${selected ? 'font-medium' : 'text-slate-400'}`}>
            {selected ? selected.label : placeholder}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {value && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    onChange('')
                  }
                }}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Xóa chọn"
              >
                <X size={14} />
              </span>
            )}
            <ChevronDown size={16} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {open && (
          <div className="absolute z-40 mt-1 w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="relative border-b border-slate-100 p-2">
              <Search className="pointer-events-none absolute top-4 left-4 text-slate-400" size={14} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm…"
                className="w-full min-w-0 rounded-lg border border-slate-200 py-1.5 pr-2 pl-8 text-sm outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <ul className="max-h-52 overflow-auto p-1">
              {filtered.map((opt) => {
                const active = opt.value === value
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(opt.value)
                        setOpen(false)
                        setQ('')
                      }}
                      className={`flex w-full min-w-0 items-start justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 ${
                        active ? 'bg-sky-50 font-semibold text-sky-800' : 'text-slate-700'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{opt.label}</span>
                        {opt.hint && (
                          <span className="block truncate text-[11px] font-normal text-slate-400">
                            {opt.hint}
                          </span>
                        )}
                      </span>
                      {active && <Check size={14} className="mt-0.5 shrink-0 text-sky-600" />}
                    </button>
                  </li>
                )
              })}
              {!filtered.length && (
                <li className="px-3 py-2 text-sm text-slate-400">{emptyText}</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
