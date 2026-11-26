import { useMemo, useState, type ReactNode } from 'react'
import type { Employee, OrgNode } from '../api'
import type { ChartMode } from './ChartViewport'
import { FocusMembersCard } from './FocusMembersCard'

type FocusOverlay = {
  members: Employee[]
  highlightMemberId?: string | null
  highlightNonce?: number
  hidden?: boolean
  onOpenPanel: () => void
  onClose: () => void
}

type Props = {
  tree: OrgNode[]
  flat: OrgNode[]
  showCounts: boolean
  selectedId?: string | null
  focusedId?: string | null
  focusOverlay?: FocusOverlay | null
  mode?: ChartMode
  onSelectNode: (node: OrgNode, anchor?: DOMRect) => void
  onMoveNode?: (nodeId: string, targetParentId: string | null, beforeId?: string | null) => void
}

function subtreeContains(root: OrgNode, id: string): boolean {
  if (root.id === id) return true
  return (root.children || []).some((c) => subtreeContains(c, id))
}

function FocusWrap({
  node,
  focused,
  overlay,
  className,
  children,
}: {
  node: OrgNode
  focused?: boolean
  overlay?: FocusOverlay | null
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`relative ${focused ? 'z-30' : ''} ${className || ''}`}>
      {children}
      {/* Portal ra body — tránh bị node dimmed đè lên / làm “mờ” và chặn click */}
      {focused && overlay && !overlay.hidden && (
        <FocusMembersCard
          node={node}
          members={overlay.members}
          highlightMemberId={overlay.highlightMemberId}
          highlightNonce={overlay.highlightNonce}
          onOpenPanel={overlay.onOpenPanel}
          onClose={overlay.onClose}
        />
      )}
    </div>
  )
}

function hexToRgba(hex: string, alpha: number) {
  const h = (hex || '#64748B').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6)
  const n = Number.parseInt(full, 16)
  if (Number.isNaN(n)) return `rgba(100,116,139,${alpha})`
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

const LINE = '#94A3B8'
const DRAG_MIME = 'application/x-org-node'

