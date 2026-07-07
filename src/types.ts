import { GeoJSON, MapContainer, Polygon, TileLayer, useMapEvents } from 'react-leaflet'
import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet'
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
export interface GISStyle{
  color: string; 
  weight: number; 
  fillColor: string; 
  fillOpacity: number 
}

export interface GISDatasets {
  datasets: FeatureCollection[]
  datasetStyles: GISStyle[]
}




