import type {
  EraData,
  GroupData,
  LayerData,
  PageData,
  PageName,
} from './schema.ts'

// The shape of `virtual:content`. Descriptions and bodies are rendered HTML,
// and items refer to each other by slug.

export type LayerSource = LayerData['source']
/** Anything with data to draw on the map, like a scanned map or photo pins. */
export type Layer = LayerData & {
  slug: string
  description: string
  /** Slugs of the layers whose parent this is. */
  children?: string[]
}
/** A titled, described set of layers, with no data of its own. */
export type Group = GroupData & {
  slug: string
  description: string
  /** Slugs of the layers whose parent this is. */
  children: string[]
}
export type Era = EraData & {
  slug: string
  description: string
  /** Slugs of the layers and groups whose parent this is. */
  children: string[]
}
export type Page = PageData & { body: string }

export interface Content {
  /** Layers shown on the site, keyed by slug. */
  layers: Record<string, Layer>
  /** Groups shown on the site, keyed by slug. */
  groups: Record<string, Group>
  /** Proposal eras in chronological order. */
  eras: Era[]
  /** Slugs of the layers offered as basemaps. */
  basemaps: string[]
  defaultBasemap: string
  /** Static pages, in the order the site lists them. */
  pages: Record<PageName, Page>
}
