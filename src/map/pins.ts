import type { Map as MapLibreMap } from 'maplibre-gl'

/** How wide pins are on screen, in CSS pixels. */
export const PIN_SIZE = 28

const COLOR = '#d83a3a'
// The inner disc of a pin whose popup is open.
const SELECTED_COLOR = '#eb6e69'
// Drawn at three times their size so they stay sharp when zoomed in.
const PIXEL_RATIO = 3
// The old site's pins were 78 pixel images, so they're drawn in those units.
const UNIT = (PIN_SIZE * PIXEL_RATIO) / 78

// Prefixed so they don't clash with icons in a basemap's style.
export const PIN = 'isf-pin'
export const DIRECTIONAL_PIN = 'isf-pin-directional'
export const SELECTED_PIN = 'isf-pin-selected'
export const SELECTED_DIRECTIONAL_PIN = 'isf-pin-directional-selected'

const PINS: Record<string, { directional: boolean; selected: boolean }> = {
  [PIN]: { directional: false, selected: false },
  [DIRECTIONAL_PIN]: { directional: true, selected: false },
  [SELECTED_PIN]: { directional: false, selected: true },
  [SELECTED_DIRECTIONAL_PIN]: { directional: true, selected: true },
}

/**
 * Adds a pin image when a layer asks for it. Changing the basemap replaces
 * the style and drops added images, so pins are added whenever they're missing.
 */
export function addMissingPin(map: MapLibreMap, id: string) {
  const pin = PINS[id]
  if (!pin) return
  map.addImage(id, drawPin(pin.directional, pin.selected), {
    pixelRatio: PIXEL_RATIO,
  })
}

// A red target, as on the old site. Directional pins add an arrow out of the
// top, and are three times as tall so the target stays in the middle, where
// icon-rotate turns them. Selected pins fill in the gap and lighten the disc.
function drawPin(directional: boolean, selected: boolean): ImageData {
  const height = directional ? 234 : 78
  const canvas = new OffscreenCanvas(78 * UNIT, height * UNIT)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D is unavailable')
  context.scale(UNIT, UNIT)
  context.fillStyle = COLOR
  context.strokeStyle = COLOR

  const center = height / 2
  // An outer ring and an inner disc, with a clear gap between them.
  context.beginPath()
  if (selected) {
    context.arc(39, center, 39, 0, 2 * Math.PI)
    context.fill()
  } else {
    context.lineWidth = 6
    context.arc(39, center, 36, 0, 2 * Math.PI)
    context.stroke()
  }
  context.beginPath()
  context.arc(39, center, 27, 0, 2 * Math.PI)
  context.fillStyle = selected ? SELECTED_COLOR : COLOR
  context.fill()
  context.fillStyle = COLOR

  if (directional) {
    context.beginPath()
    context.moveTo(39, 0)
    context.lineTo(57, 51)
    context.lineTo(21, 51)
    context.closePath()
    context.fill()
    // The shaft, from the arrowhead down into the ring, whose top is at 78.
    context.fillRect(33, 50, 12, 30)
  }
  return context.getImageData(0, 0, canvas.width, canvas.height)
}
