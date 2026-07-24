//nwf networking functions

import type { LatLngTuple } from 'leaflet'
import type { FeatureCollection } from 'geojson'
import { kinks, polygon as turfPolygon } from '@turf/turf'
import type { AoiQuery, GISDataset, GISDatasetDef, TnmItem } from './types'
import {GIS_DATASETS} from './datasets'


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
// TNM's backend takes ~20-29s per request and its gateway 504s at ~29.5s, so
// pages must be small enough to fit under that ceiling (1000 reliably 504s on
// lidar-dense AOIs; ~150 completes), the client timeout must outlast the
// gateway (10s would abort before TNM ever answers), and retries are kept low
// because each doomed attempt costs up to ~30s.
export const MAX_RETURN = 150
export const TNM_TIMEOUT_MS = 35000
export const TNM_RETRIES = 3


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
    timeoutMs: TNM_TIMEOUT_MS,
    retries: TNM_RETRIES,
    validate: (body) => body as { total: number; items: TnmItem[] },
  })
}



// True when the drawn AOI's edges cross each other (a "bowtie"). Esri rejects
// self-intersecting rings, so the UI warns and blocks the search instead of
// sending a query that can't work. Fewer than 4 vertices can't self-cross.
export function isSelfIntersecting(points: LatLngTuple[]): boolean {
  if (points.length < 4) return false
  const ring = points.map(([lat, lng]) => [lng, lat])
  ring.push(ring[0])
  return kinks(turfPolygon([ring])).features.length > 0
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

// Reduces an ArcGIS layer query URL down to its service root, e.g.
// …/MapServer/2/query?… -> …/MapServer. Non-MapServer URLs return null.
function mapServerRoot(queryUrl: string): string | null {
  const match = queryUrl.match(/^(.*\/MapServer)\/\d+\/query/i)
  return match ? match[1] : null
}

// One metadata lookup per MapServer, shared by every layer on that service
// (the four PLSS layers hit the same root, so this fetches it once).
const wkidCache = new Map<string, Promise<number | undefined>>()

// The service root's `spatialReference.wkid` is the data's native projection.
// Metadata is nice-to-have: any failure resolves to undefined rather than
// failing the dataset itself.
function lookupMapServerWkid(queryUrl: string): Promise<number | undefined> {
  const root = mapServerRoot(queryUrl)
  if (!root) return Promise.resolve(undefined)

  let cached = wkidCache.get(root)
  if (!cached) {
    cached = fetchJsonWithRetry(`${root}?f=json`, {
      label: 'MapServer metadata',
      validate: (body) => {
        const wkid = (body as { spatialReference?: { wkid?: unknown } })?.spatialReference?.wkid
        return typeof wkid === 'number' ? wkid : undefined
      },
    }).catch(() => undefined)
    wkidCache.set(root, cached)
  }
  return cached
}

export interface GISDatasetHandlers {
  // Fired per batch of ids about to be fetched: once for the static registry,
  // and again for the backend's layers once discovery lands. Ids should be
  // APPENDED to whatever is already pending, not replace it.
  onStart: (ids: string[]) => void
  // Fired per dataset the moment its fetch lands, in completion order.
  onDataset: (dataset: GISDataset) => void
  // Fired per failure as it happens. `id` is null for discovery failures.
  onError: (id: string | null, message: string) => void
}

// Fetches one dataset and streams the result — or the failure — through the
// handlers. Never rejects; a failed dataset reports via onError and is done.
async function fetchDataset(def: GISDatasetDef, aoi: AoiQuery, handlers: GISDatasetHandlers): Promise<void> {
  const url = def.buildUrl(aoi)
  try {
    const [data, wkid] = await Promise.all([
      fetchJsonWithRetry(url, { validate: toFeatureCollection }),
      lookupMapServerWkid(url),
    ])
    handlers.onDataset({ id: def.id, style: def.style, visibile: false, wkid, data })
  } catch (err) {
    handlers.onError(def.id, err instanceof Error ? err.message : 'request failed')
  }
}

// Fetches every registered dataset for the AOI, streaming each result through
// the handlers as it settles (instead of holding everything until the slowest
// request finishes). Resolves once all datasets have settled. One dataset
// failing doesn't block the others; each fetch retries transient failures
// (timeouts, 5xx, and ArcGIS 200-with-error bodies).
//
// The static registry and the backend's catalog are independent, so they run as
// two concurrent waves: the registry's datasets start immediately, and the
// backend's layers join the fan-out once discovery returns. Discovery is a slow
// step to sit behind — it retries with backoff against a 10s timeout — and
// nothing in the registry depends on its result. If it fails outright (backend
// down), the registry's datasets still load.
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

  const fetchAll = (defs: GISDatasetDef[]) => {
    if (defs.length === 0) return Promise.resolve([])
    handlers.onStart(defs.map((def) => def.id))
    return Promise.allSettled(defs.map((def) => fetchDataset(def, aoi, handlers)))
  }

  const registryWave = fetchAll(GIS_DATASETS)
  const backendWave = discoverBackendLayers()
    .then(fetchAll)
    .catch((err) => {
      handlers.onError(null, `layer discovery: ${err instanceof Error ? err.message : 'failed'}`)
    })

  await Promise.all([registryWave, backendWave])
}

