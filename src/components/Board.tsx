import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  defaultDropAnimationSideEffects,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core'
import { fmtDate, statusClass } from '../lib/format'
import { STATUSES, type Application, type Status } from '../lib/types'
import { NextBadge, PostingBadge, PostingLink } from './Badges'
import { DocBadge } from './DocBadge'
import { CalendarIcon, FlagIcon, PlusIcon } from './Icons'

interface Props {
  /** Applications to show (already search-filtered), in display order */
  apps: Application[]
  onOpen: (app: Application) => void
  onMove: (app: Application, status: Status) => void
  /** Add a new application straight into a column */
  onNew?: (status: Status) => void
}

// Prefer the column under the pointer; fall back to overlap (keyboard dragging has no pointer)
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length ? hits : rectIntersection(args)
}

// Arrow keys jump a whole column at a time instead of nudging 25px
const columnJump: KeyboardCoordinateGetter = (event, { context: { active, over, droppableRects } }) => {
  const dir = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[event.code]
  if (!dir) return undefined
  event.preventDefault()
  const from = (over?.id ?? (active?.data.current as { app: Application } | undefined)?.app.status) as Status
  const i = STATUSES.indexOf(from)
  const target = STATUSES[Math.min(STATUSES.length - 1, Math.max(0, i + dir))]
  const rect = droppableRects.get(target)
  return rect ? { x: rect.left + 12, y: rect.top + 44 } : undefined
}

const dropAnimation: DropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0' } } }),
}

function CardBody({ app }: { app: Application }) {
  return (
    <>
      <span className="job-head-text">
        <strong className="job-title">{app.name}</strong>
        {app.company && <span className="job-company">{app.company}</span>}
      </span>
      <NextBadge app={app} />
      <PostingBadge app={app} />
      <span className="job-meta">
        <span className="job-meta-left">
          <span className="job-date">
            <CalendarIcon size={12} />
            {fmtDate(app.applied_on)}
          </span>
          <DocBadge appId={app.id} />
          <PostingLink app={app} />
        </span>
        {app.priority && (
          <span className={`priority priority-chip priority-${app.priority.toLowerCase()}`}>
            <FlagIcon size={11} />
            {app.priority}
          </span>
        )}
      </span>
    </>
  )
}

function DraggableCard({ app, leaving, onOpen }: { app: Application; leaving: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id, data: { app } })
  return (
    <article
      ref={setNodeRef}
      className={`job-card${isDragging ? ' is-source' : ''}${leaving ? ' is-leaving' : ''}`}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable application"
      onClick={onOpen}
      onKeyDown={(e: KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter' && !isDragging) onOpen()
        listeners?.onKeyDown?.(e)
      }}
    >
      <CardBody app={app} />
    </article>
  )
}

function Column({
  status,
  apps,
  slotIndex,
  slotHeight,
  isOver,
  activeId,
  leavingId,
  onOpen,
  onNew,
}: {
  status: Status
  apps: Application[]
  slotIndex: number | null // where the dragged card would land, or null
  slotHeight: number
  isOver: boolean
  activeId: string | null
  leavingId: string | null
  onOpen: (app: Application) => void
  onNew?: (status: Status) => void
}) {
  const { setNodeRef } = useDroppable({ id: status })
  const count = apps.length + (slotIndex !== null ? 1 : 0) - (leavingId && apps.some((a) => a.id === leavingId) ? 1 : 0)
  const slot = <div key="__slot" className="drop-slot" style={{ height: slotHeight }} aria-hidden="true" />
  const items = apps.map((a) => (
    <DraggableCard key={a.id} app={a} leaving={a.id === leavingId} onOpen={() => onOpen(a)} />
  ))
  if (slotIndex !== null) items.splice(slotIndex, 0, slot)

  return (
    <section
      ref={setNodeRef}
      className={`column ${statusClass(status)}${isOver ? ' drop' : ''}${count === 0 ? ' empty' : ''}${activeId ? ' dragging' : ''}`}
    >
      <header className="column-head">
        <h3>
          <span className="dot" />
          {status}
        </h3>
        <span className="count" aria-label={`${count} application${count === 1 ? '' : 's'}`}>{count}</span>
        {onNew && (
          <button className="column-add" onClick={() => onNew(status)} aria-label={`Add an application to ${status}`} title={`Add to ${status}`}>
            <PlusIcon size={14} />
          </button>
        )}
      </header>
      {items}
      {count === 0 && <p className="column-empty">{activeId ? 'Drop here' : 'No applications'}</p>}
    </section>
  )
}

