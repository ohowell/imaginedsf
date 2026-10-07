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
const group = (slug: string, parent?: string) =>
  entry<GroupData>('groups', slug, { title: slug, parent })
const era = (slug: string, start: number) =>
  entry<EraData>('eras', slug, { title: slug, start, end: start + 10 })

function fixture(overrides: Partial<RawContent> = {}): RawContent {
  return {
    dir: 'content',
    site: {
      file: 'content/site.yml',
      data: { basemaps: ['base'], defaultBasemap: 'base' },
    },
    maps: [
      map('base'),
      map('plan', { parent: 'later' }),
      map('grouped', { parent: 'proposals' }),
    ],
    groups: [group('proposals', 'earlier')],
    eras: [era('later', 1950), era('earlier', 1900)],
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
    expect(content?.eras.map((era) => era.children)).toEqual([
      ['proposals'],
      ['plan'],
    ])
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
      "content/maps/draft.md: has no parent and isn't a basemap, so it isn't shown",
    ])
  })

  it('rejects a map listed in two places', () => {
    const raw = fixture()
    raw.site!.data.basemaps.push('plan')
    expect(messages(resolveContent(raw).errors)).toEqual([
      'content/maps/plan.md: "plan" is also listed in content/site.yml',
    ])
  })

  it('rejects references to missing maps', () => {
    const raw = fixture()
    raw.site!.data.basemaps.push('missing')
    raw.maps.push(map('stray', { parent: 'missing' }))
    raw.groups.push(group('lost', 'plan'))
    expect(messages(resolveContent(raw).errors)).toEqual([
      'content/site.yml: no map named "missing"',
      'content/groups/lost.md: parent: no era named "plan"',
      'content/maps/stray.md: parent: no era, group or map named "missing"',
      'content/groups/lost.md: no maps name this group as their parent',
    ])
  })

  it('rejects groups where only maps are allowed', () => {
    const raw = fixture()
    raw.site!.data.basemaps.push('proposals')
    expect(messages(resolveContent(raw).errors)).toContain(
      'content/site.yml: "proposals" is a group, but only maps can be listed here',
    )
  })

  it('lists maps under their group, and rejects empty groups', () => {
    const raw = fixture()
    raw.maps.push(map('also-grouped', { parent: 'proposals' }))
    raw.groups.push(group('empty', 'earlier'))
    const { content, errors } = resolveContent(raw)
    expect(messages(errors)).toEqual([
      'content/groups/empty.md: no maps name this group as their parent',
    ])
    raw.groups.pop()
    expect(resolveContent(raw).content?.groups.proposals.children).toEqual([
      'also-grouped',
      'grouped',
    ])
    expect(content).toBeUndefined()
  })

  it('lists maps and groups in eras by year, and rejects empty eras', () => {
    const raw = fixture()
    raw.maps.push(map('survey', { parent: 'earlier', year: 1901 }))
    raw.groups[0].data.year = 1905
    raw.eras.push(era('empty', 2000))
    expect(messages(resolveContent(raw).errors)).toEqual([
      'content/eras/empty.md: no maps or groups name this era as their parent',
    ])
    raw.eras.pop()
    expect(resolveContent(raw).content?.eras[0].children).toEqual([
      'survey',
      'proposals',
    ])
  })

  it('rejects an era sharing a slug with a map', () => {
    const raw = fixture()
    raw.eras.push(era('plan', 2000))
    expect(messages(resolveContent(raw).errors)).toContain(
      'content/eras/plan.md: slug is also used by content/maps/plan.md',
    )
  })

  it('rejects a map and group with the same slug', () => {
    const raw = fixture()
    raw.maps.push(map('proposals'))
    expect(messages(resolveContent(raw).errors)).toContain(
      'content/groups/proposals.md: slug is also used by content/maps/proposals.md',
    )
  })

  it('lists maps under their parent, by year and then title', () => {
    const raw = fixture()
    raw.maps.push(
      map('photos', { parent: 'plan', year: 1960 }),
      map('detail', { parent: 'plan', year: 1950 }),
      map('draft'),
      map('draft-detail', { parent: 'draft' }),
    )
    const { content, warnings } = resolveContent(raw)
    expect(messages(warnings)).toEqual([
      "content/maps/draft.md: has no parent and isn't a basemap, so it isn't shown",
    ])
    expect(content?.maps.plan.children).toEqual(['detail', 'photos'])
    expect(content?.maps['draft-detail']).toBeUndefined()
  })

  it('keeps maps under maps one level deep, and off basemaps', () => {
    const raw = fixture()
    raw.maps.push(
      map('detail', { parent: 'plan' }),
      map('photos', { parent: 'detail' }),
      map('entry-photos', { parent: 'grouped' }),
      map('legend', { parent: 'base' }),
      map('loop', { parent: 'loop' }),
      map('stray', { parent: 'missing' }),
    )
    expect(messages(resolveContent(raw).errors)).toEqual([
      'content/maps/photos.md: parent: "detail" is under another map, so it can\'t be a parent',
      'content/maps/legend.md: parent: "base" is a basemap, so it can\'t be one',
      'content/maps/loop.md: parent: "loop" is under another map, so it can\'t be a parent',
      'content/maps/stray.md: parent: no era, group or map named "missing"',
    ])
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
        .safeParse({ title: 'Surveys', ...data })
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
