import { GeoJSON, MapContainer, Polygon, TileLayer, useMapEvents } from 'react-leaflet'
import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GISDataset, TnmItem } from '../types'
import SearchBar from './SearchBar'
import ResultsLayer from './ResultsLayer'
import LinkDownloader from './linkDownloader'
import './WebMap.css'


const US_BOUNDS: LatLngBoundsExpression = [
  [15, -170],
  [72, -50],
]


interface PolygonDrawerProps {
  points: LatLngTuple[]
  onAddPoint: (point: LatLngTuple) => void
  dataLoaded: boolean
}

function PolygonDrawer({ points, onAddPoint, dataLoaded }: PolygonDrawerProps) {
  useMapEvents({
    click(e) {
      //Basically you shouldn't be able to add points if data is already loaded,
      //Should wait for data to clear
      if (dataLoaded) return
      onAddPoint([e.latlng.lat, e.latlng.lng])
    },
  })

  if (points.length < 2) return null

  return <Polygon positions={points} pathOptions={{ color: '#aa3bff', weight: 2, fillOpacity: 0.15 }} />
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
}

function WebMap({points,items,selectedItemId,onAddPoint,onReset,onSelectItem,gisDatasets,gisKey,showLidar,}: WebMapProps) {
  return (
    <div id="map-shell">
      <MapContainer
        center={[39.8283, -98.5795]}
        zoom={4}
        minZoom={3}
        maxBounds={US_BOUNDS}
        maxBoundsViscosity={1.0}
        className="map"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <SearchBar />
        <PolygonDrawer points={points} onAddPoint={onAddPoint} dataLoaded={items.length > 0} />
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
          {points.length >= 3 && <div className="hint">Press Enter to search this area</div>}
        </div>
      )}
    </div>
  )
}

export default WebMap
