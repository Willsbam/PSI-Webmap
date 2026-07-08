//nwf networking functions

import type { LatLngTuple } from 'leaflet'
import type { FeatureCollection } from 'geojson'
import type { GISDataset, GISDatasetDef, TnmItem } from '../types'

interface FirmFeature {
  attributes: {
    FIRM_PAN: string
  }
}

export const MAX_RETRIES = 5
export const REQUEST_TIMEOUT_MS = 10000
export const MAX_RETURN = 1000


async function getFirmPanel(lat: number, lon: number): Promise<string> {
  const url = new URL(
    'https://hazards.fema.gov/arcgis/rest/services/MapSearch/MapSearch_v5/MapServer/0/query',
  )
  url.search = new URLSearchParams({
    f: 'json',
    geometry: JSON.stringify({ x: lon, y: lat }),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    where: '1=1',
    outFields: 'FIRM_PAN',
  }).toString()

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`FIRM lookup failed: ${res.status}`)
  const data = (await res.json()) as { features: FirmFeature[] }

  if (!data.features?.length) throw new Error('No FEMA flood map found at this location')
  return data.features[0].attributes.FIRM_PAN
}

function getFirmURL(panelId: string): string {
  const url = new URL('https://msc.fema.gov/portal/downloadProduct')
  url.search = new URLSearchParams({
    productTypeID: 'FINAL_PRODUCT',
    productSubTypeID: 'FIRM_PANEL',
    productID: panelId,
  }).toString()
  
  return url.toString()
}

export async function fetchAndDownloadFirm(lat: number, lon: number): Promise<string> {
  const panel = await getFirmPanel(lat, lon)
  return getFirmURL(panel)
}

//URL Building and fetching functions for The National Map API
export async function fetchWithTimeout(url: string, timeoutMs: number) {
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
export function buildProductsUrl(polygon: string, offset: number) {
  return (
    'https://tnmaccess.nationalmap.gov/api/v1/products' +
    `?polygon=${encodeURIComponent(polygon)}` +
    `&datasets=${encodeURIComponent('Lidar Point Cloud (LPC)')}` +
    `&max=${MAX_RETURN}` +
    `&offset=${offset}` +
    `&outputFormat=JSON`
  )
}

export async function fetchProductsBatch(url: string): Promise<{ total: number; items: TnmItem[] }> {
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



// Esri's `rings` format is orientation-sensitive: a clockwise ring is an
// exterior boundary, a counter-clockwise one is a hole. The user can trace the
// perimeter either way, so normalize to clockwise before sending. Shoelace
// signed area is positive for a counter-clockwise ring in [lng, lat] space;
// reverse those so FEMA always sees a valid outer ring.
export function toClockwiseRing(coords: number[][]): number[][] {
  let area = 0
  for (let i = 0; i < coords.length; i += 1) {
    const [x1, y1] = coords[i]
    const [x2, y2] = coords[(i + 1) % coords.length]
    area += x1 * y2 - x2 * y1
  }
  return area > 0 ? [...coords].reverse() : coords
}

// AOI [lat, lng] points -> URL-encoded Esri `rings` geometry (clockwise, closed).
export function buildAoiGeometry(points: LatLngTuple[]): string {
  let ring = toClockwiseRing(points.map(([lat, lng]) => [lng, lat]))

  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring = [...ring, first]
  }

  return encodeURIComponent(
    JSON.stringify({
      rings: [ring],
      spatialReference: { wkid: 4326 },
    }),
  )
}

// Registry of GeoJSON overlays drawn for the user's AOI. To add a new dataset,
// append an entry: `buildUrl` receives the AOI as an encoded Esri polygon and
// must return a URL whose response is GeoJSON. Fetching, state, and map
// rendering are handled automatically from there.
export const GIS_DATASETS: GISDatasetDef[] = [
  {
    id: 'fema-flood-hazard',
    style: { color: '#2563eb', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.3 },
    buildUrl: (geometry) =>
      'https://hazards.fema.gov/arcgis/rest/services/public/NFHLWMS/MapServer/28/query' +
      `?geometry=${geometry}&geometryType=esriGeometryPolygon&inSR=4326&outFields=*&returnGeometry=true&f=geoJSON`,
  },
]

// Fetches every registered dataset for the AOI. One dataset failing doesn't
// block the others; failures are reported via the returned `errors`.
export async function fetchGISDatasets(
  points: LatLngTuple[],
): Promise<{ datasets: GISDataset[]; errors: string[] }> {
  const geometry = buildAoiGeometry(points)

  const results = await Promise.allSettled(
    GIS_DATASETS.map(async (def): Promise<GISDataset> => {
      const res = await fetchWithTimeout(def.buildUrl(geometry), REQUEST_TIMEOUT_MS)
      if (!res.ok) throw new Error(`${def.id} request failed: ${res.status}`)
      const data = (await res.json()) as FeatureCollection
      return { id: def.id, style: def.style, data }
    }),
  )

  const datasets: GISDataset[] = []
  const errors: string[] = []
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') datasets.push(result.value)
    else errors.push(`${GIS_DATASETS[i].id}: ${result.reason instanceof Error ? result.reason.message : 'request failed'}`)
  })
  return { datasets, errors }
}

