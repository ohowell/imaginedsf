import type { Map as MapLibreMap } from 'maplibre-gl'

const SIZE = 40
const COLOR = '#c62828'

// Prefixed so they don't clash with icons in a basemap's style.
export const PIN = 'isf-pin'
export const DIRECTIONAL_PIN = 'isf-pin-directional'

/**
 * Adds a pin image when a layer asks for it. Changing the basemap replaces
 * the style and drops added images, so pins are added whenever they're missing.
 */
export function addMissingPin(map: MapLibreMap, id: string) {
  if (id !== PIN && id !== DIRECTIONAL_PIN) return
  map.addImage(id, drawPin(id === DIRECTIONAL_PIN), { pixelRatio: 2 })
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
