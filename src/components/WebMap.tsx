import { GeoJSON, MapContainer, Polygon, TileLayer, useMapEvents } from 'react-leaflet'
import type { LatLngBoundsExpression, LatLngTuple, Map as LeafletMap } from 'leaflet'
import type { RefObject } from 'react'
import 'leaflet/dist/leaflet.css'
import type { GISDataset, TnmItem } from '../lib/types'
import ResultsLayer from './ResultsLayer'
import LinkDownloader from './linkDownloader'
import KmzUploader from './KmzUploader'
import './WebMap.css'


const US_BOUNDS: LatLngBoundsExpression = [
  [15, -170],
  [72, -50],
]


interface PolygonDrawerProps {
  points: LatLngTuple[]
  onAddPoint: (point: LatLngTuple) => void
  dataLoaded: boolean
  invalid: boolean
}

function PolygonDrawer({ points, onAddPoint, dataLoaded, invalid }: PolygonDrawerProps) {
  useMapEvents({
    click(e) {
      //Basically you shouldn't be able to add points if data is already loaded,
      //Should wait for data to clear
      if (dataLoaded) return
      onAddPoint([e.latlng.lat, e.latlng.lng])
    },
  })

  if (points.length < 2) return null

  return (
    <Polygon
      positions={points}
      pathOptions={{ color: invalid ? '#c0392b' : '#aa3bff', weight: 2, fillOpacity: 0.15 }}
    />
  )
}

interface WebMapProps {
  points: LatLngTuple[]
  items: TnmItem[]
  selectedItemId: string | null
  onAddPoint: (point: LatLngTuple) => void
  onReset: () => void
  onSelectItem: (id: string) => void
  gisDatasets: GISDataset[]
  gisKey: number
  showLidar: boolean
  onLoadPolygon: (points: LatLngTuple[]) => void
  // Handed up to App so the header's search bar can fly the map from outside
  // the MapContainer, where useMap() isn't available.
  mapRef: RefObject<LeafletMap | null>
  invalidPolygon: boolean
  // Runs the AOI search. Enter still triggers it, but touch devices have no
  // keyboard, so the hint doubles as the tap target.
  onSearch: () => void
}

function WebMap({points,items,selectedItemId,onAddPoint,onReset,onSelectItem,gisDatasets,gisKey,showLidar,onLoadPolygon,mapRef,invalidPolygon,onSearch,}: WebMapProps) {
  return (
    <div id="map-shell">
      <MapContainer
        ref={mapRef}
        center={[39.8283, -98.5795]}
        zoom={4}
        minZoom={3}
        zoomControl={false}
        maxBounds={US_BOUNDS}
        maxBoundsViscosity={1.0}
        className="map"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <KmzUploader onLoadPolygon={onLoadPolygon} />
        <PolygonDrawer points={points} onAddPoint={onAddPoint} dataLoaded={items.length > 0} invalid={invalidPolygon} />
        {showLidar && <ResultsLayer items={items} selectedItemId={selectedItemId} onSelectItem={onSelectItem} />}

        {gisDatasets.map((dataset) =>
          dataset.visibile ? (
            <GeoJSON key={`${dataset.id}:${gisKey}`} data={dataset.data} style={dataset.style} />
          ) : null,
        )}


        <LinkDownloader />
      </MapContainer>

      {points.length > 0 && (
        <div className="controls">
          <button type="button" className="reset" onClick={onReset}>
            Clear polygon ({points.length} point{points.length === 1 ? '' : 's'})
          </button>
          {invalidPolygon ? (
            <div className="hint error">Invalid geometry — please clear and redraw without crossing lines</div>
          ) : (
            points.length >= 3 && (
              <button type="button" className="hint hint-button" onClick={onSearch}>
                {/* Swapped by a CSS media query — narrow screens have no keyboard. */}
                <span className="hint-wide">Press Enter to search this area</span>
                <span className="hint-narrow">Tap to search this area</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

export default WebMap
