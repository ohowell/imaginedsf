import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadContent, type ContentIssue, type Entry, type RawContent } from './load.ts'
import { headingProblems, renderMarkdown } from './markdown.ts'
import { resolveContent } from './resolve.ts'
import { mapSchema, pageNames, type EraData, type GroupData, type MapData } from './schema.ts'

const entry = <T>(collection: string, slug: string, data: T): Entry<T> => ({
  slug,
  file: `content/${collection}/${slug}.md`,
  data,
  body: '',
})
const map = (slug: string, data: Partial<MapData> = {}) =>
  entry<MapData>('maps', slug, {
    title: slug,
    source: { type: 'tile', url: 'https://tiles.example/{z}/{x}/{y}.png' },
    ...data,
  })
const group = (slug: string, maps: string[]) =>
  entry<GroupData>('groups', slug, { title: slug, maps })
const era = (slug: string, start: number, items: string[]) =>
  entry<EraData>('eras', slug, { title: slug, start, end: start + 10, items })

function fixture(overrides: Partial<RawContent> = {}): RawContent {
  return {
    dir: 'content',
    site: {
      file: 'content/site.yml',
      data: { basemaps: ['base'], defaultBasemap: 'base', narratives: [] },
    },
    maps: [map('base'), map('plan'), map('grouped')],
    groups: [group('proposals', ['grouped'])],
    eras: [era('later', 1950, ['plan']), era('earlier', 1900, ['proposals'])],
    narratives: [],
    pages: pageNames.map((name) => entry('pages', name, { title: name })),
    ...overrides,
  }
}

const messages = (issues: ContentIssue[]) =>
  issues.map(({ file, message }) => `${file}: ${message}`)

describe('resolveContent', () => {
  it('assembles valid content', () => {
    const { content, errors, warnings } = resolveContent(fixture())
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(content?.eras.map((era) => era.slug)).toEqual(['earlier', 'later'])
    expect(Object.keys(content?.maps ?? {}).sort()).toEqual(['base', 'grouped', 'plan'])
  })

  it('leaves out maps that are not listed', () => {
    const raw = fixture()
    raw.maps.push(map('draft'))
    const { content, warnings } = resolveContent(raw)
    expect(content?.maps.draft).toBeUndefined()
    expect(messages(warnings)).toEqual([
      "content/maps/draft.md: isn't listed in any era, group or basemap list, so it isn't shown",
    ])
  })

  it('rejects a map listed in two places', () => {
    const raw = fixture()
    raw.eras[0].data.items.push('grouped')
    expect(messages(resolveContent(raw).errors)).toEqual([
      'content/groups/proposals.md: "grouped" is also listed in content/eras/later.md',
    ])
  })

  it('rejects references to missing maps', () => {
    const raw = fixture()
    raw.eras[0].data.items.push('missing')
    expect(messages(resolveContent(raw).errors)).toEqual([
      'content/eras/later.md: no map or group named "missing"',
    ])
  })

  it('rejects groups where only maps are allowed', () => {
    const raw = fixture()
    raw.groups.push(group('nested', ['proposals']))
    expect(messages(resolveContent(raw).errors)).toContain(
      'content/groups/nested.md: "proposals" is a group, but only maps can be listed here',
    )
  })

  it('rejects a map and group with the same slug', () => {
    const raw = fixture()
    raw.maps.push(map('proposals'))
    expect(messages(resolveContent(raw).errors)).toContain(
      'content/groups/proposals.md: slug is also used by content/maps/proposals.md',
    )
  })

  it('rejects a recommended basemap that is not shown', () => {
    const raw = fixture()
    raw.maps.push(map('draft'))
    raw.maps[1].data.recommendedBasemap = 'draft'
    expect(messages(resolveContent(raw).errors)).toEqual([
      'content/maps/plan.md: recommendedBasemap "draft" isn\'t shown on the site',
    ])
  })

  it('requires every page', () => {
    const raw = fixture()
    raw.pages = raw.pages.filter((page) => page.slug !== 'credits')
    expect(messages(resolveContent(raw).errors)).toEqual([
      'content/pages/credits.md: missing; the site uses this page',
    ])
  })

  it('warns about bounding boxes outside the Bay Area', () => {
    const raw = fixture()
    raw.maps[1].data.bbox = [0, 0, 18, 25]
    expect(messages(resolveContent(raw).warnings)).toEqual([
      'content/maps/plan.md: bbox is outside the San Francisco Bay Area; check its coordinates',
    ])
  })
})

describe('mapSchema', () => {
  it('rejects unknown keys and inverted bounding boxes', () => {
    const result = mapSchema.safeParse({
      title: 'Plan',
      tittle: 'Plan',
      source: { type: 'tile', url: 'https://tiles.example/{z}/{x}/{y}.png' },
      bbox: [-122.3, 37.8, -122.5, 37.7],
    })
    expect(result.error?.issues.map((issue) => issue.path.join('.')).sort()).toEqual([
      '',
      'bbox',
    ])
  })
})

describe('renderMarkdown', () => {
  it('opens external links in a new tab', () => {
    expect(renderMarkdown('[source](https://example.com) [view](#state)')).toBe(
      '<p><a target="_blank" rel="noopener" href="https://example.com">source</a> <a href="#state">view</a></p>\n',
    )
  })
})

describe('headingProblems', () => {
  it('accepts headings that start at level 2 without skipping', () => {
    expect(headingProblems('## Sources\n\n### Books\n\n## Further Reading')).toEqual([])
  })

  it('rejects level 1 headings and skipped levels', () => {
    expect(headingProblems('# Title\n\n## Sources\n\n#### Books')).toEqual([
      'heading "Title" is level 1, which is for the title; use ## instead',
      'heading "Books" skips from level 2 to level 4',
    ])
  })
})

describe('loadContent', () => {
  let dir = ''
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('reports malformed files', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'content-'))
    await mkdir(path.join(dir, 'maps'))
    await writeFile(path.join(dir, 'site.yml'), 'basemaps: [base]\ndefaultBasemap: base\nnarratives: []\n')
    await writeFile(path.join(dir, 'maps', 'no-front-matter.md'), 'Just text')
    await writeFile(path.join(dir, 'maps', 'Bad Name.md'), '---\ntitle: x\n---\n')
    await writeFile(path.join(dir, 'maps', 'bad-yaml.md'), '---\ntitle: [unclosed\n---\n')
    const name = path.basename(dir)
    const { errors } = await loadContent(dir)
    expect(messages(errors).map((message) => message.split('\n')[0])).toEqual([
      `${name}/maps/Bad Name.md: file name must be a lowercase slug such as "fulton-circle.md"`,
      expect.stringMatching(new RegExp(`^${name}/maps/bad-yaml.md: YAMLParseError`)),
      `${name}/maps/no-front-matter.md: must start with YAML front matter between --- lines`,
    ])
  })
})