/** Kanban board: drag cards between status columns (mouse, touch press-and-hold, or keyboard). */
export default function Board({ apps, onOpen, onMove, onNew }: Props) {
  const [active, setActive] = useState<{ app: Application; height: number } | null>(null)
  const [overStatus, setOverStatus] = useState<Status | null>(null)
  const lastDrop = useRef(0)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), // small move = drag, otherwise it's a click
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), // press-and-hold; swipes still scroll
    useSensor(KeyboardSensor, {
      coordinateGetter: columnJump,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  )

  const byStatus = useMemo(() => {
    const groups = Object.fromEntries(STATUSES.map((s) => [s, [] as Application[]])) as Record<Status, Application[]>
    apps.forEach((a) => groups[a.status].push(a))
    return groups
  }, [apps])

  // Where the dragged card would appear in the target column: same order as after the move
  const slotIndexFor = (status: Status): number | null => {
    if (!active || overStatus !== status || active.app.status === status) return null
    const order = new Map(apps.map((a, i) => [a.id, i]))
    const mine = order.get(active.app.id) ?? Infinity
    return byStatus[status].filter((a) => (order.get(a.id) ?? 0) < mine).length
  }

  const name = (id: unknown) => apps.find((a) => a.id === id)?.name ?? 'application'
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${name(active.id)}. Use the arrow keys to choose a column, Space to drop, Escape to cancel.`,
    onDragOver: ({ active, over }) => (over ? `${name(active.id)} is over ${over.id}.` : `${name(active.id)} is not over a column.`),
    onDragEnd: ({ active, over }) => (over ? `Moved ${name(active.id)} to ${over.id}.` : `${name(active.id)} was dropped.`),
    onDragCancel: ({ active }) => `Cancelled. ${name(active.id)} was not moved.`,
  }

  function onDragStart(e: DragStartEvent) {
    const app = (e.active.data.current as { app: Application }).app
    setActive({ app, height: e.active.rect.current.initial?.height ?? 90 })
    setOverStatus(app.status)
    document.body.classList.add('is-dragging')
  }

  function onDragOver(e: DragOverEvent) {
    setOverStatus((e.over?.id as Status | undefined) ?? null)
  }

  function finish() {
    setActive(null)
    setOverStatus(null)
    lastDrop.current = Date.now()
    document.body.classList.remove('is-dragging')
  }

  function onDragEnd(e: DragEndEvent) {
    const target = e.over?.id as Status | undefined
    if (active && target && target !== active.app.status) onMove(active.app, target) // optimistic in parent
    finish()
  }

  // Ignore the click the browser fires right after a mouse drag ends
  const open = (app: Application) => {
    if (Date.now() - lastDrop.current > 250) onOpen(app)
  }

  const leavingId = active && overStatus && overStatus !== active.app.status ? active.app.id : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Press Enter to open this application. To move it to another status, press Space, use the arrow keys to choose a column, then press Space again.',
        },
      }}
    >
      <div className="board">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            apps={byStatus[status]}
            slotIndex={slotIndexFor(status)}
            slotHeight={active?.height ?? 0}
            isOver={Boolean(active) && overStatus === status}
            activeId={active?.app.id ?? null}
            leavingId={leavingId}
            onOpen={open}
            onNew={onNew}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={dropAnimation}>
        {active && (
          <article className="job-card drag-lift">
            <CardBody app={active.app} />
          </article>
        )}
      </DragOverlay>
    </DndContext>
  )
}
