//nwf networking functions

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
