import type { Map as MapLibreMap } from 'maplibre-gl'

const SIZE = 40
const COLOR = '#c62828'

/** Adds the pin images GeoJSON layers use, drawn at twice their size. */
export function addPinImages(map: MapLibreMap) {
  map.addImage('pin', drawPin(false), { pixelRatio: 2 })
  map.addImage('pin-directional', drawPin(true), { pixelRatio: 2 })
}

function drawPin(directional: boolean): ImageData {
  const canvas = new OffscreenCanvas(SIZE, SIZE)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D is unavailable')
  const center = SIZE / 2
  context.fillStyle = COLOR
  context.strokeStyle = 'white'
  context.lineWidth = 3
  context.beginPath()
  if (directional) {
    // A point at the top, which icon-rotate turns to face the direction.
    context.moveTo(center, 1.5)
    context.lineTo(center + 8, center - 2)
    context.arc(center, center, 9, -Math.PI / 4, (-3 * Math.PI) / 4)
    context.closePath()
  } else {
    context.arc(center, center, 9, 0, 2 * Math.PI)
  }
  context.fill()
  context.stroke()
  return context.getImageData(0, 0, SIZE, SIZE)
}
