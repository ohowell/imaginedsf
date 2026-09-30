import type { ContentIssue, RawContent } from './load.ts'
import { renderMarkdown } from './markdown.ts'
import { pageNames, type PageName } from './schema.ts'
import type { Content, Page } from './types.ts'

// Rough extent of the San Francisco Bay Area, for catching bad coordinates.
const BAY_AREA = [-123.2, 37.1, -121.5, 38.5]

interface Listing {
  file: string
  group?: string
}

/**
 * Checks references between content files and assembles the content the
 * site uses. Maps and groups that aren't listed anywhere are left out.
 */
export function resolveContent(raw: RawContent): {
  content: Content | undefined
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

  // Each map or group is listed in one place: the basemaps, an era, or a group.
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
  }
  for (const era of raw.eras) {
    for (const slug of era.data.items) {
      list(slug, { file: era.file }, true)
    }
  }
  for (const group of raw.groups) {
    for (const slug of group.data.maps) {
      list(slug, { file: group.file, group: group.slug }, false)
    }
  }

  // Groups are shown when listed in an era; maps when listed anywhere shown.
  const isShown = (slug: string): boolean => {
    const listing = listings.get(slug)
    return listing !== undefined && (!listing.group || isShown(listing.group))
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
        "isn't listed in any era, group or basemap list, so it isn't shown",
      )
    }
  }

  for (const map of shownMaps) {
    const target = map.data.recommendedBasemap
    if (target !== undefined && !isShown(target)) {
      error(
        map.file,
        maps.has(target)
          ? `recommendedBasemap "${target}" isn't shown on the site`
          : `recommendedBasemap: no map named "${target}"`,
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
    return { content: undefined, errors, warnings }
  }

  const content: Content = {
    maps: Object.fromEntries(
      shownMaps.map(({ slug, data, body }) => [
        slug,
        { ...data, slug, description: renderMarkdown(body) },
      ]),
    ),
    groups: Object.fromEntries(
      shownGroups.map(({ slug, data, body }) => [
        slug,
        { ...data, slug, description: renderMarkdown(body) },
      ]),
    ),
    eras: raw.eras
      .map(({ slug, data, body }) => ({
        ...data,
        slug,
        description: renderMarkdown(body),
      }))
      .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title)),
    basemaps: site.data.basemaps,
    defaultBasemap: site.data.defaultBasemap,
    pages: Object.fromEntries(
      raw.pages.map(({ slug, data, body }) => [
        slug,
        { ...data, body: renderMarkdown(body) },
      ]),
    ) as Record<PageName, Page>,
  }
  return { content, errors, warnings }
}
