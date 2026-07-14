import { useEffect, useRef } from 'react'
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
  gisPending: string[]
  onToggleDataset: (id: string) => void
  activeTab: 'lidar' | 'shapefiles'
  onSelectTab: (tab: 'lidar' | 'shapefiles') => void
  selectedItemId: string | null
  onSelectItem: (id: string) => void
  onClose: () => void
}

function SidePanel({ items, total, loading, error, gisDatasets, gisError, gisLoading, gisPending, onToggleDataset, activeTab, onSelectTab, selectedItemId, onSelectItem, onClose }: SidePanelProps) {
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
      <div className="side-panel-tabs">
          <button className="selection-buttons" style={{backgroundColor: activeTab === 'lidar' ? 'rgb(58, 58, 141)' : 'rgb(94, 94, 212)'}} onClick={() => onSelectTab('lidar')}>
            Lidar
          </button>
          <button className="selection-buttons" style={{backgroundColor: activeTab === 'shapefiles' ? 'rgb(58, 58, 141)' : 'rgb(94, 94, 212)'}} onClick={() => onSelectTab('shapefiles')}>
            Shapefiles
          </button>

      </div>
      {activeTab === 'lidar' && (
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

      {activeTab === 'shapefiles' && (
        <div>
          <ShapefileDisplay gisDatasets={gisDatasets} loading={gisLoading} pending={gisPending} error={gisError} onToggleDataset={onToggleDataset} />
        </div>
      )}
    </aside>
  )
}

export default SidePanel
