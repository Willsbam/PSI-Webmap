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
