import type { ContentIssue, RawContent } from './load.ts'
import { renderMarkdown } from './markdown.ts'
import { pageNames, type PageName } from './schema.ts'
import type { Content, Page } from './types.ts'

// Rough extent of the San Francisco Bay Area, for catching bad coordinates.
const BAY_AREA = [-123.2, 37.1, -121.5, 38.5]

interface Listing {
  file: string
  /** Slug of the group or map it's listed under, if any. */
  parent?: string
}

/**
 * Checks references between content files and assembles the content the
 * site uses. Maps and groups that aren't listed anywhere are left out.
 */
export function resolveContent(
  raw: RawContent,
  { base = '/' }: { base?: string } = {},
): {
  content: Content | undefined
  /** Files in assets/ that the content uses, which the site has to include. */
  assets: string[]
  errors: ContentIssue[]
  warnings: ContentIssue[]
} {
  const errors: ContentIssue[] = []
  const warnings: ContentIssue[] = []
  const error = (file: string, message: string) =>
    errors.push({ file, message })
  const warn = (file: string, message: string) =>
    warnings.push({ file, message })

  const maps = new Map(raw.maps.map((entry) => [entry.slug, entry]))
  const groups = new Map(raw.groups.map((entry) => [entry.slug, entry]))
  const pages = new Map(raw.pages.map((entry) => [entry.slug, entry]))

  // Eras list maps and groups by slug, so the two can't share one.
  for (const group of raw.groups) {
    const map = maps.get(group.slug)
    if (map) {
      error(group.file, `slug is also used by ${map.file}`)
    }
  }

  // WordPress IDs identify items in links from the old site.
  const wordpressIds = new Map<number, string>()
  for (const entry of [...raw.maps, ...raw.groups, ...raw.eras]) {
    const id = entry.data.wordpressId
    if (id === undefined) continue
    const other = wordpressIds.get(id)
    if (other) {
      error(entry.file, `wordpressId ${id} is also used by ${other}`)
    } else {
      wordpressIds.set(id, entry.file)
    }
  }

  // Each map or group is listed in one place: the basemaps, an era, a group,
  // or a map.
  const listings = new Map<string, Listing>()
  function list(slug: string, listing: Listing, allowGroups: boolean) {
    if (!maps.has(slug) && !(allowGroups && groups.has(slug))) {
      error(
        listing.file,
        groups.has(slug)
          ? `"${slug}" is a group, but only maps can be listed here`
          : `no ${allowGroups ? 'map or group' : 'map'} named "${slug}"`,
      )
      return
    }
    const previous = listings.get(slug)
    if (previous) {
      error(listing.file, `"${slug}" is also listed in ${previous.file}`)
      return
    }
    listings.set(slug, listing)
  }

  const site = raw.site
  if (site) {
    for (const slug of site.data.basemaps) {
      list(slug, { file: site.file }, false)
    }
    if (!site.data.basemaps.includes(site.data.defaultBasemap)) {
      error(
        site.file,
        `defaultBasemap "${site.data.defaultBasemap}" isn't one of the basemaps`,
      )
    }
    // Styles draw a whole map, and basemaps draw under everything else.
    for (const map of raw.maps) {
      const isBasemap = site.data.basemaps.includes(map.slug)
      const { type } = map.data.source
      if (type === 'style' && !isBasemap) {
        error(
          map.file,
          'source: styles draw a whole map, so only basemaps can use them',
        )
      } else if (type === 'geojson' && isBasemap) {
        error(
          map.file,
          'source: basemaps must be styles or raster maps (cog, wms or tile)',
        )
      }
    }
  }
  for (const era of raw.eras) {
    for (const slug of era.data.items) {
      list(slug, { file: era.file }, true)
    }
  }
  for (const group of raw.groups) {
    for (const slug of group.data.maps) {
      list(slug, { file: group.file, parent: group.slug }, false)
    }
  }
  // Maps can have maps as children, like details and photos of a plan.
  for (const map of raw.maps) {
    for (const slug of map.data.children ?? []) {
      list(slug, { file: map.file, parent: map.slug }, false)
    }
  }
  for (const map of raw.maps) {
    if (!map.data.children) continue
    const parent = listings.get(map.slug)?.parent
    if (parent && maps.has(parent)) {
      error(
        map.file,
        `children: "${map.slug}" is listed under "${parent}", so it can't have children of its own`,
      )
    } else if (site?.data.basemaps.includes(map.slug)) {
      error(map.file, "children: basemaps can't have children")
    }
  }

  // Groups are shown when listed in an era; maps when listed anywhere shown.
  // Maps listed under each other are already errors, but mustn't loop here.
  const isShown = (slug: string): boolean => {
    const seen = new Set<string>()
    for (let current: string | undefined = slug; current;) {
      const listing = listings.get(current)
      if (!listing || seen.has(current)) return false
      seen.add(current)
      current = listing.parent
    }
    return true
  }
  const shownMaps = raw.maps.filter((map) => isShown(map.slug))
  const shownGroups = raw.groups.filter((group) => isShown(group.slug))

  for (const group of raw.groups) {
    if (!listings.has(group.slug)) {
      warn(
        group.file,
        "isn't listed in any era, so it and its maps aren't shown",
      )
    }
  }
  for (const map of raw.maps) {
    if (!listings.has(map.slug)) {
      warn(
        map.file,
        "isn't listed in any era, group, map or basemap list, so it isn't shown",
      )
    }
  }

  for (const map of shownMaps) {
    const target = map.data.showWith
    if (target !== undefined && !isShown(target)) {
      error(
        map.file,
        maps.has(target)
          ? `showWith "${target}" isn't shown on the site`
          : `showWith: no map named "${target}"`,
      )
    }
    const bbox = map.data.bbox
    if (
      bbox &&
      (bbox[0] > BAY_AREA[2] ||
        bbox[2] < BAY_AREA[0] ||
        bbox[1] > BAY_AREA[3] ||
        bbox[3] < BAY_AREA[1])
    ) {
      warn(
        map.file,
        'bbox is outside the San Francisco Bay Area; check its coordinates',
      )
    }
  }

  // Bodies are rendered up front so the files they refer to can be checked.
  const html = new Map<string, string>()
  for (const { file, body } of [
    ...shownMaps,
    ...shownGroups,
    ...raw.eras,
    ...raw.pages,
  ]) {
    html.set(file, renderMarkdown(body))
  }

  // Content refers to files in assets/ by path, like /assets/images/x.jpg.
  const assetFiles = new Set(raw.assets)
  const usedAssets = new Set<string>()
  function checkAsset(file: string, reference: string, field: string) {
    const asset = safeDecode(reference).slice(1)
    if (assetFiles.has(asset)) {
      usedAssets.add(asset)
    } else {
      error(file, `${field}: no file at "${reference}"`)
    }
  }
  for (const [file, body] of html) {
    for (const [, reference] of body.matchAll(ASSET_ATTRIBUTE)) {
      checkAsset(file, reference, 'body')
    }
  }
  for (const map of shownMaps) {
    const { source } = map.data
    if (source.type !== 'geojson' || !isAsset(source.url)) continue
    checkAsset(map.file, source.url, 'source.url')
    const key = source.properties?.images
    const geojson = raw.geojson.get(source.url.slice(1))
    if (!key || !geojson) continue
    for (const reference of popupImages(geojson, key)) {
      if (isAsset(reference)) checkAsset(source.url.slice(1), reference, key)
    }
  }
  for (const asset of raw.assets) {
    if (!usedAssets.has(asset)) {
      warn(asset, "isn't used by any content")
    }
  }

  for (const name of pageNames) {
    if (!pages.has(name)) {
      error(`${raw.dir}/pages/${name}.md`, 'missing; the site uses this page')
    }
  }
  for (const page of raw.pages) {
    if (!(pageNames as readonly string[]).includes(page.slug)) {
      error(page.file, `isn't a page the site uses (${pageNames.join(', ')})`)
    }
  }

  if (errors.length > 0 || !site) {
    return { content: undefined, assets: [], errors, warnings }
  }

  // Asset paths get the site's base path, like /imaginedsf/assets/...
  const withBase = (url: string) =>
    isAsset(url) ? `${base}${url.slice(1)}` : url
  const rendered = (file: string) =>
    (html.get(file) ?? '').replaceAll('="/assets/', `="${base}assets/`)

  const content: Content = {
    maps: Object.fromEntries(
      shownMaps.map(({ slug, file, data }) => [
        slug,
        {
          ...data,
          source: { ...data.source, url: withBase(data.source.url) },
          slug,
          description: rendered(file),
        },
      ]),
    ),
    groups: Object.fromEntries(
      shownGroups.map(({ slug, file, data }) => [
        slug,
        { ...data, slug, description: rendered(file) },
      ]),
    ),
    eras: raw.eras
      .map(({ slug, file, data }) => ({
        ...data,
        slug,
        description: rendered(file),
      }))
      .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title)),
    basemaps: site.data.basemaps,
    defaultBasemap: site.data.defaultBasemap,
    pages: Object.fromEntries(
      raw.pages.map(({ slug, file, data }) => [
        slug,
        { ...data, body: rendered(file) },
      ]),
    ) as Record<PageName, Page>,
  }
  return { content, assets: [...usedAssets].sort(), errors, warnings }
}

const ASSET_ATTRIBUTE = /(?:src|href)="(\/assets\/[^"]*)"/g

const isAsset = (url: string) => url.startsWith('/assets/')

function safeDecode(url: string) {
  try {
    return decodeURI(url)
  } catch {
    return url
  }
}

// Each feature lists its popup images, separated by commas, in one property.
function popupImages(geojson: unknown, key: string): string[] {
  const { features = [] } = geojson as {
    features?: { properties?: Record<string, unknown> | null }[]
  }
  return features.flatMap((feature) =>
    String(feature.properties?.[key] ?? '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean),
  )
}
