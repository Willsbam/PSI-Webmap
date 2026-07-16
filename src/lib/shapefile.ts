import JSZip from 'jszip'
import * as shpwrite from '@mapbox/shp-write'
import type { GISDataset } from '../types'

// shp-write names files by geometry type (POLYGON.shp, POINT.shp, …), so two
// datasets of the same type would collide at the zip root. Giving each dataset
// its own top-level folder keeps the archive flat (one level of extraction)
// while avoiding collisions.
function sanitizeFolder(id: string): string {
  return id.replace(/[^\w.-]/g, '_')
}

// Bundles each dataset's shapefile into a single .zip — one folder per dataset,
// each holding a ready-to-use shapefile — for one browser download. Inner zips
// are STOREd (uncompressed) since the outer zip DEFLATEs once at the end.
export async function bundleShapefiles(datasets: GISDataset[]): Promise<Blob> {
  const outer = new JSZip()
  for (const dataset of datasets) {
    const innerBlob = await shpwrite.zip<'blob'>(dataset.data, { outputType: 'blob', compression: 'STORE' })
    const innerZip = await JSZip.loadAsync(innerBlob)
    const folder = sanitizeFolder(dataset.id)
    await Promise.all(
      Object.values(innerZip.files)
        .filter((entry) => !entry.dir)
        .map(async (entry) => {
          outer.file(`${folder}/${entry.name}`, await entry.async('uint8array'))
        }),
    )
  }
  return outer.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
