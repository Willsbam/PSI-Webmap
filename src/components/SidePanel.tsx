import { useEffect, useRef, useState } from 'react'
import type { GISDataset, TnmItem } from '../types'
import './SidePanel.css'
import LidarData from './LidarDataDisplay'
import ShapefileDisplay from './ShapefileDisplay'


interface SidePanelProps {
  items: TnmItem[]
  total: number | null
  loading: number
  error: string | null
  gisDatasets: GISDataset[]
  gisError: string | null
  gisLoading: boolean
  selectedItemId: string | null
  onSelectItem: (id: string) => void
  onClose: () => void
}

function SidePanel({ items, total, loading, error, gisDatasets, gisError, gisLoading, selectedItemId, onSelectItem, onClose }: SidePanelProps) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>())

  const [dataDisplay, setDataDisplay] = useState<'lidar' | 'shapefiles'>('lidar')

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
      <div className="side-panel-tabs">
          <button className="selection-buttons" style={{backgroundColor: dataDisplay === 'lidar' ? 'rgb(58, 58, 141)' : 'rgb(94, 94, 212)'}} onClick={() => setDataDisplay('lidar')}>
            Lidar
          </button>
          <button className="selection-buttons" style={{backgroundColor: dataDisplay === 'shapefiles' ? 'rgb(58, 58, 141)' : 'rgb(94, 94, 212)'}} onClick={() => setDataDisplay('shapefiles')}>
            Shapefiles
          </button>

      </div>
      {dataDisplay === 'lidar' && (
        <div>
          <LidarData
            items={items}
            total={total}
            loading={loading}
            error={error}
            selectedItemId={selectedItemId}
            onSelectItem={onSelectItem}
          />
        </div>
      )}

      {dataDisplay === 'shapefiles' && (
        <div>
          <ShapefileDisplay gisDatasets={gisDatasets} loading={gisLoading} error={gisError} />
        </div>
      )}
    </aside>
  )
}

export default SidePanel
