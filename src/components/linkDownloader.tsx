import { useEffect, useRef, useState } from 'react'
import { Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { LatLngTuple } from 'leaflet'
import { fetchAndDownloadFirm } from '../lib/firm'
import './linkDownloader.css'

type FirmStatus = 'idle' | 'loading' | 'error'

const redPinIcon = L.divIcon({
  className: 'firm-pin',
  html: `<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20c0-6.627-5.373-12-12-12z" fill="#e0303e" stroke="#8a1c26" stroke-width="1"/>
    <circle cx="12" cy="12" r="4.5" fill="#fff"/>
  </svg>`,
  iconSize: [24, 32],
  iconAnchor: [12, 32],
})

function LinkDownloader() {
  const [status, setStatus] = useState<FirmStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [firmURL, setFirmURL] = useState<string | null>(null)
  const [point, setPoint] = useState<LatLngTuple | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    L.DomEvent.disableClickPropagation(el)
    L.DomEvent.disableScrollPropagation(el)
  }, [])

  useMapEvents({
    async contextmenu(e) {
      setPoint([e.latlng.lat, e.latlng.lng])
      setStatus('loading')
      setError(null)
      try {
        const firmURL = await fetchAndDownloadFirm(e.latlng.lat, e.latlng.lng)
        setFirmURL(firmURL)

      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Failed to download flood map')
      }
      setStatus('idle')
    },
  })

  return (
    <>
    {point && <Marker position={point} icon={redPinIcon} />}
    <div className="firm-status" ref={containerRef}>

      {status === 'loading' && <div className="hint">Fetching data</div>}
      {status === 'error' && <div className="hint error">{error}</div>}

      {status === 'idle' && firmURL ? (
        <div className="hint muted">Available downloads for the selected point:
          <ul className="hint-list">
            <a href={firmURL} target="_blank" rel="noreferrer">
              FEMA Flood Map
            </a>
          </ul> 
        </div>
      )
      :
      <div className="hint muted">Right-click the map to download supported point data:
          <ul className="hint-list">
            FEMA Flood Map
          </ul> 
        </div>
      }

    </div>
    </>
  )
}

export default LinkDownloader
