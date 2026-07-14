//nwf networking functions

import type { LatLngTuple } from 'leaflet'
import type { FeatureCollection } from 'geojson'
import type { AoiQuery, GISDataset, GISDatasetDef, TnmItem } from '../types'

// Local GIS backend (PostGIS behind a .NET API). In a deployed app this
// should come from an env var (import.meta.env) instead of a hardcoded host.
const BACKEND_API_URL = 'http://localhost:5017'

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

interface RetryOptions<T> {
  validate: (body: unknown) => T
  label?: string
  timeoutMs?: number
  retries?: number
}

// Shared fetch + retry with linear backoff. `validate` runs on the parsed body
// and MUST throw if it's unusable — critically, ArcGIS commonly returns HTTP 200
// with an `{ error }` payload instead of data on transient failures. Validating
// the body (not just res.ok) is what lets those be retried instead of silently
// passing through as empty/garbage results.
async function fetchJsonWithRetry<T>(url: string, options: RetryOptions<T>): Promise<T> {
  const { validate, label = 'The request', timeoutMs = REQUEST_TIMEOUT_MS, retries = MAX_RETRIES } = options
  let lastErr: unknown
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, timeoutMs)
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      return validate(await res.json())
    } catch (err) {
      lastErr = err
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 300 * attempt))
    }
  }
  if (lastErr instanceof DOMException && lastErr.name === 'AbortError') {
    throw new Error(`${label} timed out after ${retries} attempts.`)
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed`)
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
  return fetchJsonWithRetry(url, {
    label: 'The National Map API',
    validate: (body) => body as { total: number; items: TnmItem[] },
  })
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
    buildUrl: ({ geometry }) =>
      'https://hazards.fema.gov/arcgis/rest/services/public/NFHLWMS/MapServer/28/query' +
      `?geometry=${geometry}&geometryType=esriGeometryPolygon&inSR=4326&outFields=*&returnGeometry=true&f=geoJSON`,
  },
  {
    id: 'plss-state-boundaries',
    style: { color: '#ebd725', weight: 1, fillColor: '#86b926', fillOpacity: 0.3 },
    buildUrl: ({ geometry }) =>
      'https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer/0/query' +
      `?geometry=${geometry}&geometryType=esriGeometryPolygon&inSR=4326&outFields=*&returnGeometry=true&f=geoJSON`,
  },
   {
    id: 'plss-town-boundaries',
    style: { color: '#a79819', weight: 1, fillColor: '#5c8116', fillOpacity: 0.3 },
    buildUrl: ({ geometry }) =>
      'https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer/1/query' +
      `?geometry=${geometry}&geometryType=esriGeometryPolygon&inSR=4326&outFields=*&returnGeometry=true&f=geoJSON`,
  },
   {
    id: 'plss-section-boundaries',
    style: { color: '#267217', weight: 1, fillColor: '#125a30', fillOpacity: 0.3 },
    buildUrl: ({ geometry }) =>
      'https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer/2/query' +
      `?geometry=${geometry}&geometryType=esriGeometryPolygon&inSR=4326&outFields=*&returnGeometry=true&f=geoJSON`,
  },
   {
    id: 'plss-intersected-boundaries',
    style: { color: '#cc8221', weight: 1, fillColor: '#88631d', fillOpacity: 0.3 },
    buildUrl: ({ geometry }) =>
      'https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer/3/query' +
      `?geometry=${geometry}&geometryType=esriGeometryPolygon&inSR=4326&outFields=*&returnGeometry=true&f=geoJSON`,
  },
  {
    id: 'state-boundaries',
    style: { color: '#c40f0f', weight: 1, fillColor: '#4f3609', fillOpacity: 0.3 },
    buildUrl: ({ geometry }) =>
      'https://carto.nationalmap.gov/arcgis/rest/services/govunits/MapServer/2/query' +
      `?geometry=${geometry}&geometryType=esriGeometryPolygon&inSR=4326&outFields=*&returnGeometry=true&f=geoJSON`,
  },
  {
    id: 'county-boundaries',
    style: { color: '#462c0b', weight: 1, fillColor: '#281d09', fillOpacity: 0.3 },
    buildUrl: ({ geometry }) =>
      'https://carto.nationalmap.gov/arcgis/rest/services/govunits/MapServer/23/query' +
      `?geometry=${geometry}&geometryType=esriGeometryPolygon&inSR=4326&outFields=*&returnGeometry=true&f=geoJSON`,
  },
]

interface BackendLayer {
  schema: string
  name: string
  geometryColumn: string
  srid: number
  geometryType: string
}

// Colors assigned to discovered layers, cycled in catalog order. Deterministic
// so a layer keeps its color across searches (as long as the catalog order holds).
const LAYER_PALETTE = ['#d946ef', '#0ea5e9', '#f97316', '#10b981', '#8b5cf6', '#ef4444', '#14b8a6', '#eab308']

function toLayerList(body: unknown): BackendLayer[] {
  if (!Array.isArray(body)) throw new Error('unexpected response (expected a layer list)')
  return body as BackendLayer[]
}

// Discovers every spatial layer in the backend's PostGIS catalog and turns each
// into a dataset definition alongside the static registry. Tables added to the
// database show up here automatically — no frontend changes needed. The
// features endpoint reprojects to 4326 server-side, so any native SRID is fine.
async function discoverBackendLayers(): Promise<GISDatasetDef[]> {
  const layers = await fetchJsonWithRetry(`${BACKEND_API_URL}/api/layers`, {
    label: 'The layer catalog',
    validate: toLayerList,
  })
  return layers.map((layer, i) => {
    const color = LAYER_PALETTE[i % LAYER_PALETTE.length]
    const qualified = `${layer.schema}.${layer.name}`
    return {
      id: layer.schema === 'public' ? layer.name : qualified,
      style: { color, weight: 1, fillColor: color, fillOpacity: 0.3 },
      buildUrl: ({ bbox }) =>
        `${BACKEND_API_URL}/api/layers/${encodeURIComponent(qualified)}/features` +
        `?minLon=${bbox.minLon}&minLat=${bbox.minLat}&maxLon=${bbox.maxLon}&maxLat=${bbox.maxLat}&limit=10000`,
    }
  })
}

// ArcGIS returns HTTP 200 with an `{ error }` body on transient failures, and a
// real FeatureCollection on success. Throwing here (instead of casting) turns
// those error bodies into retryable failures. A genuinely empty area still
// returns a valid FeatureCollection with `features: []`, which passes and is
// therefore NOT retried.
function toFeatureCollection(body: unknown): FeatureCollection {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { message?: string } }).error
    throw new Error(`server error${err?.message ? `: ${err.message}` : ''}`)
  }
  if (
    !body ||
    typeof body !== 'object' ||
    (body as { type?: unknown }).type !== 'FeatureCollection' ||
    !Array.isArray((body as { features?: unknown }).features)
  ) {
    throw new Error('unexpected response (expected a GeoJSON FeatureCollection)')
  }
  return body as FeatureCollection
}

export interface GISDatasetHandlers {
  // Fired once discovery is done, with every dataset id about to be fetched.
  onStart: (ids: string[]) => void
  // Fired per dataset the moment its fetch lands, in completion order.
  onDataset: (dataset: GISDataset) => void
  // Fired per failure as it happens. `id` is null for discovery failures.
  onError: (id: string | null, message: string) => void
}

// Fetches every registered dataset for the AOI, streaming each result through
// the handlers as it settles (instead of holding everything until the slowest
// request finishes). Resolves once all datasets have settled. One dataset
// failing doesn't block the others; each fetch retries transient failures
// (timeouts, 5xx, and ArcGIS 200-with-error bodies).
export async function fetchGISDatasets(points: LatLngTuple[], handlers: GISDatasetHandlers): Promise<void> {
  const lats = points.map(([lat]) => lat)
  const lons = points.map(([, lng]) => lng)
  const aoi: AoiQuery = {
    geometry: buildAoiGeometry(points),
    bbox: {
      minLon: Math.min(...lons),
      minLat: Math.min(...lats),
      maxLon: Math.max(...lons),
      maxLat: Math.max(...lats),
    },
  }

  // Static registry plus whatever the backend's catalog currently holds. If
  // discovery fails (backend down), the remote datasets still load.
  let defs = GIS_DATASETS
  try {
    defs = [...GIS_DATASETS, ...(await discoverBackendLayers())]
  } catch (err) {
    handlers.onError(null, `layer discovery: ${err instanceof Error ? err.message : 'failed'}`)
  }

  handlers.onStart(defs.map((def) => def.id))

  await Promise.allSettled(
    defs.map(async (def) => {
      try {
        const data = await fetchJsonWithRetry(def.buildUrl(aoi), {
          validate: toFeatureCollection,
        })
        handlers.onDataset({ id: def.id, style: def.style, visibile: false, data })
      } catch (err) {
        handlers.onError(def.id, err instanceof Error ? err.message : 'request failed')
      }
    }),
  )
}

