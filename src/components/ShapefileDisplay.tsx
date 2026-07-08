import { useEffect, useState } from 'react'
import * as shpwrite from '@mapbox/shp-write'
import type { GISDataset } from '../types'
import './SidePanel.css'

interface ShapefileDisplayProps {
  gisDatasets: GISDataset[]
  loading: boolean
  error: string | null
}

// Renders a downloadable shapefile (.zip) per GIS dataset. Zipping is generic:
// any GISDataset registered in nwf.GIS_DATASETS flows through here unchanged.
function ShapefileDisplay({ gisDatasets, loading, error }: ShapefileDisplayProps) {
  const [shapefiles, setShapefiles] = useState<{ id: string; url: string }[]>([])
  const [zipError, setZipError] = useState<string | null>(null)
  const [zipping, setZipping] = useState(false)

  //Zips each dataset into a shapefile blob and exposes it as an object URL.
  useEffect(() => {
    if (gisDatasets.length === 0) {
      setShapefiles([])
      return
    }

    let cancelled = false
    const createdUrls: string[] = []
    setZipping(true)
    setZipError(null)

    ;(async () => {
      try {
        const files: { id: string; url: string }[] = []
        for (const dataset of gisDatasets) {
          const blob = await shpwrite.zip(dataset.data, { outputType: 'blob', compression: 'DEFLATE' })
          const url = URL.createObjectURL(blob)
          createdUrls.push(url)
          files.push({ id: dataset.id, url })
        }
        if (!cancelled) setShapefiles(files)
      } catch (err) {
        if (!cancelled) setZipError(err instanceof Error ? err.message : 'Failed to generate shapefile')
      } finally {
        if (!cancelled) setZipping(false)
      }
    })()

    // Revoke on the next run (dataset change) and on unmount, so object URLs
    // don't leak once their <a href> is no longer reachable.
    return () => {
      cancelled = true
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [gisDatasets])

  return (
    <div>
      {loading && <p className="status">Searching for GIS datasets…</p>}
      {error && <p className="status error">{error}</p>}
      {zipError && <p className="status error">{zipError}</p>}
      {zipping && <p className="status">Preparing shapefiles…</p>}
      {!loading && !error && gisDatasets.length === 0 && (
        <p className="status">No shapefile datasets found for this area.</p>
      )}
      <ul className="item-list">
        {shapefiles.map((file) => (
          <li key={file.id}>
            <p className="item-title">{file.id}</p>
            <a href={file.url} download={`${file.id}.zip`}>
              Download shapefile (.zip)
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default ShapefileDisplay
