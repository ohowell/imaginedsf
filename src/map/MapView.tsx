import { cogProtocol } from '@geomatico/maplibre-cog-protocol'
import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder'
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css'
import * as maplibregl from 'maplibre-gl'
import {
  addProtocol,
  Map as MapLibreMap,
  GeolocateControl,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type FitBoundsOptions,
  type FlyToOptions,
  type LngLatBoundsLike,
  type MapMouseEvent,
  type TransformStyleFunction,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// After MapLibre's styles, which it overrides.
import './map.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import content from 'virtual:content'
import { BAY_AREA } from '../../plugins/content/bounds.ts'
import { useTheme } from '../theme.ts'
import { prepareCog } from './cog.ts'
import { MapContext } from './context.ts'
import { nominatim } from './geocoder.ts'
import {
  basemapStyle,
  isLayerId,
  layerId,
  layerSlug,
  layerSpec,
  popupContent,
  setLayerOpacity,
  setSelectedPin,
  sourceSpec,
} from './layers.ts'
import { addMissingPin, PIN_SIZE } from './pins.ts'

// MapLibre finds its worker next to its own file, which Vite moves, so point
// it at a bundled copy instead.
setWorkerUrl(workerUrl)
addProtocol('cog', cogProtocol)

const SAN_FRANCISCO: LngLatBoundsLike = [
  [-122.5386, 37.6888],
  [-122.3486, 37.8224],
]

// Far enough out to fit the widest layers, the bay-wide harbour charts, with
// some room around them on a phone-sized map.
const MIN_ZOOM = 7.5

// Room left around a box the map zooms to.
const FOCUS_PADDING = 40

// Search results with an extent are fitted to it, and points flown to; either
// way, no closer in than a few blocks.
const SEARCH_ZOOM: FlyToOptions & FitBoundsOptions = { maxZoom: 17 }

// Carries the layers shown on top over to a new basemap's style.
const keepLayers: TransformStyleFunction = (previous, next) => ({
  ...next,
  sources: {
    ...next.sources,
    ...Object.fromEntries(
      Object.entries(previous?.sources ?? {}).filter(([id]) => isLayerId(id)),
    ),
  },
  layers: [
    ...next.layers,
    ...(previous?.layers ?? []).filter(({ id }) => isLayerId(id)),
  ],
})

interface MapViewProps {
  /** Slug of the basemap. */
  basemap: string
  /** Slugs of the layers to show on the basemap, from bottom to top. */
  layers: string[]
  /** Opacity by slug, from 0 to 1. Layers without one are opaque. */
  opacity: Record<string, number>
  /**
   * A box to zoom to whenever it changes, with room around it unless `padding`
   * says otherwise. The map starts out showing the first one.
   */
  focus?: { bbox: [number, number, number, number]; padding?: number }
  /** Called with the visible area as it changes, as west, south, east, north. */
  onViewChange?: (bbox: [number, number, number, number]) => void
  /** Controls to float over the map, like `MapControl`s. */
  children?: ReactNode
}

export function MapView({
  basemap,
  layers,
  opacity,
  focus,
  onViewChange,
  children,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
  const initialFocus = useRef(focus)
  const [map, setMap] = useState<MapLibreMap>()
  // Settles once the current basemap's style has loaded, since changing the
  // basemap replaces the whole style.
  const styleLoaded = useRef<Promise<void>>(Promise.resolve())
  // Read when a layer finishes loading, which can be after opacity changes.
  const latestOpacity = useRef(opacity)
  useEffect(() => {
    latestOpacity.current = opacity
  })

  useEffect(() => {
    if (!container.current) return
    const map = new MapLibreMap({
      container: container.current,
      style: { version: 8, sources: {}, layers: [] },
      // A linked view or layers, or else the whole city edge to edge.
      ...(initialFocus.current
        ? {
            bounds: initialFocus.current.bbox,
            fitBoundsOptions: {
              padding: initialFocus.current.padding ?? FOCUS_PADDING,
            },
          }
        : { bounds: SAN_FRANCISCO }),
      // Also keeps the location button from leaving the Bay Area.
      maxBounds: BAY_AREA,
      minZoom: MIN_ZOOM,
      attributionControl: {
        compact: true,
        customAttribution:
          'Search by <a href="https://nominatim.org/">Nominatim</a>',
      },
    })
    // Searches only when asked, never as someone types; see nominatim.
    map.addControl(
      new MaplibreGeocoder(nominatim, {
        maplibregl,
        placeholder: 'Search for an address or place',
        showResultMarkers: false,
        flyTo: SEARCH_ZOOM,
        enableEventLogging: false,
      }),
      'top-left',
    )
    map.addControl(new NavigationControl(), 'top-left')
    // Finds the visitor and follows them as they move, until they turn it off.
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-left',
    )
    map.setMissingStyleImageResolver((id) => addMissingPin(map, id))
    map.on('load', () => setMap(map))
    return () => map.remove()
  }, [])

  // Basemaps with a dark version switch to it in dark mode. The rest stay put,
  // so changing the color scheme doesn't reload them.
  const theme = useTheme()
  const basemapSource = content.layers[basemap].source
  const darkBasemap =
    theme === 'dark' &&
    basemapSource.type === 'style' &&
    basemapSource.darkUrl !== undefined

  useEffect(() => {
    if (!map) return
    let cancelled = false
    styleLoaded.current = new Promise((resolve) =>
      map.once('style.load', () => resolve()),
    )
    const { source } = content.layers[basemap]
    const change = async () => {
      // Colors have to be set up before the first tile is drawn.
      if (source.type === 'cog') {
        await prepareCog(source.url).catch(console.error)
      }
      if (cancelled) return
      // A full change, since styles differ too much to update in place.
      map.setStyle(basemapStyle(content.layers[basemap], darkBasemap), {
        diff: false,
        transformStyle: keepLayers,
      })
    }
    void change()
    return () => {
      cancelled = true
    }
  }, [map, basemap, darkBasemap])

  // Adds, removes and reorders layers to match `layers`. Sources are only
  // added once shown, so hidden COGs aren't fetched.
  useEffect(() => {
    if (!map) return
    let cancelled = false
    const sync = async () => {
      await styleLoaded.current
      if (cancelled) return
      const ids = new Set(layers.map(layerId))
      for (const { id } of map.getStyle().layers) {
        if (isLayerId(id) && !ids.has(id)) {
          map.removeLayer(id)
          map.removeSource(id)
        }
      }
      for (const slug of layers) {
        const id = layerId(slug)
        const { source } = content.layers[slug]
        if (map.getSource(id) || source.type === 'style') continue
        // Colors have to be set up before the first tile is drawn.
        if (source.type === 'cog') {
          await prepareCog(source.url).catch(console.error)
          await styleLoaded.current
          if (cancelled || map.getSource(id)) continue
        }
        map.addSource(id, sourceSpec(source))
        map.addLayer(layerSpec(content.layers[slug]))
        setLayerOpacity(
          map,
          content.layers[slug],
          latestOpacity.current[slug] ?? 1,
        )
      }
      if (cancelled) return
      for (const slug of layers) {
        if (map.getLayer(layerId(slug))) map.moveLayer(layerId(slug))
      }
    }
    void sync()
    return () => {
      cancelled = true
    }
  }, [map, layers])

  // Layers still loading get their opacity when they're added, and a new
  // basemap style brings layers over as they were when it started loading.
  useEffect(() => {
    if (!map) return
    const apply = () => {
      for (const slug of layers) {
        if (!map.getLayer(layerId(slug))) continue
        setLayerOpacity(map, content.layers[slug], opacity[slug] ?? 1)
      }
    }
    apply()
    map.on('style.load', apply)
    return () => {
      map.off('style.load', apply)
    }
  }, [map, layers, opacity])

  useEffect(() => {
    if (map && focus) {
      map.fitBounds(focus.bbox, { padding: focus.padding ?? FOCUS_PADDING })
    }
  }, [map, focus])

  useEffect(() => {
    if (!map || !onViewChange) return
    const report = () => {
      const [[west, south], [east, north]] = map.getBounds().toArray()
      onViewChange([west, south, east, north])
    }
    report()
    map.on('moveend', report)
    return () => {
      map.off('moveend', report)
    }
  }, [map, onViewChange])

  // Pins open a popup with their caption and photos.
  useEffect(() => {
    if (!map) return
    const pinAt = (event: MapMouseEvent) =>
      map
        .queryRenderedFeatures(event.point)
        .find((feature) => isLayerId(feature.layer.id))
    // The pin whose popup is open, which looks selected.
    type Pin = { slug: string; id: string | number }
    let selected: Pin | undefined
    const select = (pin?: Pin) => {
      if (selected) setSelectedPin(map, content.layers[selected.slug])
      selected = pin
      if (pin) setSelectedPin(map, content.layers[pin.slug], pin.id)
    }
    const onClick = (event: MapMouseEvent) => {
      const feature = pinAt(event)
      if (feature?.geometry.type !== 'Point') return
      const slug = layerSlug(feature.layer.id)
      const pin =
        feature.id === undefined ? undefined : { slug, id: feature.id }
      select(pin)
      // Opens beside the pin's target rather than over it.
      const popup = new Popup({ maxWidth: '20rem', offset: PIN_SIZE / 2 })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setDOMContent(popupContent(content.layers[slug], feature))
      // Clicking another pin closes this popup after opening the next, so
      // only deselect if this popup's pin is still the selected one.
      popup.on('close', () => {
        if (selected === pin) select()
      })
      popup.addTo(map)
    }
    const onMove = (event: MapMouseEvent) => {
      map.getCanvas().style.cursor = pinAt(event) ? 'pointer' : ''
    }
    map.on('click', onClick)
    map.on('mousemove', onMove)
    return () => {
      map.off('click', onClick)
      map.off('mousemove', onMove)
    }
  }, [map])

  return (
    <MapContext value={map}>
      <div ref={container} className="map" />
      {children}
    </MapContext>
  )
}
