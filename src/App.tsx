import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import type { FeatureCollection } from 'geojson'
import WebMap from './components/WebMap'
import SidePanel from './components/SidePanel'
import type { TnmItem } from './types'
import * as nwf from './lib/nwf'
function App() {
  //Networking is all handled at this top app level
  const [points, setPoints] = useState<LatLngTuple[]>([])
  const [items, setItems] = useState<TnmItem[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [floodCoordinates, setFloodCoordinates] = useState<FeatureCollection | null>(null)
  const [floodKey, setFloodKey] = useState(0)
  //0 -  nothing loaded, 1 loading, 2 - loaded,
  const loadState = useRef(0)

  const handleAddPoint = useCallback((point: LatLngTuple) => {
    setPoints((prev) => [...prev, point])
  }, [])

  const handleSelectItem = useCallback((id: string) => {
    setSelectedItemId((prev) => (prev === id ? null : id))
  }, [])

  const handleReset = () => {
    loadState.current = 0
    setPoints([])
    setItems([])
    setTotal(null)
    setError(null)
    setPanelOpen(false)
    setSelectedItemId(null)
    setFloodCoordinates(null)
  }

  const processSelection = useCallback(async () => 
    {
    if (points.length < 3) return

    const polygon = points.map(([lat, lng]) => `${lng} ${lat}`).join(',')

    setItems([])
    setTotal(null)
    loadState.current = 1
    setError(null)
    setPanelOpen(true)
    setSelectedItemId(null)

    let offset = 0
    let remoteTotal = Infinity

    //This is in charge of batching logic for TNM
    //Utilized for Lidar and NAIP imagery
    try {
      
      while (offset < remoteTotal && loadState.current === 1) {
        const data = await nwf.fetchProductsBatch(nwf.buildProductsUrl(polygon, offset))
        //Reason there are two checks for loading is that the var can be set AS loading is set
        //So this could return a batch of data when it shouldn't otherwise
        if(loadState.current !== 1)return
        remoteTotal = data.total
        setTotal(data.total)
        // console.log(data.total)s
        //Expands the previous list with new items
        setItems((prev) => [...prev, ...(data.items ?? [])])
        offset += nwf.MAX_RETURN
      }
      loadState.current = 2
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
      loadState.current = 0

    } 

    let ring = nwf.toClockwiseRing(points.map(([lat, lng]) => [lng, lat]))

    // Close the ring if it isn't already. Compare by coordinate value — the old
    // reference check (loopedPoints[0] != loopedPoints[len-1]) was always true.
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring = [...ring, first]
    }

    const geometry = encodeURIComponent(
      JSON.stringify({
        rings: [ring],
        spatialReference: { wkid: 4326 },
      }),
    )

        const url = `https://hazards.fema.gov/arcgis/rest/services/public/NFHLWMS/MapServer/28/query?geometry=${geometry}&geometryType=esriGeometryPolygon&outFields=*&returnGeometry=true&f=geoJSON`;
        const geoJSON = (await (await nwf.fetchWithTimeout(url, nwf.REQUEST_TIMEOUT_MS)).json()) as FeatureCollection
        setFloodCoordinates(geoJSON)
        setFloodKey((k) => k + 1)



  }, [points])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') processSelection()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [processSelection])

  //Webmap handles the drawing of the polygon and the points,
  //Actual query is handled here, and then data displayed in sidepanel when there is data to displacy
  return (
    <>
      <WebMap
        points={points}
        items={items}
        selectedItemId={selectedItemId}
        onAddPoint={handleAddPoint}
        onReset={handleReset}
        onSelectItem={handleSelectItem}
        floodCoordinates={floodCoordinates}
        floodKey={floodKey}
      />
      {panelOpen && (
        <SidePanel
          items={items}
          total={total}
          loading={loadState.current}
          error={error}
          selectedItemId={selectedItemId}
          onSelectItem={handleSelectItem}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </>
  )
}

export default App
