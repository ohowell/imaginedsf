import type {
  AddLayerObject,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  TransformStyleFunction,
} from 'maplibre-gl'
import type { MapLayer, MapSource } from '../../plugins/content/types.ts'
import { DIRECTIONAL_PIN, PIN } from './pins.ts'

export type StyleSpecification = ReturnType<TransformStyleFunction>
type SourceSpecification = StyleSpecification['sources'][string]
/** Sources drawn as one layer, which is every kind but a whole style. */
export type LayerSource = Exclude<MapSource, { type: 'style' }>
type WmsSource = Extract<MapSource, { type: 'wms' }>

// Credits shown in the attribution control, by host. Styles bring their own.
const ATTRIBUTION: Record<string, string> = {
  'stacks.stanford.edu':
    '<a href="https://library.stanford.edu/">Stanford Libraries</a>',
  'basemap.nationalmap.gov':
    '<a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USGS The National Map</a>',
}

/** The ID of a map layer's MapLibre source, and of its one layer. */
export const layerId = (slug: string) => `map:${slug}`

/** Whether a source or layer is a map shown on the basemap. */
export const isLayerId = (id: string) => id.startsWith('map:')

/**
 * A basemap's style: the style itself for vector basemaps, or a style with
 * one raster layer for the others.
 */
export function basemapStyle(map: MapLayer): StyleSpecification | string {
  const { source } = map
  if (source.type === 'style') return source.url
  const id = `basemap:${map.slug}`
  return {
    version: 8,
    sources: { [id]: sourceSpec(source) },
    layers: [{ id, type: 'raster', source: id }],
  }
}

const attribution = (url: string) =>
  ATTRIBUTION[new URL(url, window.location.href).hostname]

// MapLibre only accepts zoom bounds that are set.
const zoomRange = ({
  minZoom,
  maxZoom,
}: {
  minZoom?: number
  maxZoom?: number
}) => ({
  ...(minZoom !== undefined && { minzoom: minZoom }),
  ...(maxZoom !== undefined && { maxzoom: maxZoom }),
})

// MapLibre fills in {bbox-epsg-3857} for each 256 pixel tile.
function wmsTileUrl({ url, layers }: WmsSource): string {
  const params = new URLSearchParams({
    service: 'WMS',
    request: 'GetMap',
    version: '1.1.1',
    layers,
    styles: '',
    format: 'image/png',
    transparent: 'true',
    srs: 'EPSG:3857',
    width: '256',
    height: '256',
  })
  return `${url}?${params}&bbox={bbox-epsg-3857}`
}

export function sourceSpec(source: LayerSource): SourceSpecification {
  const credit = attribution(source.url)
  switch (source.type) {
    case 'cog':
      // Read by @geomatico/maplibre-cog-protocol, which renders 256 pixel tiles.
      return {
        type: 'raster',
        url: `cog://${source.url}`,
        tileSize: 256,
        attribution: credit,
      }
    case 'tile':
      return {
        type: 'raster',
        tiles: [source.url],
        tileSize: 256,
        ...zoomRange(source),
        attribution: credit,
      }
    case 'wms':
      return {
        type: 'raster',
        tiles: [wmsTileUrl(source)],
        tileSize: 256,
        ...zoomRange(source),
        attribution: credit,
      }
    case 'geojson':
      return { type: 'geojson', data: source.url, attribution: credit }
  }
}

export function layerSpec(map: MapLayer): AddLayerObject {
  const id = layerId(map.slug)
  if (map.source.type !== 'geojson') {
    return { id, type: 'raster', source: id }
  }
  // Directional pins point the way a photo was taken.
  const direction = map.source.properties?.direction
  return {
    id,
    type: 'symbol',
    source: id,
    layout: {
      'icon-image': direction ? DIRECTIONAL_PIN : PIN,
      'icon-rotate': direction ? ['to-number', ['get', direction], 0] : 0,
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  }
}

export function setLayerOpacity(
  mapLibre: MapLibreMap,
  map: MapLayer,
  opacity: number,
) {
  mapLibre.setPaintProperty(
    layerId(map.slug),
    map.source.type === 'geojson' ? 'icon-opacity' : 'raster-opacity',
    opacity,
  )
}

/** The text and images for a pin's popup. */
export function popupContent(
  map: MapLayer,
  feature: MapGeoJSONFeature,
): HTMLElement {
  const element = document.createElement('div')
  element.className = 'map-popup'
  if (map.source.type !== 'geojson') return element
  const { text, images } = map.source.properties ?? {}
  const caption = text && feature.properties[text]
  if (caption) {
    const paragraph = document.createElement('p')
    paragraph.textContent = String(caption)
    element.append(paragraph)
  }
  const urls = images ? String(feature.properties[images] ?? '').split(',') : []
  for (const url of urls.map((url) => url.trim()).filter(Boolean)) {
    const image = document.createElement('img')
    // GeoJSON files are served as they are, so their paths into assets/ get
    // the site's base path here.
    image.src = url.startsWith('/assets/')
      ? `${import.meta.env.BASE_URL}${url.slice(1)}`
      : url
    image.alt = ''
    image.loading = 'lazy'
    element.append(image)
  }
  return element
}
