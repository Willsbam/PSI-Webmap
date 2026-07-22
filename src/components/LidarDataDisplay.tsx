import { useEffect, useRef } from 'react'
import type { TnmItem } from '../lib/types'
import './SidePanel.css'
import { formatBytes } from '../lib/utils'

interface LidarPanelProps {
  items: TnmItem[]
  total: number | null
  loading: number
  error: string | null
  selectedItemId: string | null
  onSelectItem: (id: string) => void
}

function LidarData({ items, total, loading, error, selectedItemId, onSelectItem }: LidarPanelProps) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>())

  useEffect(() => {
    if (!selectedItemId) return
    itemRefs.current.get(selectedItemId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedItemId])

  return (
    <div>
      {loading===1 && (
        <p className="status">
          {total === null ? 'Searching The National Map…' : `Loading ${items.length} of ${total}…`}
        </p>
      )}
      {error && (<>
 <p className="status error">{error}</p>
        <p className="status error">Please try:</p>
        <ul className="status error">
          <li>Retrying the request</li>
          <li>Drawing a smaller polygon</li>
        </ul>
      </>
       
      )}
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
    </div> 
  )
}
export default LidarData
