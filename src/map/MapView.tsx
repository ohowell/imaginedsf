import { cogProtocol } from '@geomatico/maplibre-cog-protocol'
import {
  addProtocol,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type LngLatBoundsLike,
  type MapMouseEvent,
  type TransformStyleFunction,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import content from 'virtual:content'
import { prepareCog } from './cog.ts'
import {
  basemapStyle,
  isLayerId,
  layerId,
  layerSpec,
  popupContent,
  setLayerOpacity,
  sourceSpec,
} from './layers.ts'
import { addMissingPin } from './pins.ts'

// MapLibre finds its worker next to its own file, which Vite moves, so point
// it at a bundled copy instead.
setWorkerUrl(workerUrl)
addProtocol('cog', cogProtocol)

const SAN_FRANCISCO: LngLatBoundsLike = [
  [-122.5386, 37.6888],
  [-122.3486, 37.8224],
]

// Far enough out to fit the widest maps, the bay-wide harbour charts, with
// some room around them on a phone-sized map.
const MIN_ZOOM = 7.5

// Carries the maps shown on top over to a new basemap's style.
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
  /** Slugs of the maps to show on the basemap, from bottom to top. */
  layers: string[]
  /** Opacity by slug, from 0 to 1. Maps without one are opaque. */
  opacity: Record<string, number>
  /** A box to zoom to whenever it changes. */
  focus?: { bbox: [number, number, number, number] }
}

export function MapView({ basemap, layers, opacity, focus }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
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
      bounds: SAN_FRANCISCO,
      minZoom: MIN_ZOOM,
      attributionControl: { compact: true },
    })
    map.addControl(new NavigationControl(), 'top-right')
    map.setMissingStyleImageResolver((id) => addMissingPin(map, id))
    map.on('load', () => setMap(map))
    return () => map.remove()
  }, [])

  useEffect(() => {
    if (!map) return
    let cancelled = false
    styleLoaded.current = new Promise((resolve) =>
      map.once('style.load', () => resolve()),
    )
    const { source } = content.maps[basemap]
    const change = async () => {
      // Colors have to be set up before the first tile is drawn.
      if (source.type === 'cog') {
        await prepareCog(source.url).catch(console.error)
      }
      if (cancelled) return
      // A full change, since styles differ too much to update in place.
      map.setStyle(basemapStyle(content.maps[basemap]), {
        diff: false,
        transformStyle: keepLayers,
      })
    }
    void change()
    return () => {
      cancelled = true
    }
  }, [map, basemap])

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
        const { source } = content.maps[slug]
        if (map.getSource(id) || source.type === 'style') continue
        // Colors have to be set up before the first tile is drawn.
        if (source.type === 'cog') {
          await prepareCog(source.url).catch(console.error)
          await styleLoaded.current
          if (cancelled || map.getSource(id)) continue
        }
        map.addSource(id, sourceSpec(source))
        map.addLayer(layerSpec(content.maps[slug]))
        setLayerOpacity(
          map,
          content.maps[slug],
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
        setLayerOpacity(map, content.maps[slug], opacity[slug] ?? 1)
      }
    }
    apply()
    map.on('style.load', apply)
    return () => {
      map.off('style.load', apply)
    }
  }, [map, layers, opacity])

  useEffect(() => {
    if (map && focus) map.fitBounds(focus.bbox, { padding: 40 })
  }, [map, focus])

  // Pins open a popup with their caption and photos.
  useEffect(() => {
    if (!map) return
    const pinAt = (event: MapMouseEvent) =>
      map
        .queryRenderedFeatures(event.point)
        .find((feature) => isLayerId(feature.layer.id))
    const onClick = (event: MapMouseEvent) => {
      const feature = pinAt(event)
      if (feature?.geometry.type !== 'Point') return
      const slug = feature.layer.id.replace(/^map:/, '')
      new Popup({ maxWidth: '20rem' })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setDOMContent(popupContent(content.maps[slug], feature))
        .addTo(map)
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

  return <div ref={container} className="map" />
}
