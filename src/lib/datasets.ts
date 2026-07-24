
import type {GISDatasetDef} from './types'

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
