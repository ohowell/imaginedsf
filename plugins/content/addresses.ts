import { pageNames, type PageName } from './schema.ts'
import type { Content } from './types.ts'

// Each page the header opens, and each layer or group with a description, has
// an address of its own, like layers/burnham-plan/, relative to the site's
// base. The build makes a page there for search engines and link previews,
// and the site opens the matching dialog.

/** Pages the header opens. Maps and plans is the sidebar itself. */
export type HeaderPage = Exclude<PageName, 'maps-and-plans'>
export const headerPages = pageNames.filter(
  (name): name is HeaderPage => name !== 'maps-and-plans',
)

export const pagePath = (name: HeaderPage) => `${name}/`

/** The address of a layer or group, if it has a description to show there. */
export function itemPath(content: Content, slug: string): string | undefined {
  if (Object.hasOwn(content.layers, slug) && content.layers[slug].description)
    return `layers/${slug}/`
  if (Object.hasOwn(content.groups, slug) && content.groups[slug].description)
    return `groups/${slug}/`
  return undefined
}

export const SITE_NAME = 'Imagined San Francisco'

/** The window title for a page or item, or for the site itself. */
export const windowTitle = (title?: string) =>
  title ? `${title} – ${SITE_NAME}` : SITE_NAME
