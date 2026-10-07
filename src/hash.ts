import content from 'virtual:content'

export type Bbox = [number, number, number, number]

/** What a link to the map shows. */
export interface MapState {
  basemap: string
  /** Slugs of the layers shown on the basemap, from bottom to top. */
  layers: string[]
  /** Opacity by slug, from 0 to 1. Layers without one are opaque. */
  opacity: Record<string, number>
  /** The area to show, as west, south, east, north. */
  bbox?: Bbox
}

// About a metre at the equator, which is as close as anyone needs to share.
const round = (degrees: number) => Number(degrees.toFixed(5))

/**
 * The state as a hash that reads like
 * `#layers=burnham-plan:0.5,existing-city&basemap=aerial-imagery&bbox=…`,
 * leaving out whatever's the default. Opacity follows a layer after a colon,
 * and the view is a box rather than a center and zoom so it fits in any window.
 */
export function toHash({ basemap, layers, opacity, bbox }: MapState) {
  const params: string[] = []
  if (layers.length > 0) {
    const entries = layers.map((slug) =>
      opacity[slug] === undefined || opacity[slug] === 1
        ? slug
        : `${slug}:${Number(opacity[slug].toFixed(2))}`,
    )
    params.push(`layers=${entries.join(',')}`)
  }
  if (basemap !== content.defaultBasemap) params.push(`basemap=${basemap}`)
  if (bbox) params.push(`bbox=${bbox.map(round).join(',')}`)
  // Slugs and numbers need no escaping, so the hash stays readable.
  return params.length > 0 ? `#${params.join('&')}` : ''
}

const isOverlay = (slug: string) =>
  slug in content.layers && !content.basemaps.includes(slug)

/**
 * The state a hash from `toHash` describes. Anything it doesn't mention is the
 * default, and parts that don't make sense, like layers that have since been
 * removed, are left out.
 */
export function fromHash(hash: string): MapState {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const layers: string[] = []
  const opacity: Record<string, number> = {}
  for (const entry of params.get('layers')?.split(',') ?? []) {
    const [slug, value] = entry.split(':')
    if (!isOverlay(slug) || layers.includes(slug)) continue
    layers.push(slug)
    const number = Number(value)
    if (value && number >= 0 && number <= 1) opacity[slug] = number
  }

  const basemap = params.get('basemap')
  const numbers = params.get('bbox')?.split(',').map(Number) ?? []
  const [west, south, east, north] = numbers
  const bbox =
    numbers.length === 4 &&
    numbers.every(Number.isFinite) &&
    west < east &&
    south < north
      ? (numbers as Bbox)
      : undefined

  return {
    basemap:
      basemap && content.basemaps.includes(basemap)
        ? basemap
        : content.defaultBasemap,
    layers,
    opacity,
    bbox,
  }
}

/**
 * Puts the state in the address bar without adding to the history, so the
 * back button leaves the site rather than undoing each pan and zoom.
 */
export function replaceHash(state: MapState) {
  const url = new URL(window.location.href)
  url.hash = toHash(state)
  if (url.href !== window.location.href) {
    history.replaceState(history.state, '', url)
  }
}
