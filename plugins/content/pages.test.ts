import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sitePages, summarize } from './pages.ts'
import { pageNames } from './schema.ts'
import type { Content } from './types.ts'

const SITE = 'https://example.org/sf/'
const html = readFileSync(
  new URL('../../index.html', import.meta.url),
  'utf8',
).replaceAll('%SITE_URL%', SITE)

const source = { type: 'cog', url: 'https://example.org/map.tif' } as const
const content: Content = {
  layers: {
    plan: {
      slug: 'plan',
      title: 'Plan & Elevation',
      year: 1905,
      source,
      wordpressId: 569,
      description:
        '<p><img src="/sf/assets/images/plan.jpg" alt="The plan"></p>\n<p>A plan for &quot;the city&quot;.</p>',
    },
    photos: {
      slug: 'photos',
      title: 'Photos',
      source,
      parent: 'plan',
      description: '',
    },
  },
  groups: {
    surveys: {
      slug: 'surveys',
      title: 'Surveys',
      year: 1853,
      endYear: 1884,
      parent: 'era',
      children: ['plan'],
      description: '<p>Surveys of the coast.</p>',
    },
  },
  eras: [],
  basemaps: [],
  defaultBasemap: 'plan',
  pages: Object.fromEntries(
    pageNames.map((name) => [
      name,
      { title: `The ${name}`, body: `<p>About ${name}.</p>` },
    ]),
  ) as Content['pages'],
}

const files = sitePages(html, content, SITE)
const meta = (page: string, key: string) =>
  new RegExp(`(?:name|property)="${key}" content="([^"]*)"`).exec(page)?.[1]

describe('site pages', () => {
  it('are made for header pages, and layers and groups with descriptions', () => {
    expect(Object.keys(files).sort()).toEqual([
      'bibliography/index.html',
      'credits/index.html',
      'description/569/index.html',
      'feedback/index.html',
      'groups/surveys/index.html',
      'introduction/index.html',
      'layers/plan/index.html',
      'maps-and-plans/index.html',
      'robots.txt',
      'sitemap.xml',
    ])
  })

  it('have their own title, address and description', () => {
    const page = files['groups/surveys/index.html']
    expect(page).toContain('<title>Surveys – Imagined San Francisco</title>')
    expect(page).toContain(
      '<link rel="canonical" href="https://example.org/sf/groups/surveys/"',
    )
    expect(meta(page, 'og:url')).toBe('https://example.org/sf/groups/surveys/')
    expect(meta(page, 'og:title')).toBe('Surveys')
    expect(meta(page, 'og:type')).toBe('article')
    expect(meta(page, 'description')).toBe('Surveys of the coast.')
    expect(meta(page, 'og:description')).toBe('Surveys of the coast.')
    // Without an image of its own, it keeps the site's.
    expect(meta(page, 'og:image')).toBe('https://example.org/sf/og-image.jpg')
    expect(meta(page, 'og:image:width')).toBe('1200')
  })

  it('include their text', () => {
    expect(files['groups/surveys/index.html']).toContain(
      '<h1>Surveys <small>1853–1884</small></h1>\n<p>Surveys of the coast.</p>',
    )
    expect(files['credits/index.html']).toContain(
      '<h1>The credits</h1>\n<p>About credits.</p>',
    )
  })

  it('preview with the first image in the text', () => {
    const page = files['layers/plan/index.html']
    expect(page).toContain(
      '<title>Plan &amp; Elevation – Imagined San Francisco</title>',
    )
    expect(meta(page, 'description')).toBe('A plan for &quot;the city&quot;.')
    expect(meta(page, 'og:image')).toBe(
      'https://example.org/sf/assets/images/plan.jpg',
    )
    expect(meta(page, 'og:image:alt')).toBe('The plan')
    expect(meta(page, 'og:image:width')).toBeUndefined()
    expect(meta(page, 'og:image:height')).toBeUndefined()
  })

  it('answer the old site addresses', () => {
    expect(files['description/569/index.html']).toBe(
      files['layers/plan/index.html'],
    )
    expect(files['maps-and-plans/index.html']).toBe(html)
  })

  it('are listed in the sitemap', () => {
    expect(files['sitemap.xml']).toContain(
      '<url><loc>https://example.org/sf/</loc></url>',
    )
    expect(files['sitemap.xml']).toContain(
      '<url><loc>https://example.org/sf/layers/plan/</loc></url>',
    )
    expect(files['sitemap.xml'].match(/<url>/g)).toHaveLength(7)
    expect(files['robots.txt']).toContain(
      'Sitemap: https://example.org/sf/sitemap.xml',
    )
  })

  it('fail when index.html is missing a tag they change', () => {
    expect(() =>
      sitePages(html.replace(/<title>.*<\/title>/, ''), content, SITE),
    ).toThrow('index.html has no tag matching')
  })
})

describe('summaries', () => {
  it('use the first paragraph with text', () => {
    expect(
      summarize('<p><img src="x.jpg"></p><p>First <em>one</em>.</p><p>No.</p>'),
    ).toBe('First one.')
    expect(summarize('<h2>Only a heading</h2>')).toBeUndefined()
  })

  it('cut long text at a word', () => {
    const text = `<p>${'word '.repeat(50)}</p>`
    const summary = summarize(text)!
    expect(summary.length).toBeLessThanOrEqual(160)
    expect(summary).toMatch(/ word…$/)
  })

  it('decode entities', () => {
    expect(
      summarize('<p>Fish &amp; chips &#8212; &#x2018;yes&#x2019;</p>'),
    ).toBe('Fish & chips — ‘yes’')
  })
})
