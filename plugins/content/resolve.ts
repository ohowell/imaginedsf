import type { ContentIssue, RawContent } from './load.ts'
import { renderMarkdown } from './markdown.ts'
import { pageNames, type PageName } from './schema.ts'
import type { Content, Page } from './types.ts'

// Rough extent of the San Francisco Bay Area, for catching bad coordinates.
const BAY_AREA = [-123.2, 37.1, -121.5, 38.5]

interface Listing {
  file: string
  /** Slug of the era, group or layer it's listed under, if any. */
  parent?: string
}

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

  // Parents are named by slug, so layers, groups and eras can't share one.
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

  // Each layer or group is listed in one place: the basemaps, or under the
  // parent it names.
  const listings = new Map<string, Listing>()
  function list(slug: string, listing: Listing, allowGroups: boolean) {
    if (!layers.has(slug) && !(allowGroups && groups.has(slug))) {
      error(
        listing.file,
        groups.has(slug)
          ? `"${slug}" is a group, but only layers can be listed here`
          : `no ${allowGroups ? 'layer or group' : 'layer'} named "${slug}"`,
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
  // Groups are listed under an era. Layers are listed under an era, a group,
  // or a layer, like a plan's details and photos. Layers under layers nest
  // one level, and not under basemaps.
  const children = new Map<string, string[]>()
  const addChild = (parent: string, slug: string) =>
    children.set(parent, [...(children.get(parent) ?? []), slug])
  for (const group of raw.groups) {
    const { parent } = group.data
    if (parent === undefined) continue
    if (eras.has(parent)) {
      list(group.slug, { file: group.file, parent }, true)
      addChild(parent, group.slug)
    } else {
      error(group.file, `parent: no era named "${parent}"`)
    }
  }
  for (const layer of raw.layers) {
    const { parent } = layer.data
    if (parent === undefined) continue
    const target = layers.get(parent)
    if (!target && !groups.has(parent) && !eras.has(parent)) {
      error(layer.file, `parent: no era, group or layer named "${parent}"`)
    } else if (target?.data.parent && layers.has(target.data.parent)) {
      error(
        layer.file,
        `parent: "${parent}" is under another layer, so it can't be a parent`,
      )
    } else if (site?.data.basemaps.includes(parent)) {
      error(layer.file, `parent: "${parent}" is a basemap, so it can't be one`)
    } else {
      list(layer.slug, { file: layer.file, parent }, false)
      addChild(parent, layer.slug)
    }
  }
  for (const group of raw.groups) {
    if (!children.has(group.slug)) {
      error(group.file, 'no layers name this group as their parent')
    }
  }
  for (const era of raw.eras) {
    if (!children.has(era.slug)) {
      error(era.file, 'no layers or groups name this era as their parent')
    }
  }

  // Eras are always shown, and the rest when listed under something shown.
  const isShown = (slug: string): boolean => {
    if (eras.has(slug)) return true
    const listing = listings.get(slug)
    return listing !== undefined && (!listing.parent || isShown(listing.parent))
  }
  const shownLayers = raw.layers.filter((layer) => isShown(layer.slug))
  const shownGroups = raw.groups.filter((group) => isShown(group.slug))

  for (const group of raw.groups) {
    if (!listings.has(group.slug)) {
      warn(group.file, "has no parent, so it and its layers aren't shown")
    }
  }
  for (const layer of raw.layers) {
    if (!listings.has(layer.slug)) {
      warn(layer.file, "has no parent and isn't a basemap, so it isn't shown")
    }
  }

  for (const layer of shownLayers) {
    const target = layer.data.showWith
    if (target !== undefined && !isShown(target)) {
      error(
        layer.file,
        layers.has(target)
          ? `showWith "${target}" isn't shown on the site`
          : `showWith: no layer named "${target}"`,
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
    if (source.type !== 'geojson' || !isAsset(source.url)) continue
    checkAsset(layer.file, source.url, 'source.url')
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
          ...data,
          source: { ...data.source, url: withBase(data.source.url) },
          slug,
          description: rendered(file),
          children: children.get(slug)?.toSorted(byYearAndTitle),
        },
      ]),
    ),
    groups: Object.fromEntries(
      shownGroups.map(({ slug, file, data }) => [
        slug,
        {
          ...data,
          slug,
          description: rendered(file),
          children: (children.get(slug) ?? []).toSorted(byYearAndTitle),
        },
      ]),
    ),
    eras: raw.eras
      .map(({ slug, file, data }) => ({
        ...data,
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
