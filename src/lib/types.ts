import type { FeatureCollection } from 'geojson'

export interface TnmBoundingBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface TnmItem {
  sourceId: string
  title: string
  format: string
  publicationDate: string
  sizeInBytes: number
  downloadURL: string
  boundingBox?: TnmBoundingBox
}

export interface GISStyle {
  color: string
  weight: number
  fillColor: string
  fillOpacity: number
}

// The user's AOI in the forms dataset queries need: an encoded Esri `rings`
// geometry for ArcGIS endpoints, and a lon/lat bounding box for bbox endpoints
// (e.g. the parcel backend).
export interface AoiQuery {
  geometry: string
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number }
}

// Definition of an AOI-driven GeoJSON overlay: given the user's AOI, produce
// the query URL. Registered definitions (see GIS_DATASETS in lib/nwf.ts) are
// fetched and drawn automatically.
export interface GISDatasetDef {
  id: string
  style: GISStyle
  buildUrl: (aoi: AoiQuery) => string
}

// A fetched dataset, paired with its style, ready for the map. `wkid` is the
// serving MapServer's native spatial reference (undefined for non-ArcGIS
// sources or when the metadata lookup fails).
export interface GISDataset {
  id: string
  style: GISStyle
  visibile: boolean
  wkid?: number
  data: FeatureCollection
}
