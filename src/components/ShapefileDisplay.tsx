import { useState } from 'react'
import type { GISDataset } from '../types'
import { bundleShapefiles } from '../lib/shapefile'
import './SidePanel.css'

interface ShapefileDisplayProps {
  gisDatasets: GISDataset[]
  loading: boolean
  pending: string[]
  error: string | null
  onToggleDataset: (id: string) => void
}

// Lists every loaded GIS dataset with a map show/hide toggle. Visible datasets
// double as the download selection: "Download visible" bundles them into one
// shapefile .zip (one folder per dataset) so the browser sees a single download.
function ShapefileDisplay({ gisDatasets, loading, pending, error, onToggleDataset }: ShapefileDisplayProps) {
  const [bundling, setBundling] = useState(false)
  const [bundleError, setBundleError] = useState<string | null>(null)

  const visibleDatasets = gisDatasets.filter((d) => d.visibile)

  const handleDownloadVisible = async () => {
    if (visibleDatasets.length === 0 || bundling) return
    setBundling(true)
    setBundleError(null)
    try {
      const blob = await bundleShapefiles(visibleDatasets)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'shapefiles.zip'
      link.click()
      // Keep the URL alive briefly so the download can start before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setBundleError(err instanceof Error ? err.message : 'Failed to build download')
    } finally {
      setBundling(false)
    }
  }

  return (
    <div>
      {loading && pending.length === 0 && <p className="status">Searching for GIS datasets…</p>}
      {pending.map((id) => (
        <p key={id} className="status">
          Loading {id}…
        </p>
      ))}
      {gisDatasets.length > 0 && (
        <div className="shp-download-bar">
          <button
            type="button"
            className="shp-download-all"
            disabled={visibleDatasets.length === 0 || bundling}
            onClick={handleDownloadVisible}
          >
            {bundling ? 'Preparing…' : `Download visible (${visibleDatasets.length})`}
          </button>
        </div>
      )}
      {error && <p className="status error">{error}</p>}
      {bundleError && <p className="status error">{bundleError}</p>}
      {!loading && !error && gisDatasets.length === 0 && (
        <p className="status">No shapefile datasets found for this area.</p>
      )}

      

      <ul className="item-list">
        {gisDatasets.map((dataset) => (
          <li key={dataset.id}>
            <button
              type="button"
              className="shpToggle"
              style={{ backgroundColor: dataset.visibile ? 'rgb(58, 58, 141)' : ' #aa3bff' }}
              onClick={() => onToggleDataset(dataset.id)}
            >
              {dataset.visibile ? 'Hide on map' : 'Show on map'}
            </button>

            <p className="item-title">{dataset.id}</p>
            {dataset.wkid !== undefined && <p className="item-meta">Source projection: WKID {dataset.wkid}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default ShapefileDisplay
