import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'

type Option = { value: string; label: string }

type Props = {
  label: string
  options: Option[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}

export function MultiSelect({ label, options, value, onChange, placeholder = 'Chọn…' }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return options
    return options.filter((o) => o.label.toLowerCase().includes(needle))
  }, [options, q])

  function toggle(v: string) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v))
    else onChange([...value, v])
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs text-slate-500 hover:text-rose-600"
          >
            Xóa
          </button>
        )}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-dashed border-slate-200 bg-white px-2.5 py-2">
          {value.map((v) => {
            const opt = options.find((o) => o.value === v)
            return (
              <span
                key={v}
                className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700"
              >
                {opt?.label || v}
                <button type="button" onClick={() => toggle(v)} aria-label={`Bỏ ${v}`}>
                  <X size={12} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <span className={value.length ? 'font-medium' : 'text-slate-400'}>
            {value.length ? `Đã chọn ${value.length}` : placeholder}
          </span>
          <ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="relative border-b border-slate-100 p-2">
              <Search className="pointer-events-none absolute top-4 left-4 text-slate-400" size={14} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Lọc…"
                className="w-full rounded-lg border border-slate-200 py-1.5 pr-2 pl-8 text-sm outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <ul className="max-h-48 overflow-auto p-1">
              {filtered.map((opt) => {
                const active = value.includes(opt.value)
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onClick={() => toggle(opt.value)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 ${
                        active ? 'bg-sky-50 font-semibold text-sky-800' : 'text-slate-700'
                      }`}
                    >
                      {opt.label}
                      {active && <Check size={14} className="text-sky-600" />}
                    </button>
                  </li>
                )
              })}
              {!filtered.length && (
                <li className="px-3 py-2 text-sm text-slate-400">Không có kết quả</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
