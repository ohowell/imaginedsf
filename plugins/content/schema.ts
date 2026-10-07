import { z } from 'zod'

// Schemas for the front matter of files in content/. Unknown keys are errors,
// so typos fail the build instead of being silently ignored.

/* Content metadata: title, date, references, etc */
// Another content file, named by its file name, which becomes its slug.
const file = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/, {
    error: 'must be a file name such as "fulton-circle.md"',
  })
  .transform((name) => name.slice(0, -'.md'.length))
const files = z.array(file).optional()
const title = z.string().trim().min(1)
const year = z.int().min(1500).max(2100)
const httpsUrl = z.url({ protocol: /^https$/, error: 'must be an https URL' })
// An https URL, or the path of a file in assets/ with one of these extensions.
const httpsOrAssetUrl = (extensions: string, example: string) => {
  const assetPath = new RegExp(
    `^/assets/(?:[\\w-][\\w.-]*/)*[\\w-][\\w.-]*\\.(?:${extensions})$`,
    'i',
  )
  return z
    .string()
    .refine(
      (url) =>
        /^https:\/\//.test(url) ? URL.canParse(url) : assetPath.test(url),
      { error: `must be an https URL or a file in assets/, like "${example}"` },
    )
}
const wordpressId = z.int().positive().optional()

/* Layer metadata */
const zoom = z.int().min(0).max(24)
const longitude = z.number().min(-180).max(180)
const latitude = z.number().min(-90).max(90)
const bbox = z
  .tuple([longitude, latitude, longitude, latitude])
  .refine(([west, south, east, north]) => west < east && south < north, {
    error:
      'must be [west, south, east, north] with west < east and south < north',
  })

/* Layer source types */
const wmsSource = z.strictObject({
  type: z.literal('wms'),
  url: httpsUrl,
  layers: z.string().min(1),
  minZoom: zoom.optional(),
  maxZoom: zoom.optional(),
})

const xyzTileSource = z.strictObject({
  type: z.literal('tile'),
  url: z.string().regex(/^https:\/\/\S*\{z\}\S*\{x\}\S*\{y\}/, {
    error: 'must be an https URL template containing {z}, {x} and {y}',
  }),
  minZoom: zoom.optional(),
  maxZoom: zoom.optional(),
})
const geoJsonSource = z.strictObject({
  type: z.literal('geojson'),
  url: httpsOrAssetUrl('geojson|json', '/assets/geojson/fulton-circle.geojson'),
  // Names of the feature properties that hold popup text, comma-separated
  // popup image URLs, and pin direction in degrees.
  properties: z
    .strictObject({
      text: z.string().min(1).optional(),
      images: z.string().min(1).optional(),
      direction: z.string().min(1).optional(),
    })
    .optional(),
})
// A Cloud Optimized GeoTIFF, which the browser reads directly, downloading
// only the parts of the file it needs.
const cogSource = z.strictObject({
  type: z.literal('cog'),
  url: httpsUrl.regex(/\.tiff?(\?.*)?$/i, {
    error: 'must be a .tif or .tiff file',
  }),
})
// A MapLibre style, like a vector tile basemap from OpenFreeMap. Styles draw
// a whole map, so they can only be basemaps.
const styleUrl = httpsOrAssetUrl('json', '/assets/styles/simple-dark.json')
const styleSource = z.strictObject({
  type: z.literal('style'),
  url: styleUrl,
  // A style to use instead when the page is in dark mode.
  darkUrl: styleUrl.optional(),
})
const source = z.discriminatedUnion('type', [
  wmsSource,
  xyzTileSource,
  geoJsonSource,
  cogSource,
  styleSource,
])

/* Schemas for each type of Markdown file */
export const layerSchema = z.strictObject({
  title,
  year: year.optional(),
  // A layer that helps read this one, offered to show underneath it.
  showWith: file.optional(),
  source,
  bbox: bbox.optional(),
  // Layers listed under this one, like a plan's details and photos.
  layers: files,
  wordpressId,
})

export const groupSchema = z
  .strictObject({
    title,
    year: year.optional(),
    // For groups that span years, like a series of surveys.
    endYear: year.optional(),
    layers: files,
    wordpressId,
  })
  .refine(({ year, endYear }) => endYear === undefined || year !== undefined, {
    error: 'endYear needs a year to start from',
    path: ['endYear'],
  })
  .refine(({ year, endYear }) => !year || !endYear || year < endYear, {
    error: 'endYear must be after year',
    path: ['endYear'],
  })

export const eraSchema = z
  .strictObject({
    title,
    start: year,
    end: year,
    groups: files,
    layers: files,
    wordpressId,
  })
  .refine(({ start, end }) => start <= end, {
    error: 'start must not be after end',
  })

export const pageSchema = z.strictObject({ title })

export const siteSchema = z.strictObject({
  basemaps: z.array(file).min(1),
  defaultBasemap: file,
})

export const pageNames = [
  'introduction',
  'maps-and-plans',
  'bibliography',
  'credits',
  'feedback',
] as const

export type LayerData = z.output<typeof layerSchema>
export type GroupData = z.output<typeof groupSchema>
export type EraData = z.output<typeof eraSchema>
export type PageData = z.output<typeof pageSchema>
export type SiteData = z.output<typeof siteSchema>
export type PageName = (typeof pageNames)[number]
