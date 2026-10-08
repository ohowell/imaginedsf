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
  Object.hasOwn(content.layers, slug) && !content.basemaps.includes(slug)

/**
 * The state a hash from `toHash` describes, or a link from the old site.
 * Anything it doesn't mention is the default, and parts that don't make sense,
 * like layers that have since been removed, are left out.
 */
export function fromHash(hash: string): MapState {
  const text = hash.replace(/^#/, '')
  // Base64 for `{"`, which starts every old link's JSON.
  if (text.startsWith('eyJ')) return fromOldHash(text) ?? fromHash('')
  const params = new URLSearchParams(text)
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
 * back button leaves the site rather than undoing each pan and zoom. Old
 * links become new ones once the map has opened them.
 */
export function replaceHash(state: MapState) {
  const url = new URL(window.location.href)
  url.hash = toHash(state)
  if (url.href !== window.location.href) {
    history.replaceState(history.state, '', url)
  }
}

/**
 * How the old WordPress site linked to a view: JSON in base64, keyed by
 * WordPress post ID, listing every map and group as on or off.
 */
interface OldHash {
  mapState: {
    enabled: Record<string, boolean>
    opacity: Record<string, number>
    /** Opposite corners, as latitude and longitude. */
    bounds: [[number, number], [number, number]]
  }
}

// Layers in the order the sidebar lists them, which is how the old site
// stacked them: the first on top.
const listed = (slugs: string[]): string[] =>
  slugs.flatMap((slug) => {
    const group = content.groups[slug]
    if (group) return listed(group.children)
    return [slug, ...listed(content.layers[slug].children ?? [])]
  })

/**
 * The state an old site's link describes, as near as the current content
 * allows: maps and groups it doesn't have any more are left out, and so are
 * maps in a group that was off, which the old site hid.
 */
function fromOldHash(text: string): MapState | undefined {
  let mapState: OldHash['mapState']
  try {
    ;({ mapState } = JSON.parse(atob(decodeURIComponent(text))) as OldHash)
  } catch {
    return undefined
  }
  const enabled = mapState?.enabled ?? {}
  const opacity = mapState?.opacity ?? {}
  const idOf = (slug: string) =>
    String((content.layers[slug] ?? content.groups[slug]).wordpressId)
  const isOn = (slug: string) => enabled[idOf(slug)] === true

  // Groups were switched on and off along with their maps; layers that were
  // indented under others were switched on their own.
  const groupsOn = (slug: string): boolean => {
    const { parent } = content.layers[slug] ?? content.groups[slug]
    if (!parent || content.eras.some((era) => era.slug === parent)) return true
    return (!content.groups[parent] || isOn(parent)) && groupsOn(parent)
  }
  const layers = listed(content.eras.flatMap((era) => era.children))
    .filter((slug) => isOn(slug) && groupsOn(slug))
    .toReversed()

  const opacityBySlug: Record<string, number> = {}
  for (const slug of layers) {
    const value = opacity[idOf(slug)]
    if (typeof value === 'number' && value >= 0 && value < 1) {
      opacityBySlug[slug] = value
    }
  }

  // Basemaps could be stacked too, and the first listed one was on top.
  const basemap = content.basemaps.find(isOn) ?? content.defaultBasemap

  const corners = mapState?.bounds
  const lats = Array.isArray(corners)
    ? corners.map((corner) => corner?.[0])
    : []
  const lngs = Array.isArray(corners)
    ? corners.map((corner) => corner?.[1])
    : []
  const bbox: Bbox | undefined =
    lats.length === 2 &&
    [...lats, ...lngs].every(Number.isFinite) &&
    lats[0] !== lats[1] &&
    lngs[0] !== lngs[1]
      ? [
          Math.min(...lngs),
          Math.min(...lats),
          Math.max(...lngs),
          Math.max(...lats),
        ]
      : undefined

  return { basemap, layers, opacity: opacityBySlug, bbox }
}
