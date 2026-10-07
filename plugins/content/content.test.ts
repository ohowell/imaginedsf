import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadContent,
  type ContentIssue,
  type Entry,
  type RawContent,
} from './load.ts'
import { headingProblems, renderMarkdown } from './markdown.ts'
import { resolveContent } from './resolve.ts'
import {
  groupSchema,
  mapSchema,
  pageNames,
  type EraData,
  type GroupData,
  type MapData,
} from './schema.ts'

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
      data: { basemaps: ['base'], defaultBasemap: 'base' },
    },
    maps: [map('base'), map('plan'), map('grouped')],
    groups: [group('proposals', ['grouped'])],
    eras: [era('later', 1950, ['plan']), era('earlier', 1900, ['proposals'])],
    pages: pageNames.map((name) => entry('pages', name, { title: name })),
    assets: [],
    geojson: new Map(),
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
    expect(Object.keys(content?.maps ?? {}).sort()).toEqual([
      'base',
      'grouped',
      'plan',
    ])
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

  it('rejects a showWith map that is not shown', () => {
    const raw = fixture()
    raw.maps.push(map('draft'))
    raw.maps[1].data.showWith = 'draft'
    expect(messages(resolveContent(raw).errors)).toEqual([
      'content/maps/plan.md: showWith "draft" isn\'t shown on the site',
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

  it('adds the base path to files in assets/', () => {
    const raw = fixture({
      assets: ['assets/geojson/plan.geojson', 'assets/images/plan.jpg'],
    })
    raw.maps[1].data.source = {
      type: 'geojson',
      url: '/assets/geojson/plan.geojson',
    }
    raw.maps[1].body = '![](/assets/images/plan.jpg)'
    const { content, assets, errors, warnings } = resolveContent(raw, {
      base: '/imaginedsf/',
    })
    expect([...errors, ...warnings]).toEqual([])
    expect(assets).toEqual([
      'assets/geojson/plan.geojson',
      'assets/images/plan.jpg',
    ])
    expect(content?.maps.plan.source.url).toBe(
      '/imaginedsf/assets/geojson/plan.geojson',
    )
    expect(content?.maps.plan.description).toContain(
      'src="/imaginedsf/assets/images/plan.jpg"',
    )
  })

  it('checks files that bodies and GeoJSON popups refer to', () => {
    const photos = '/assets/images/plan.jpg, /assets/images/missing.jpg'
    const raw = fixture({
      assets: [
        'assets/geojson/plan.geojson',
        'assets/images/plan.jpg',
        'assets/images/old.jpg',
      ],
      geojson: new Map([
        [
          'assets/geojson/plan.geojson',
          { features: [{ properties: { photos } }] },
        ],
      ]),
    })
    raw.maps[1].data.source = {
      type: 'geojson',
      url: '/assets/geojson/plan.geojson',
      properties: { images: 'photos' },
    }
    raw.maps[0].body = '![](/assets/images/gone.jpg)'
    const { errors, warnings } = resolveContent(raw)
    expect(messages(errors)).toEqual([
      'content/maps/base.md: body: no file at "/assets/images/gone.jpg"',
      'assets/geojson/plan.geojson: photos: no file at "/assets/images/missing.jpg"',
    ])
    expect(messages(warnings)).toEqual([
      "assets/images/old.jpg: isn't used by any content",
    ])
  })

  it('keeps styles to basemaps, and GeoJSON out of basemaps', () => {
    const raw = fixture({ assets: ['assets/geojson/base.geojson'] })
    raw.maps[0].data.source = {
      type: 'geojson',
      url: '/assets/geojson/base.geojson',
    }
    raw.maps[1].data.source = {
      type: 'style',
      url: 'https://tiles.example/styles/light',
    }
    expect(messages(resolveContent(raw).errors)).toEqual([
      'content/maps/base.md: source: basemaps must be styles or raster maps (cog, wms or tile)',
      'content/maps/plan.md: source: styles draw a whole map, so only basemaps can use them',
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
    expect(
      result.error?.issues.map((issue) => issue.path.join('.')).sort(),
    ).toEqual(['', 'bbox'])
  })

  it('accepts COG sources that point at a GeoTIFF file', () => {
    const cog = (url: string) =>
      mapSchema.safeParse({ title: 'Plan', source: { type: 'cog', url } })
    expect(
      cog('https://stacks.stanford.edu/file/druid:kq996gp6880/SF1938_cog.tif')
        .success,
    ).toBe(true)
    expect(
      cog(
        'https://earthworks.stanford.edu/catalog/stanford-kq996gp6880',
      ).error?.issues.map((issue) => issue.message),
    ).toEqual(['must be a .tif or .tiff file'])
  })

  it('accepts GeoJSON files in assets/, but not paths elsewhere', () => {
    const geojson = (url: string) =>
      mapSchema.safeParse({ title: 'Plan', source: { type: 'geojson', url } })
        .success
    expect(geojson('/assets/geojson/plan.geojson')).toBe(true)
    expect(geojson('https://data.example/plan.geojson')).toBe(true)
    expect(geojson('plan.geojson')).toBe(false)
    expect(geojson('/assets/../content/plan.geojson')).toBe(false)
    expect(geojson('/assets/geojson/plan.txt')).toBe(false)
  })
})

describe('groupSchema', () => {
  it('accepts an end year only after a start year', () => {
    const errors = (data: object) =>
      groupSchema
        .safeParse({ title: 'Surveys', maps: ['survey'], ...data })
        .error?.issues.map((issue) => issue.message)
    expect(errors({ year: 1853, endYear: 1884 })).toBeUndefined()
    expect(errors({ endYear: 1884 })).toEqual([
      'endYear needs a year to start from',
    ])
    expect(errors({ year: 1884, endYear: 1853 })).toEqual([
      'endYear must be after year',
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
    expect(
      headingProblems('## Sources\n\n### Books\n\n## Further Reading'),
    ).toEqual([])
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
    dir = await mkdtemp(path.join(tmpdir(), 'site-'))
    const write = async (file: string, text: string) => {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true })
      await writeFile(path.join(dir, file), text)
    }
    await write('content/site.yml', 'basemaps: [base]\ndefaultBasemap: base\n')
    await write('content/maps/no-front-matter.md', 'Just text')
    await write('content/maps/Bad Name.md', '---\ntitle: x\n---\n')
    await write('content/maps/bad-yaml.md', '---\ntitle: [unclosed\n---\n')
    await write('content/maps/plan.geojson', '{}')
    await write('assets/geojson/broken.geojson', '{"type":')
    await write('assets/images/plan.jpg', '')
    const { raw, errors } = await loadContent(
      path.join(dir, 'content'),
      path.join(dir, 'assets'),
    )
    expect(messages(errors).map((message) => message.split('\n')[0])).toEqual([
      'content/maps/Bad Name.md: file name must be a lowercase slug such as "fulton-circle.md"',
      expect.stringMatching(/^content\/maps\/bad-yaml.md: YAMLParseError/),
      'content/maps/no-front-matter.md: must start with YAML front matter between --- lines',
      'content/maps/plan.geojson: content folders only hold Markdown; put other files in assets/',
      expect.stringMatching(/^assets\/geojson\/broken.geojson: SyntaxError/),
    ])
    expect(raw.assets).toEqual([
      'assets/geojson/broken.geojson',
      'assets/images/plan.jpg',
    ])
  })
})
