import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { LatLngTuple } from 'leaflet'
import { firstPolygonRing, kmzToFeatureCollection } from '../lib/kmz'
import './KmzUploader.css'

interface KmzUploaderProps {
  onLoadPolygon: (points: LatLngTuple[]) => void
}

function KmzUploader({ onLoadPolygon }: KmzUploaderProps) {
  const map = useMap()
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Sitting on top of the map, so stop clicks/scrolls from reaching Leaflet
  // (otherwise a click here would drop an AOI point). Mirrors SearchBar.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    L.DomEvent.disableClickPropagation(el)
    L.DomEvent.disableScrollPropagation(el)
  }, [])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return

    setLoading(true)
    setError(null)
    try {
      const fc = await kmzToFeatureCollection(file)
      const ring = firstPolygonRing(fc)
      onLoadPolygon(ring)
      map.flyToBounds(ring, { padding: [40, 40] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load KMZ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="kmz-uploader" ref={containerRef}>
      <label className="kmz-button">
        {loading ? 'Loading…' : 'Load AOI from KMZ'}
        <input type="file" accept=".kmz,.kml" onChange={handleFile} hidden disabled={loading} />
      </label>
      {error && <div className="kmz-error">{error}</div>}
    </div>
  )
}

export default KmzUploader
