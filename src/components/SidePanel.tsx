import { useEffect, useRef } from 'react'
import type { TnmItem } from '../types'
import './SidePanel.css'

function formatBytes(bytes: number) {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

interface SidePanelProps {
  items: TnmItem[]
  total: number | null
  loading: number
  error: string | null
  selectedItemId: string | null
  onSelectItem: (id: string) => void
  onClose: () => void
}

function SidePanel({ items, total, loading, error, selectedItemId, onSelectItem, onClose }: SidePanelProps) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>())

  useEffect(() => {
    if (!selectedItemId) return
    itemRefs.current.get(selectedItemId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedItemId])

  return (
    <aside className="side-panel">
      <div className="side-panel-header">
        <h2>Available data</h2>
        <button type="button" className="close" onClick={onClose}>
          ×
        </button>
      </div>

      {loading===1 && (
        <p className="status">
          {total === null ? 'Searching The National Map…' : `Loading ${items.length} of ${total}…`}
        </p>
      )}
      {error && <p className="status error">{error}</p>}
      {loading===2 && !error && items.length === 0 && (
        <p className="status">No datasets found for this area.</p>
      )}
      <ul className="item-list">
        {items.map((item) => (
          <li
            key={item.sourceId}
            ref={(el) => {
              if (el) itemRefs.current.set(item.sourceId, el)
              else itemRefs.current.delete(item.sourceId)
            }}
            className={item.sourceId === selectedItemId ? 'selected' : undefined}
            onClick={() => onSelectItem(item.sourceId)}
          >
            <p className="item-title">{item.title}</p>
            <p className="item-meta">
              {item.format} · {formatBytes(item.sizeInBytes)} · {item.publicationDate}
            </p>
            {item.downloadURL && (
              <a href={item.downloadURL} target="_blank" rel="noreferrer">
                Download
              </a>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}

export default SidePanel
