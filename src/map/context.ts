import type { Map as MapLibreMap } from 'maplibre-gl'
import { createContext } from 'react'

/** The map that `MapView` draws, once it has loaded. */
export const MapContext = createContext<MapLibreMap | undefined>(undefined)
