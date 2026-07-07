import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import WebMap from './components/WebMap'
import SidePanel from './components/SidePanel'
import type { TnmItem } from './types'

const MAX_RETRIES = 5
const REQUEST_TIMEOUT_MS = 10000
const MAX_RETURN = 1000

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

//https://tnmaccess.nationalmap.gov/api/v1/docs for documentaton
//Note is that API is limited to 10,000 results in one go, putting my own cap if I want to throttle the API a bit more
function buildProductsUrl(polygon: string, offset: number) {
  return (
    'https://tnmaccess.nationalmap.gov/api/v1/products' +
    `?polygon=${encodeURIComponent(polygon)}` +
    `&datasets=${encodeURIComponent('Lidar Point Cloud (LPC)')}` +
    `&max=${MAX_RETURN}` +
    `&offset=${offset}` +
    `&outputFormat=JSON`
  )
}

async function fetchProductsBatch(url: string): Promise<{ total: number; items: TnmItem[] }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS)
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      return await res.json()
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'AbortError'
      if (!timedOut || attempt === MAX_RETRIES) {
        throw timedOut ? new Error(`The National Map API timed out after ${MAX_RETRIES} attempts.`) : err
      }
    }
  }
  throw new Error('Failed to fetch data')
}

function App() {
  //Networking is all handled at this top app level
  const [points, setPoints] = useState<LatLngTuple[]>([])
  const [items, setItems] = useState<TnmItem[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

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
  }

  const queryNationalMap = useCallback(async () => {
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

    //This is in charge of batching logic
    try {
      
      while (offset < remoteTotal && loadState.current === 1) {
        const data = await fetchProductsBatch(buildProductsUrl(polygon, offset))
        //Reason there are two checks for loading is that the var can be set AS loading is set
        //So this could return a batch of data when it shouldn't otherwise
        if(loadState.current !== 1)return
        remoteTotal = data.total
        setTotal(data.total)
        // console.log(data.total)s
        //Expands the previous list with new items
        setItems((prev) => [...prev, ...(data.items ?? [])])
        offset += MAX_RETURN
      }
      loadState.current = 2
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
      loadState.current = 0
    } 
  }, [points])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') queryNationalMap()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [queryNationalMap])

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
