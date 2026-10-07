import { BAY_AREA } from './bounds.ts'
import type { ContentIssue, RawContent } from './load.ts'
import { renderMarkdown } from './markdown.ts'
import { pageNames, type PageName } from './schema.ts'
import type { Content, Page } from './types.ts'

interface Listing {
  /** The file that lists it. */
  file: string
  /** Slug of the era, group or layer it's listed under, unless a basemap. */
  parent?: string
}

// References name files, like "burnham-plan.md", so messages do too.
const named = (slug: string) => `"${slug}.md"`

/**
 * Checks references between content files and assembles the content the
 * site uses. Layers and groups that aren't listed anywhere are left out.
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

  const layers = new Map(raw.layers.map((entry) => [entry.slug, entry]))
  const groups = new Map(raw.groups.map((entry) => [entry.slug, entry]))
  const eras = new Map(raw.eras.map((entry) => [entry.slug, entry]))
  const pages = new Map(raw.pages.map((entry) => [entry.slug, entry]))

  // The site looks items up by slug, so layers, groups and eras can't share one.
  const slugs = new Map<string, string>()
  for (const entry of [...raw.layers, ...raw.groups, ...raw.eras]) {
    const other = slugs.get(entry.slug)
    if (other) {
      error(entry.file, `slug is also used by ${other}`)
    } else {
      slugs.set(entry.slug, entry.file)
    }
  }

  // WordPress IDs identify items in links from the old site.
  const wordpressIds = new Map<number, string>()
  for (const entry of [...raw.layers, ...raw.groups, ...raw.eras]) {
    const id = entry.data.wordpressId
    if (id === undefined) continue
    const other = wordpressIds.get(id)
    if (other) {
      error(entry.file, `wordpressId ${id} is also used by ${other}`)
    } else {
      wordpressIds.set(id, entry.file)
    }
  }

  // Each layer or group is listed in one place: in site.yml's basemaps, or
  // in a list of the era, group or layer it's under.
  const listings = new Map<string, Listing>()
  const children = new Map<string, string[]>()
  function list(
    slug: string,
    listing: Listing,
    field: string,
    kind: 'layer' | 'group',
  ) {
    if (!(kind === 'group' ? groups : layers).has(slug)) {
      error(listing.file, `${field}: no ${kind} named ${named(slug)}`)
      return
    }
    const previous = listings.get(slug)
    if (previous) {
      error(
        listing.file,
        `${field}: ${named(slug)} is also listed in ${previous.file}`,
      )
      return
    }
    listings.set(slug, listing)
    if (listing.parent) {
      children.set(listing.parent, [
        ...(children.get(listing.parent) ?? []),
        slug,
      ])
    }
  }

  const site = raw.site
  if (site) {
    for (const slug of site.data.basemaps) {
      list(slug, { file: site.file }, 'basemaps', 'layer')
    }
    if (!site.data.basemaps.includes(site.data.defaultBasemap)) {
      error(
        site.file,
        `defaultBasemap ${named(site.data.defaultBasemap)} isn't one of the basemaps`,
      )
    }
    // Styles draw a whole map, and basemaps draw under everything else.
    for (const layer of raw.layers) {
      const isBasemap = site.data.basemaps.includes(layer.slug)
      const { type } = layer.data.source
      if (type === 'style' && !isBasemap) {
        error(
          layer.file,
          'source: styles draw a whole map, so only basemaps can use them',
        )
      } else if (type === 'geojson' && isBasemap) {
        error(
          layer.file,
          'source: basemaps must be styles or raster layers (cog, wms or tile)',
        )
      }
    }
  }
  // Eras list groups and layers, groups list layers, and layers list layers,
  // like a plan's details and photos.
  for (const { slug, file, data } of raw.eras) {
    for (const group of data.groups ?? []) {
      list(group, { file, parent: slug }, 'groups', 'group')
    }
    for (const layer of data.layers ?? []) {
      list(layer, { file, parent: slug }, 'layers', 'layer')
    }
  }
  for (const { slug, file, data } of [...raw.groups, ...raw.layers]) {
    for (const layer of data.layers ?? []) {
      list(layer, { file, parent: slug }, 'layers', 'layer')
    }
  }
  // Layers under layers nest one level, and basemaps have none.
  for (const layer of raw.layers) {
    if (!layer.data.layers?.length) continue
    const listing = listings.get(layer.slug)
    if (listing && !listing.parent) {
      error(layer.file, "layers: it's a basemap, so it can't list layers")
    } else if (listing?.parent && layers.has(listing.parent)) {
      error(
        layer.file,
        `layers: it's listed under ${named(listing.parent)}, so it can't list layers too`,
      )
    }
  }
  for (const group of raw.groups) {
    if (!children.has(group.slug)) {
      error(group.file, 'layers: lists no layers')
    }
  }
  for (const era of raw.eras) {
    if (!children.has(era.slug)) {
      error(era.file, 'lists no groups or layers')
    }
  }

  // Eras are always shown, and the rest when listed under something shown.
  // Layers listed in a loop, which is an error above, aren't.
  const isShown = (slug: string, seen = new Set<string>()): boolean => {
    if (eras.has(slug)) return true
    const listing = listings.get(slug)
    if (!listing || seen.has(slug)) return false
    seen.add(slug)
    return !listing.parent || isShown(listing.parent, seen)
  }
  const shownLayers = raw.layers.filter((layer) => isShown(layer.slug))
  const shownGroups = raw.groups.filter((group) => isShown(group.slug))

  for (const group of raw.groups) {
    if (!listings.has(group.slug)) {
      warn(
        group.file,
        "isn't listed in an era, so it and its layers aren't shown",
      )
    }
  }
  for (const layer of raw.layers) {
    if (!listings.has(layer.slug)) {
      warn(
        layer.file,
        "isn't listed under an era, group or layer, or as a basemap, so it isn't shown",
      )
    }
  }

  for (const layer of shownLayers) {
    const target = layer.data.showWith
    if (target !== undefined && !isShown(target)) {
      error(
        layer.file,
        layers.has(target)
          ? `showWith: ${named(target)} isn't shown on the site`
          : `showWith: no layer named ${named(target)}`,
      )
    }
    const bbox = layer.data.bbox
    if (
      bbox &&
      (bbox[0] > BAY_AREA[2] ||
        bbox[2] < BAY_AREA[0] ||
        bbox[1] > BAY_AREA[3] ||
        bbox[3] < BAY_AREA[1])
    ) {
      warn(
        layer.file,
        'bbox is outside the San Francisco Bay Area; check its coordinates',
      )
    }
  }

  // Bodies are rendered up front so the files they refer to can be checked.
  const html = new Map<string, string>()
  for (const { file, body } of [
    ...shownLayers,
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
  for (const layer of shownLayers) {
    const { source } = layer.data
    if (source.type === 'style' && source.darkUrl && isAsset(source.darkUrl)) {
      checkAsset(layer.file, source.darkUrl, 'source.darkUrl')
    }
    if (!isAsset(source.url)) continue
    checkAsset(layer.file, source.url, 'source.url')
    if (source.type !== 'geojson') continue
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

  // Children are listed by year, then title.
  const byYearAndTitle = (a: string, b: string) => {
    const [first, second] = [a, b].map(
      (slug) => (layers.get(slug) ?? groups.get(slug))?.data,
    )
    return (
      (first?.year ?? 0) - (second?.year ?? 0) ||
      (first?.title ?? '').localeCompare(second?.title ?? '')
    )
  }

  // Asset paths get the site's base path, like /imaginedsf/assets/...
  const withBase = (url: string) =>
    isAsset(url) ? `${base}${url.slice(1)}` : url
  const rendered = (file: string) =>
    (html.get(file) ?? '').replaceAll('="/assets/', `="${base}assets/`)

  const content: Content = {
    layers: Object.fromEntries(
      shownLayers.map(({ slug, file, data }) => [
        slug,
        {
          ...withoutLists(data),
          source:
            data.source.type === 'style' && data.source.darkUrl
              ? {
                  ...data.source,
                  url: withBase(data.source.url),
                  darkUrl: withBase(data.source.darkUrl),
                }
              : { ...data.source, url: withBase(data.source.url) },
          slug,
          description: rendered(file),
          parent: listings.get(slug)?.parent,
          children: children.get(slug)?.toSorted(byYearAndTitle),
        },
      ]),
    ),
    groups: Object.fromEntries(
      shownGroups.map(({ slug, file, data }) => [
        slug,
        {
          ...withoutLists(data),
          slug,
          description: rendered(file),
          // Every group shown is listed in an era.
          parent: listings.get(slug)!.parent!,
          children: (children.get(slug) ?? []).toSorted(byYearAndTitle),
        },
      ]),
    ),
    eras: raw.eras
      .map(({ slug, file, data }) => ({
        ...withoutLists(data),
        slug,
        description: rendered(file),
        children: (children.get(slug) ?? []).toSorted(byYearAndTitle),
      }))
      .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title)),
    basemaps: site.data.basemaps,
    defaultBasemap: site.data.defaultBasemap,
    // In the order the site lists them. Every page exists by now.
    pages: Object.fromEntries(
      pageNames.map((name) => {
        const { file, data } = pages.get(name)!
        return [name, { ...data, body: rendered(file) }]
      }),
    ) as Record<PageName, Page>,
  }
  return { content, assets: [...usedAssets].sort(), errors, warnings }
}

// Content files list what's under them, which the site gets as children.
function withoutLists<T extends { layers?: unknown; groups?: unknown }>(
  data: T,
): Omit<T, 'layers' | 'groups'> {
  const copy = { ...data }
  delete copy.layers
  delete copy.groups
  return copy
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
