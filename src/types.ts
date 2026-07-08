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

// Definition of an AOI-driven GeoJSON overlay: given the user's polygon as an
// encoded Esri `rings` geometry, produce the query URL. Registered definitions
// (see GIS_DATASETS in lib/nwf.ts) are fetched and drawn automatically.
export interface GISDatasetDef {
  id: string
  style: GISStyle
  buildUrl: (geometry: string) => string
}

// A fetched dataset, paired with its style, ready for the map.
export interface GISDataset {
  id: string
  style: GISStyle
  data: FeatureCollection
}
