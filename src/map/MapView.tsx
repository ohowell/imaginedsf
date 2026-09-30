import { cogProtocol } from '@geomatico/maplibre-cog-protocol'
import {
  addProtocol,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type LngLatBoundsLike,
  type MapMouseEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import content from 'virtual:content'
import {
  layerId,
  layerSpec,
  popupContent,
  setLayerOpacity,
  sourceSpec,
} from './layers.ts'
import { prepareCog } from './cog.ts'
import { addPinImages } from './pins.ts'

// MapLibre finds its worker next to its own file, which Vite moves, so point
// it at a bundled copy instead.
setWorkerUrl(workerUrl)
addProtocol('cog', cogProtocol)

const SAN_FRANCISCO: LngLatBoundsLike = [
  [-122.5386, 37.6888],
  [-122.3486, 37.8224],
]

interface MapViewProps {
  /** Slugs of the maps to show, from bottom to top. */
  layers: string[]
  /** Opacity by slug, from 0 to 1. Maps without one are opaque. */
  opacity: Record<string, number>
  /** A box to zoom to whenever it changes. */
  focus?: { bbox: [number, number, number, number] }
}

export function MapView({ layers, opacity, focus }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap>()
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
      attributionControl: { compact: true },
    })
    map.addControl(new NavigationControl(), 'top-right')
    map.on('load', () => {
      addPinImages(map)
      setMap(map)
    })
    return () => map.remove()
  }, [])

  // Adds, removes and reorders layers to match `layers`. Sources are only
  // added once shown, so hidden COGs aren't fetched.
  useEffect(() => {
    if (!map) return
    let cancelled = false
    const ids = new Set(layers.map(layerId))
    for (const { id } of map.getStyle().layers) {
      if (!ids.has(id)) {
        map.removeLayer(id)
        map.removeSource(id)
      }
    }
    const sync = async () => {
      for (const slug of layers) {
        const id = layerId(slug)
        const { source } = content.maps[slug]
        if (map.getSource(id)) continue
        // Colors have to be set up before the first tile is drawn.
        if (source.type === 'cog') {
          await prepareCog(source.url).catch(console.error)
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

  // Layers still loading get their opacity when they're added.
  useEffect(() => {
    if (!map) return
    for (const slug of layers) {
      if (!map.getLayer(layerId(slug))) continue
      setLayerOpacity(map, content.maps[slug], opacity[slug] ?? 1)
    }
  }, [map, layers, opacity])

  useEffect(() => {
    if (map && focus) map.fitBounds(focus.bbox, { padding: 40 })
  }, [map, focus])

  // Pins open a popup with their caption and photos.
  useEffect(() => {
    if (!map) return
    const pinAt = (event: MapMouseEvent) =>
      map.queryRenderedFeatures(event.point).find((feature) => {
        return feature.layer.id.startsWith('map:')
      })
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
