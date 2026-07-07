interface FirmFeature {
  attributes: {
    FIRM_PAN: string
  }
}

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
