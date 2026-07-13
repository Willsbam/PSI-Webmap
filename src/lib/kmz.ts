import * as JSZip from 'jszip'
import { kml } from '@tmcw/togeojson'
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { LatLngTuple } from 'leaflet'

// A .kmz is a ZIP containing KML (plus optional resources). Pull the root KML
// text out of the archive, or read a plain .kml file directly.
async function readKmlText(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith('.kml')) return file.text()

  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const kmlEntries = Object.values(zip.files).filter(
    (entry) => !entry.dir && entry.name.toLowerCase().endsWith('.kml'),
  )
  // Spec: use the root doc.kml, otherwise the first .kml entry in the archive.
  const root = kmlEntries.find((entry) => entry.name.toLowerCase() === 'doc.kml') ?? kmlEntries[0]
  if (!root) throw new Error('No .kml file found inside the .kmz archive')
  return root.async('string')
}

// Full pipeline: .kmz/.kml File -> unzip -> parse XML -> GeoJSON FeatureCollection.
// KML is always WGS84 lon/lat, so the output needs no reprojection.
export async function kmzToFeatureCollection(file: File): Promise<FeatureCollection> {
  const text = await readKmlText(file)
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  // DOMParser reports malformed XML via a <parsererror> node instead of throwing.
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('The KML file is not valid XML')
  }
  return kml(doc, { skipNullGeometry: true }) as FeatureCollection
}

// Pulls the first polygon's exterior ring out of a FeatureCollection as
// [lat, lng] pairs for use as a Leaflet area-of-interest. KML rings are closed
// (last point repeats the first); that duplicate is dropped to match the
// hand-drawn polygons the rest of the app produces.
export function firstPolygonRing(fc: FeatureCollection): LatLngTuple[] {
  const geom = fc.features
    .map((feature) => feature.geometry)
    .find((g): g is Polygon | MultiPolygon => g?.type === 'Polygon' || g?.type === 'MultiPolygon')
  if (!geom) throw new Error('No polygon found in the KML to use as an area of interest')

  const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0]
  const latlngs = ring.map(([lng, lat]) => [lat, lng] as LatLngTuple)

  const first = latlngs[0]
  const last = latlngs[latlngs.length - 1]
  if (latlngs.length > 1 && first[0] === last[0] && first[1] === last[1]) latlngs.pop()

  return latlngs
}
