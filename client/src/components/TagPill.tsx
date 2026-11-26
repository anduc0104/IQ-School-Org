import { X } from 'lucide-react'

type Props = {
  label: string
  color?: string
  onRemove?: () => void
  size?: 'sm' | 'md'
}

export function TagPill({ label, color = '#0284C7', onRemove, size = 'sm' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
      style={{
        background: `${color}18`,
        color,
        borderColor: `${color}44`,
      }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="rounded-full p-0.5 hover:bg-black/5"
          aria-label={`Bỏ ${label}`}
        >
          <X size={12} />
        </button>
      )}
    </span>
  )
}
