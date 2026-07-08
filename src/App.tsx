import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import WebMap from './components/WebMap'
import SidePanel from './components/SidePanel'
import type { GISDataset, TnmItem } from './types'
import * as nwf from './lib/nwf'
function App() {
  //Networking is all handled at this top app level
  const [points, setPoints] = useState<LatLngTuple[]>([])
  const [items, setItems] = useState<TnmItem[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [gisDatasets, setGisDatasets] = useState<GISDataset[]>([])
  // GIS/shapefile errors are kept separate from `error` (which is TNM/Lidar) so
  // they surface under the Shapefiles tab rather than the Lidar tab.
  const [gisError, setGisError] = useState<string | null>(null)
  // The GIS fetch runs after the TNM loop, so it needs its own loading flag —
  // loadState (TNM/Lidar) reaching 2 doesn't mean the GIS datasets are in yet.
  const [gisLoading, setGisLoading] = useState(false)
  // react-leaflet's <GeoJSON> doesn't diff `data` after mount, so bump this on
  // each fetch to force a remount with the new coverage.
  const [gisKey, setGisKey] = useState(0)
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
    setGisDatasets([])
    setGisError(null)
    setGisLoading(false)
  }

  const processSelection = useCallback(async () => 
    {
    if (points.length < 3) return

    const polygon = points.map(([lat, lng]) => `${lng} ${lat}`).join(',')

    setItems([])
    setTotal(null)
    loadState.current = 1
    setError(null)
    setGisError(null)
    setGisLoading(true)
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

    //Every dataset registered in nwf.GIS_DATASETS is fetched for the AOI and
    //drawn as a GeoJSON overlay by WebMap
    const { datasets, errors } = await nwf.fetchGISDatasets(points)
    setGisDatasets(datasets)
    setGisKey((k) => k + 1)
    if (errors.length) setGisError(errors.join('; '))
    setGisLoading(false)
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
        gisDatasets={gisDatasets}
        gisKey={gisKey}
      />
      {panelOpen && (
        <SidePanel
          items={items}
          total={total}
          loading={loadState.current}
          error={error}
          gisDatasets={gisDatasets}
          gisError={gisError}
          gisLoading={gisLoading}
          selectedItemId={selectedItemId}
          onSelectItem={handleSelectItem}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </>
  )
}

export default App
