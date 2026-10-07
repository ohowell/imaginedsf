import type {
  AddLayerObject,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  TransformStyleFunction,
} from 'maplibre-gl'
import type { Layer, LayerSource } from '../../plugins/content/types.ts'
import {
  DIRECTIONAL_PIN,
  PIN,
  SELECTED_DIRECTIONAL_PIN,
  SELECTED_PIN,
} from './pins.ts'

export type StyleSpecification = ReturnType<TransformStyleFunction>
type SourceSpecification = StyleSpecification['sources'][string]
/** Sources drawn as one layer, which is every kind but a whole style. */
export type SingleLayerSource = Exclude<LayerSource, { type: 'style' }>
type WmsSource = Extract<LayerSource, { type: 'wms' }>

// Credits shown in the attribution control, by host. Styles bring their own.
const ATTRIBUTION: Record<string, string> = {
  'stacks.stanford.edu':
    '<a href="https://library.stanford.edu/">Stanford Libraries</a>',
  'basemap.nationalmap.gov':
    '<a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USGS The National Map</a>',
}

/** The ID of a layer's MapLibre source, and of its one MapLibre layer. */
export const layerId = (slug: string) => `layer:${slug}`

/** Whether a MapLibre source or layer is a layer shown on the basemap. */
export const isLayerId = (id: string) => id.startsWith('layer:')

/** The slug of the layer a MapLibre source or layer draws. */
export const layerSlug = (id: string) => id.replace(/^layer:/, '')

/**
 * A basemap's style: the style itself for vector basemaps, or a style with
 * one raster layer for the others.
 */
export function basemapStyle(layer: Layer): StyleSpecification | string {
  const { source } = layer
  if (source.type === 'style') return source.url
  const id = `basemap:${layer.slug}`
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

export function sourceSpec(source: SingleLayerSource): SourceSpecification {
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
      // IDs for each feature, so the one whose popup is open can be picked out.
      return {
        type: 'geojson',
        data: source.url,
        attribution: credit,
        generateId: true,
      }
  }
}

export function layerSpec(layer: Layer): AddLayerObject {
  const id = layerId(layer.slug)
  if (layer.source.type !== 'geojson') {
    return { id, type: 'raster', source: id }
  }
  // Directional pins point the way a photo was taken.
  const direction = layer.source.properties?.direction
  return {
    id,
    type: 'symbol',
    source: id,
    layout: {
      ...pinLayout(layer),
      'icon-rotate': direction ? ['to-number', ['get', direction], 0] : 0,
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  }
}

type SymbolLayout = NonNullable<
  Extract<AddLayerObject, { type: 'symbol' }>['layout']
>

// Pin images, with the selected one for the feature whose popup is open,
// drawn above the others.
function pinLayout(
  layer: Layer,
  selectedId?: string | number,
): Pick<SymbolLayout, 'icon-image' | 'symbol-sort-key'> {
  const directional =
    layer.source.type === 'geojson' &&
    Boolean(layer.source.properties?.direction)
  const pin = directional ? DIRECTIONAL_PIN : PIN
  if (selectedId === undefined) {
    return { 'icon-image': pin, 'symbol-sort-key': 0 }
  }
  return {
    'icon-image': [
      'case',
      ['==', ['id'], selectedId],
      directional ? SELECTED_DIRECTIONAL_PIN : SELECTED_PIN,
      pin,
    ],
    'symbol-sort-key': ['case', ['==', ['id'], selectedId], 1, 0],
  }
}

/** Shows which of a layer's pins has its popup open, or none. */
export function setSelectedPin(
  map: MapLibreMap,
  layer: Layer,
  featureId?: string | number,
) {
  const id = layerId(layer.slug)
  if (!map.getLayer(id)) return
  const layout = pinLayout(layer, featureId)
  map.setLayoutProperty(id, 'icon-image', layout['icon-image'])
  map.setLayoutProperty(id, 'symbol-sort-key', layout['symbol-sort-key'])
}

/** Fades a raster layer. Pins always stay fully opaque. */
export function setLayerOpacity(
  map: MapLibreMap,
  layer: Layer,
  opacity: number,
) {
  if (layer.source.type === 'geojson') return
  map.setPaintProperty(layerId(layer.slug), 'raster-opacity', opacity)
}

/** The text and images for a pin's popup. */
export function popupContent(
  layer: Layer,
  feature: MapGeoJSONFeature,
): HTMLElement {
  const element = document.createElement('div')
  element.className = 'map-popup'
  if (layer.source.type !== 'geojson') return element
  const { text, images } = layer.source.properties ?? {}
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
