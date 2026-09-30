import type {
  EraData,
  GroupData,
  MapData,
  NarrativeData,
  PageData,
  PageName,
} from './schema.ts'

// The shape of `virtual:content`. Descriptions and bodies are rendered HTML,
// and items refer to each other by slug.

export type MapSource = MapData['source']
export type MapLayer = MapData & { slug: string; description: string }
export type MapGroup = GroupData & { slug: string; description: string }
export type Era = EraData & { slug: string; description: string }
export type Narrative = NarrativeData & { slug: string; body: string }
export type Page = PageData & { body: string }

export interface Content {
  /** Maps shown on the site, keyed by slug. */
  maps: Record<string, MapLayer>
  /** Map groups shown on the site, keyed by slug. */
  groups: Record<string, MapGroup>
  /** Proposal eras in chronological order. */
  eras: Era[]
  /** Slugs of the maps offered as basemaps. */
  basemaps: string[]
  defaultBasemap: string
  /** Narratives in table-of-contents order. */
  narratives: Narrative[]
  pages: Record<PageName, Page>
}
