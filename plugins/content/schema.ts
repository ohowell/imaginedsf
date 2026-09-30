import { z } from 'zod'

// Schemas for the front matter of files in content/. Unknown keys are errors,
// so typos fail the build instead of being silently ignored.

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  error: 'must be a lowercase slug such as "fulton-circle"',
})
const title = z.string().trim().min(1)
const year = z.int().min(1500).max(2100)
const zoom = z.int().min(0).max(24)
const httpsUrl = z.url({ protocol: /^https$/, error: 'must be an https URL' })
const wordpressId = z.int().positive().optional()

const longitude = z.number().min(-180).max(180)
const latitude = z.number().min(-90).max(90)
const bbox = z
  .tuple([longitude, latitude, longitude, latitude])
  .refine(([west, south, east, north]) => west < east && south < north, {
    error: 'must be [west, south, east, north] with west < east and south < north',
  })

const source = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('wms'),
    url: httpsUrl,
    layers: z.string().min(1),
    minZoom: zoom.optional(),
    maxZoom: zoom.optional(),
  }),
  z.strictObject({
    type: z.literal('tile'),
    url: z.string().regex(/^https:\/\/\S*\{z\}\S*\{x\}\S*\{y\}/, {
      error: 'must be an https URL template containing {z}, {x} and {y}',
    }),
    minZoom: zoom.optional(),
    maxZoom: zoom.optional(),
  }),
  z.strictObject({
    type: z.literal('geojson'),
    url: httpsUrl,
    // Names of the feature properties that hold popup text, comma-separated
    // popup image URLs, and pin direction in degrees.
    properties: z
      .strictObject({
        text: z.string().min(1).optional(),
        images: z.string().min(1).optional(),
        direction: z.string().min(1).optional(),
      })
      .optional(),
  }),
])

export const mapSchema = z.strictObject({
  title,
  year: year.optional(),
  indented: z.boolean().optional(),
  recommendedBasemap: slug.optional(),
  source,
  bbox: bbox.optional(),
  wordpressId,
})

export const groupSchema = z.strictObject({
  title,
  year: year.optional(),
  maps: z.array(slug).min(1),
  wordpressId,
})

export const eraSchema = z
  .strictObject({
    title,
    start: year,
    end: year,
    items: z.array(slug),
    wordpressId,
  })
  .refine(({ start, end }) => start <= end, {
    error: 'start must not be after end',
  })

export const pageSchema = z.strictObject({ title })

export const siteSchema = z.strictObject({
  basemaps: z.array(slug).min(1),
  defaultBasemap: slug,
})

export const pageNames = [
  'introduction',
  'maps-and-plans',
  'bibliography',
  'credits',
  'feedback',
] as const

export type MapData = z.output<typeof mapSchema>
export type GroupData = z.output<typeof groupSchema>
export type EraData = z.output<typeof eraSchema>
export type PageData = z.output<typeof pageSchema>
export type SiteData = z.output<typeof siteSchema>
export type PageName = (typeof pageNames)[number]