function ForkConnector({ streamCount }: { streamCount: number }) {
  const lastDesktop = streamCount - 1
  const lastMobile = Math.min(1, lastDesktop)

  return (
    <div className="relative" aria-hidden>
      <div className="mx-auto h-2.5 w-[2px]" style={{ background: LINE }} />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        {Array.from({ length: streamCount }).map((_, i) => {
          const hideWrapped = i >= 2 ? 'max-lg:hidden' : ''
          const showHMobile = i < lastMobile
          const showHDesktop = i < lastDesktop
          return (
            <div key={i} className={`relative h-3 ${hideWrapped}`}>
              <div
                className="absolute top-0 bottom-0 left-1/2 w-[2px] -translate-x-1/2"
                style={{ background: LINE }}
              />
              {showHMobile && (
                <div
                  className="absolute top-0 left-1/2 h-[2px] w-[calc(100%+0.5rem)] lg:hidden"
                  style={{ background: LINE }}
                />
              )}
              {showHDesktop && (
                <div
                  className="absolute top-0 left-1/2 hidden h-[2px] w-[calc(100%+0.75rem)] lg:block"
                  style={{ background: LINE }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NodeCard({
  node,
  showCounts,
  selected,
  focused,
  dimmed,
  variant = 'dept',
  mode = 'select',
  dropHighlight,
  onSelectNode,
  onDragStartNode,
  onDragOverNode,
  onDropOnNode,
  onDragLeaveNode,
}: {
  node: OrgNode
  showCounts: boolean
  selected?: boolean
  focused?: boolean
  dimmed?: boolean
  variant?: 'lead' | 'stream' | 'dept'
  mode?: ChartMode
  dropHighlight?: boolean
  onSelectNode: Props['onSelectNode']
  onDragStartNode?: (node: OrgNode, e: React.DragEvent) => void
  onDragOverNode?: (node: OrgNode, e: React.DragEvent) => void
  onDropOnNode?: (node: OrgNode, e: React.DragEvent) => void
  onDragLeaveNode?: () => void
}) {
  const color = node.color || '#64748B'
  const count = node.member_count || 0
  const canDrag = mode === 'rearrange'
  const canSelect = mode === 'select'

  const size =
    variant === 'lead'
      ? 'min-w-[200px] px-5 py-3 text-base rounded-xl'
      : variant === 'stream'
        ? 'w-full px-3.5 py-2.5 text-[15px] rounded-lg'
        : 'w-full px-3.5 py-2.5 text-sm rounded-lg'

  return (
    <button
      type="button"
      data-no-pan
      data-node-id={node.id}
      draggable={canDrag}
      onDragStart={(e) => {
        if (!canDrag) return
        e.dataTransfer.setData(DRAG_MIME, node.id)
        e.dataTransfer.setData('text/plain', node.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStartNode?.(node, e)
      }}
      onDragOver={(e) => {
        if (mode !== 'rearrange') return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOverNode?.(node, e)
      }}
      onDragLeave={() => onDragLeaveNode?.()}
      onDrop={(e) => {
        if (mode !== 'rearrange') return
        e.preventDefault()
        e.stopPropagation()
        onDropOnNode?.(node, e)
      }}
      onClick={(e) => {
        if (!canSelect) return
        onSelectNode(node, e.currentTarget.getBoundingClientRect())
      }}
      className={`group relative inline-flex max-w-full items-center justify-center gap-2 border-2 font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${size} ${
        canDrag ? 'cursor-grab active:cursor-grabbing' : canSelect ? 'cursor-pointer hover:brightness-[0.98]' : 'cursor-default'
      } ${dropHighlight ? 'ring-2 ring-amber-400 ring-offset-2' : ''} ${
        focused ? 'z-20 scale-[1.04] transition-transform duration-150 ease-out motion-reduce:scale-100 motion-reduce:transition-none' : ''
      } ${dimmed ? 'pointer-events-none opacity-[0.08] grayscale-[0.45] motion-reduce:opacity-20' : ''}`}
      style={{
        background: hexToRgba(color, variant === 'stream' ? 0.22 : 0.14),
        borderColor: dropHighlight ? '#F59E0B' : color,
        boxShadow: focused
          ? `0 0 0 4px ${hexToRgba(color, 0.4)}, 0 14px 28px ${hexToRgba(color, 0.28)}`
          : selected
            ? `0 0 0 3px ${hexToRgba(color, 0.35)}`
            : undefined,
      }}
    >
      <span className="min-w-0 truncate leading-snug">{node.name}</span>
      {showCounts && (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
          style={{ background: color }}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function DropSlot({
  active,
  onDragOver,
  onDrop,
}: {
  active: boolean
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  if (!active) return null
  return (
    <li
      className="list-none"
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOver(e)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDrop(e)
      }}
    >
      <div className="my-0.5 h-1.5 rounded-full border border-dashed border-amber-400 bg-amber-100/80" />
    </li>
  )
}

function StreamColumn({
  stream,
  showCounts,
  selectedId,
  focusedId,
  mode = 'select',
  dropTargetId,
  focusOverlay,
  onSelectNode,
  onDragStartNode,
  onDragOverNode,
  onDropOnNode,
  onDragLeaveNode,
  onDropBefore,
}: {
  stream: OrgNode
  showCounts: boolean
  selectedId?: string | null
  focusedId?: string | null
  focusOverlay?: FocusOverlay | null
  mode?: ChartMode
  dropTargetId?: string | null
  onSelectNode: Props['onSelectNode']
  onDragStartNode?: (node: OrgNode, e: React.DragEvent) => void
  onDragOverNode?: (node: OrgNode, e: React.DragEvent) => void
  onDropOnNode?: (node: OrgNode, e: React.DragEvent) => void
  onDragLeaveNode?: () => void
  onDropBefore?: (parentId: string, beforeId: string | null, e: React.DragEvent) => void
}) {
  const color = stream.color || '#64748B'
  const children = stream.children || []
  const rearrange = mode === 'rearrange'
  const dimming = Boolean(focusedId)

  return (
    <div
      className="flex min-w-0 flex-col rounded-lg border-2 p-2"
      style={{
        borderColor: hexToRgba(color, dimming && focusedId && !subtreeContains(stream, focusedId) ? 0.12 : 0.45),
        background:
          dimming && focusedId && !subtreeContains(stream, focusedId)
            ? `linear-gradient(180deg, ${hexToRgba(color, 0.04)} 0%, rgba(255,255,255,0.35) 42%)`
            : `linear-gradient(180deg, ${hexToRgba(color, 0.12)} 0%, #fff 42%)`,
        // Không dùng opacity trên container — tránh làm mờ card list (con của cột)
        opacity: 1,
      }}
      onDragOver={
        rearrange
          ? (e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }
          : undefined
      }
      onDrop={
        rearrange
          ? (e) => {
              e.preventDefault()
              onDropBefore?.(stream.id, null, e)
            }
          : undefined
      }
    >
      <FocusWrap node={stream} focused={focusedId === stream.id} overlay={focusOverlay} className="w-full">
        <NodeCard
          node={stream}
          variant="stream"
          mode={mode}
          showCounts={showCounts}
          selected={selectedId === stream.id}
          focused={focusedId === stream.id}
          dimmed={dimming && focusedId !== stream.id}
          dropHighlight={dropTargetId === stream.id}
          onSelectNode={onSelectNode}
          onDragStartNode={onDragStartNode}
          onDragOverNode={onDragOverNode}
          onDropOnNode={onDropOnNode}
          onDragLeaveNode={onDragLeaveNode}
        />
      </FocusWrap>

      {(children.length > 0 || rearrange) && (
        <ul
          className="relative mt-0 ml-1.5 list-none space-y-2 border-l-[2.5px] pt-2 pl-3"
          style={{ borderColor: color }}
        >
          {children.map((child, idx) => {
            const isLast = idx === children.length - 1
            return (
              <li key={child.id} className="relative min-w-0">
                <DropSlot
                  active={rearrange}
                  onDragOver={() => {}}
                  onDrop={(e) => onDropBefore?.(stream.id, child.id, e)}
                />
                <span
                  className="pointer-events-none absolute top-1/2 -left-[13px] h-[2.5px] w-3 -translate-y-1/2"
                  style={{ background: color }}
                  aria-hidden
                />
                {isLast && (
                  <span
                    className="pointer-events-none absolute top-1/2 bottom-0 -left-[13px] w-[2.5px] bg-white"
                    aria-hidden
                  />
                )}
                <FocusWrap node={child} focused={focusedId === child.id} overlay={focusOverlay} className="w-full">
                  <NodeCard
                    node={child}
                    variant="dept"
                    mode={mode}
                    showCounts={showCounts}
                    selected={selectedId === child.id}
                    focused={focusedId === child.id}
                    dimmed={dimming && focusedId !== child.id}
                    dropHighlight={dropTargetId === child.id}
                    onSelectNode={onSelectNode}
                    onDragStartNode={onDragStartNode}
                    onDragOverNode={onDragOverNode}
                    onDropOnNode={onDropOnNode}
                    onDragLeaveNode={onDragLeaveNode}
                  />
                </FocusWrap>
                {((child.children || []).length > 0 || rearrange) && (
                  <ul
                    className="relative mt-2 ml-2 list-none space-y-1.5 border-l-[2.5px] pl-2.5"
                    style={{ borderColor: hexToRgba(color, 0.45) }}
                  >
                    {(child.children || []).map((grand) => (
                      <li key={grand.id} className="relative">
                        <DropSlot
                          active={rearrange}
                          onDragOver={() => {}}
                          onDrop={(e) => onDropBefore?.(child.id, grand.id, e)}
                        />
                        <span
                          className="pointer-events-none absolute top-1/2 -left-[11px] h-[2.5px] w-2.5 -translate-y-1/2"
                          style={{ background: hexToRgba(color, 0.55) }}
                          aria-hidden
                        />
                        <FocusWrap node={grand} focused={focusedId === grand.id} overlay={focusOverlay} className="w-full">
                          <NodeCard
                            node={grand}
                            variant="dept"
                            mode={mode}
                            showCounts={showCounts}
                            selected={selectedId === grand.id}
                            focused={focusedId === grand.id}
                            dimmed={dimming && focusedId !== grand.id}
                            dropHighlight={dropTargetId === grand.id}
                            onSelectNode={onSelectNode}
                            onDragStartNode={onDragStartNode}
                            onDragOverNode={onDragOverNode}
                            onDropOnNode={onDropOnNode}
                            onDragLeaveNode={onDragLeaveNode}
                          />
                        </FocusWrap>
                      </li>
                    ))}
                    <DropSlot
                      active={rearrange}
                      onDragOver={() => {}}
                      onDrop={(e) => onDropBefore?.(child.id, null, e)}
                    />
                  </ul>
                )}
              </li>
            )
          })}
          <DropSlot
            active={rearrange}
            onDragOver={() => {}}
            onDrop={(e) => onDropBefore?.(stream.id, null, e)}
          />
        </ul>
      )}
    </div>
  )
}

export function OrgChart({
  tree,
  flat,
  showCounts,
  selectedId,
  focusedId,
  focusOverlay,
  mode = 'select',
  onSelectNode,
  onMoveNode,
}: Props) {
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const layout = useMemo(() => {
    const root = tree[0]
    if (!root) return null

    let leadership: OrgNode[] = []
    let streams: OrgNode[] = []

    const walkLead = (node: OrgNode, chain: OrgNode[]) => {
      const next = [...chain, node]
      const kids = node.children || []
      const streamKids = kids.filter((k) => k.node_type === 'stream' || /^Luồng\s*\d/i.test(k.name))
      if (streamKids.length) {
        leadership = next
        streams = streamKids
        return true
      }
      for (const kid of kids) {
        if (walkLead(kid, next)) return true
      }
      if (!kids.length) {
        leadership = next
        streams = []
        return true
      }
      return false
    }

    walkLead(root, [])
    if (!leadership.length) {
      leadership = [root]
      streams = root.children || []
    }

    return { leadership, streams }
  }, [tree])

  const byId = useMemo(() => new Map(flat.map((n) => [n.id, n])), [flat])

  function readDragId(e: React.DragEvent) {
    return e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')
  }

  function isDescendant(ancestorId: string, maybeChildId: string) {
    let cur = byId.get(maybeChildId)
    while (cur?.parent_id) {
      if (cur.parent_id === ancestorId) return true
      cur = byId.get(cur.parent_id)
    }
    return false
  }

  function handleDropOnNode(target: OrgNode, e: React.DragEvent) {
    const id = readDragId(e)
    setDropTargetId(null)
    setDraggingId(null)
    if (!id || id === target.id) return
    if (isDescendant(id, target.id)) return
    onMoveNode?.(id, target.id, null)
  }

  function handleDropBefore(parentId: string, beforeId: string | null, e: React.DragEvent) {
    const id = readDragId(e)
    setDropTargetId(null)
    setDraggingId(null)
    if (!id || id === parentId || id === beforeId) return
    if (isDescendant(id, parentId)) return
    onMoveNode?.(id, parentId, beforeId)
  }

  if (!layout) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Chưa có dữ liệu cây tổ chức
      </div>
    )
  }

  const { leadership, streams } = layout
  const colClass = 'grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3'
  const dimming = Boolean(focusedId)
  const dragProps = {
    mode,
    dropTargetId,
    onDragStartNode: (n: OrgNode) => setDraggingId(n.id),
    onDragOverNode: (n: OrgNode) => {
      if (draggingId && draggingId !== n.id) setDropTargetId(n.id)
    },
    onDropOnNode: handleDropOnNode,
    onDragLeaveNode: () => setDropTargetId(null),
    onDropBefore: handleDropBefore,
  }

  return (
    <div
      className={`mx-auto w-full max-w-full rounded-xl shadow-sm ${
        focusedId ? 'bg-white' : 'bg-white/90'
      }`}
      onDragEnd={() => {
        setDraggingId(null)
        setDropTargetId(null)
      }}
    >
      <div className="flex flex-col items-stretch">
        <div
          className="flex flex-col items-center rounded-t-lg px-2 pt-2 pb-0"
          style={{
            background:
              dimming && focusedId && !leadership.some((n) => n.id === focusedId)
                ? 'rgba(240,249,255,0.35)'
                : 'rgba(240,249,255,0.8)',
            opacity: 1,
          }}
        >
          <p
            className={`mb-2 text-[11px] font-semibold tracking-wide uppercase ${
              dimming && focusedId && !leadership.some((n) => n.id === focusedId)
                ? 'text-sky-700/40'
                : 'text-sky-700'
            }`}
          >
            Cấp lãnh đạo
          </p>
          {leadership.map((node, idx) => (
            <div key={node.id} className="flex flex-col items-center">
              {idx > 0 && (
                <div className="h-3.5 w-0.5 shrink-0" style={{ background: LINE }} aria-hidden />
              )}
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-medium text-slate-400">Cấp {idx + 1}</span>
                <FocusWrap node={node} focused={focusedId === node.id} overlay={focusOverlay}>
                  <NodeCard
                    node={node}
                    variant="lead"
                    mode={mode}
                    showCounts={showCounts}
                    selected={selectedId === node.id}
                    focused={focusedId === node.id}
                    dimmed={dimming && focusedId !== node.id}
                    dropHighlight={dropTargetId === node.id}
                    onSelectNode={onSelectNode}
                    onDragStartNode={dragProps.onDragStartNode}
                    onDragOverNode={dragProps.onDragOverNode}
                    onDropOnNode={dragProps.onDropOnNode}
                    onDragLeaveNode={dragProps.onDragLeaveNode}
                  />
                </FocusWrap>
              </div>
            </div>
          ))}
          {streams.length > 0 && (
            <div className="relative z-10 -mb-px h-3 w-0.5 shrink-0" style={{ background: LINE }} aria-hidden />
          )}
        </div>

        {streams.length > 0 && (
          <div className="flex flex-col rounded-b-lg bg-sky-50/40 px-1 pb-2 sm:px-2">
            <ForkConnector streamCount={streams.length} />
            <div className={colClass}>
              {streams.map((stream) => (
                <div key={stream.id} className="relative z-10 flex min-w-0 flex-col items-stretch">
                  <StreamColumn
                    stream={stream}
                    showCounts={showCounts}
                    selectedId={selectedId}
                    focusedId={focusedId}
                    focusOverlay={focusOverlay}
                    onSelectNode={onSelectNode}
                    {...dragProps}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
