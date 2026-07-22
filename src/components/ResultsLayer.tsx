import { useEffect, useMemo, useRef, useState } from 'react'
import { GeoJSON, Rectangle, useMapEvents } from 'react-leaflet'
import * as L from 'leaflet'
import type { LatLngBounds, LatLngTuple, LeafletMouseEvent, Rectangle as LeafletRectangle } from 'leaflet'
import { bboxPolygon, dissolve, featureCollection } from '@turf/turf'
import type { FeatureCollection, Polygon } from 'geojson'
import type { TnmBoundingBox, TnmItem } from '../lib/types'

// Above this many visible items, individual rectangles give way to a merged coverage shape.
const MERGE_THRESHOLD = 1000
// Cull/coverage bounds are padded beyond the viewport so edge items don't pop in mid-pan.
const CULL_PAD = 0.5
// Fraction of the viewport the map must move/rescale before culling recomputes.
const MOVE_THRESHOLD = 0.5
// Coverage raster resolution. Cost of the merge is bounded by this grid, not by item
// count, so arbitrarily large result sets stay cheap. Cells are ~viewport/256, which
// also bridges the small real-world misalignments between adjacent LPC tiles while
// preserving genuine coverage holes (anything larger than a cell).
const GRID_SIZE = 256

const DEFAULT_STYLE = { color: '#2ecc71', weight: 1, fillColor: '#2ecc71', fillOpacity: 0.35 }
const SELECTED_STYLE = { color: '#ff8c00', weight: 3, fillColor: '#ff8c00', fillOpacity: 0.45 }

function toLeafletBounds(bbox: TnmBoundingBox): [LatLngTuple, LatLngTuple] {
  return [
    [bbox.minY, bbox.minX],
    [bbox.maxY, bbox.maxX],
  ]
}

function pointInBoundingBox(lat: number, lng: number, bbox: TnmBoundingBox) {
  return lat >= bbox.minY && lat <= bbox.maxY && lng >= bbox.minX && lng <= bbox.maxX
}

// Merged-coverage builder: rasterize bboxes onto a GRID_SIZE² grid over `bounds`
// (O(items)), run-length merge occupied cells into maximal rectangles, then dissolve
// the seams. Grid-aligned rectangles share exact float edges, so dissolve() merges
// them reliably — unlike raw API bboxes, whose edges rarely align.
function buildCoverage(items: TnmItem[], bounds: LatLngBounds): FeatureCollection<Polygon> {
  const west = bounds.getWest()
  const south = bounds.getSouth()
  const cellW = (bounds.getEast() - west) / GRID_SIZE
  const cellH = (bounds.getNorth() - south) / GRID_SIZE

  const occupied = new Uint8Array(GRID_SIZE * GRID_SIZE)
  for (const item of items) {
    const b = item.boundingBox
    if (!b) continue
    const c0 = Math.max(0, Math.floor((b.minX - west) / cellW))
    const c1 = Math.min(GRID_SIZE - 1, Math.floor((b.maxX - west) / cellW))
    const r0 = Math.max(0, Math.floor((b.minY - south) / cellH))
    const r1 = Math.min(GRID_SIZE - 1, Math.floor((b.maxY - south) / cellH))
    if (c1 < c0 || r1 < r0) continue // outside the padded viewport
    for (let r = r0; r <= r1; r++) occupied.fill(1, r * GRID_SIZE + c0, r * GRID_SIZE + c1 + 1)
  }

  // Horizontal runs per row, extended downward while the identical run repeats.
  type GridRect = { c0: number; c1: number; r0: number; r1: number }
  const rects: GridRect[] = []
  let open = new Map<string, GridRect>()
  for (let r = 0; r < GRID_SIZE; r++) {
    const stillOpen = new Map<string, GridRect>()
    for (let c = 0; c < GRID_SIZE; ) {
      if (!occupied[r * GRID_SIZE + c]) {
        c++
        continue
      }
      const start = c
      while (c < GRID_SIZE && occupied[r * GRID_SIZE + c]) c++
      const key = `${start}:${c}`
      const prev = open.get(key)
      if (prev && prev.r1 === r - 1) {
        prev.r1 = r
        stillOpen.set(key, prev)
      } else {
        const rect = { c0: start, c1: c - 1, r0: r, r1: r }
        rects.push(rect)
        stillOpen.set(key, rect)
      }
    }
    open = stillOpen
  }

  const polygons = rects.map(({ c0, c1, r0, r1 }) =>
    bboxPolygon([west + c0 * cellW, south + r0 * cellH, west + (c1 + 1) * cellW, south + (r1 + 1) * cellH]),
  )
  if (polygons.length <= 1) return featureCollection(polygons)
  return dissolve(featureCollection(polygons))
}

interface ResultsLayerProps {
  items: TnmItem[]
  selectedItemId: string | null
  onSelectItem: (id: string) => void
}

