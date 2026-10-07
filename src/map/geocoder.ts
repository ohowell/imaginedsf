import type {
  CarmenGeojsonFeature,
  MaplibreGeocoderApi,
} from '@maplibre/maplibre-gl-geocoder'
import { BAY_AREA } from '../../plugins/content/bounds.ts'

type NominatimFeature = GeoJSON.Feature<
  GeoJSON.Point,
  { name?: string; display_name: string; category: string; type: string }
> & { bbox?: [number, number, number, number] }

// Names without the parts every result shares, like "Coit Tower, Telegraph
// Hill, San Francisco, 94133" without ", California" and ", United States".
const shortName = (name: string) =>
  name.replace(/, United States$/, '').replace(/, California(?=, \d|$)/, '')

/**
 * Search with Nominatim, OpenStreetMap's geocoder, for places in the area the
 * map covers. Its usage policy allows searching when asked but not as someone
 * types, which is how the search box works by default.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
export const nominatim: MaplibreGeocoderApi = {
  async forwardGeocode({ query, limit }) {
    const params = new URLSearchParams({
      q: String(query),
      format: 'geojson',
      viewbox: BAY_AREA.join(','),
      bounded: '1',
      countrycodes: 'us',
      limit: String(limit ?? 5),
    })
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
    )
    if (!response.ok) {
      throw new Error(`Nominatim responded with ${response.status}`)
    }
    const { features } = (await response.json()) as {
      features: NominatimFeature[]
    }
    return {
      type: 'FeatureCollection',
      features: features.map((feature): CarmenGeojsonFeature => ({
        ...feature,
        text: feature.properties.name || feature.properties.display_name,
        place_name: shortName(feature.properties.display_name),
        place_type: [feature.properties.type],
      })),
    }
  },
}