function ResultsLayer({ items, selectedItemId, onSelectItem }: ResultsLayerProps) {
  const map = useMapEvents({
    moveend: () => recullIfNeeded(),
    zoomend: () => recullIfNeeded(),
  })

  // Throttled culling bounds: the only state driving re-renders. Small pans/zooms
  // are absorbed by the padding; only significant movement triggers recompute.
  const [cullBounds, setCullBounds] = useState<LatLngBounds>(() => map.getBounds().pad(CULL_PAD))
  const lastViewRef = useRef<LatLngBounds>(map.getBounds())

  const recullIfNeeded = () => {
    const next = map.getBounds()
    const last = lastViewRef.current
    const lastDiag = last.getNorthEast().distanceTo(last.getSouthWest())
    const moved = last.getCenter().distanceTo(next.getCenter()) / lastDiag
    const rescaled = Math.abs(next.getNorthEast().distanceTo(next.getSouthWest()) - lastDiag) / lastDiag
    if (moved > MOVE_THRESHOLD || rescaled > MOVE_THRESHOLD) {
      lastViewRef.current = next
      setCullBounds(next.pad(CULL_PAD))
    }
  }

  const rectangleRefs = useRef(new Map<string, LeafletRectangle>())
  const cycleRef = useRef({ key: '', index: -1 })

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (!item.boundingBox) return false
        const [sw, ne] = toLeafletBounds(item.boundingBox)
        return cullBounds.intersects(L.latLngBounds(sw, ne))
      }),
    [items, cullBounds],
  )

  const shouldMerge = visibleItems.length > MERGE_THRESHOLD
  const coverage = useMemo(
    () => (shouldMerge ? buildCoverage(items, cullBounds) : null),
    [shouldMerge, items, cullBounds],
  )
  // react-leaflet's GeoJSON doesn't diff `data` after mount; remount it whenever the
  // inputs that shape the coverage change.
  const coverageKey = `${items.length}:${cullBounds.toBBoxString()}`

  const selectedItem = useMemo(
    () => (selectedItemId ? items.find((i) => i.sourceId === selectedItemId) : undefined),
    [items, selectedItemId],
  )

  // Pan to a selection only when it's off-screen (e.g. picked from the side panel).
  // Checks the live map bounds, not cullBounds — the padded/throttled bounds lag the
  // real viewport and would misreport visibility, yanking the view on ordinary clicks.
  useEffect(() => {
    if (!selectedItem?.boundingBox) return
    rectangleRefs.current.get(selectedItem.sourceId)?.bringToFront()
    const [sw, ne] = toLeafletBounds(selectedItem.boundingBox)
    const target = L.latLngBounds(sw, ne)
    if (map.getBounds().intersects(target)) return
    map.flyToBounds(target, { maxZoom: 10, duration: 1.5 })
  }, [selectedItem, map])

  // Shared by both render modes: hit-test the click point against every visible item
  // so overlapping data sources cycle with repeated clicks at the same spot.
  const handleAreaClick = (e: LeafletMouseEvent) => {
    const candidates = visibleItems.filter(
      (item) => item.boundingBox && pointInBoundingBox(e.latlng.lat, e.latlng.lng, item.boundingBox),
    )
    if (candidates.length === 0) return

    const key = candidates
      .map((item) => item.sourceId)
      .sort()
      .join(',')
    const nextIndex = key === cycleRef.current.key ? (cycleRef.current.index + 1) % candidates.length : 0
    cycleRef.current = { key, index: nextIndex }
    onSelectItem(candidates[nextIndex].sourceId)
  }

  if (shouldMerge) {
    return (
      <>
        {coverage && (
          <GeoJSON key={coverageKey} data={coverage} style={DEFAULT_STYLE} eventHandlers={{ click: handleAreaClick }} />
        )}
        {/* Selection stays visible even when individual rectangles are merged away. */}
        {selectedItem?.boundingBox && (
          <Rectangle
            bounds={toLeafletBounds(selectedItem.boundingBox)}
            pathOptions={SELECTED_STYLE}
            eventHandlers={{ click: handleAreaClick }}
          />
        )}
      </>
    )
  }

  return (
    <>
      {visibleItems.map((item) =>
        item.boundingBox ? (
          <Rectangle
            key={item.sourceId}
            ref={(ref) => {
              if (ref) rectangleRefs.current.set(item.sourceId, ref)
              else rectangleRefs.current.delete(item.sourceId)
            }}
            bounds={toLeafletBounds(item.boundingBox)}
            pathOptions={item.sourceId === selectedItemId ? SELECTED_STYLE : DEFAULT_STYLE}
            eventHandlers={{ click: handleAreaClick }}
          />
        ) : null,
      )}
    </>
  )
}

export default ResultsLayer
