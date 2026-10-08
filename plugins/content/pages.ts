import {
  headerPages,
  itemPath,
  pagePath,
  SITE_NAME,
  windowTitle,
} from './addresses.ts'
import type { Content } from './types.ts'

interface Page {
  /** Relative to the site's base, like layers/burnham-plan/. */
  path: string
  title: string
  /** The page's heading, as HTML. */
  heading: string
  /** Rendered HTML. */
  body: string
}

/**
 * Files for the site's own addresses, keyed by file name: a copy of the built
 * index.html for each page and item, with its own title, description and
 * preview image, and its text for whatever reads the page without running the
 * site's code. The site replaces the text with the map and opens the dialog.
 * Old site addresses get the same pages, along with a sitemap and robots.txt.
 */
export function sitePages(
  html: string,
  content: Content,
  siteUrl: string,
): Record<string, string> {
  const pages: Page[] = headerPages.map((name) => ({
    path: pagePath(name),
    title: content.pages[name].title,
    heading: escape(content.pages[name].title),
    body: content.pages[name].body,
  }))
  // The old site's addresses for descriptions, like /description/569.
  const oldPaths = new Map<string, string>()
  for (const item of [
    ...Object.values(content.layers),
    ...Object.values(content.groups),
  ]) {
    const path = itemPath(content, item.slug)
    if (!path) continue
    const years =
      'endYear' in item && item.endYear
        ? `${item.year}–${item.endYear}`
        : item.year
    pages.push({
      path,
      title: item.title,
      heading: `${escape(item.title)}${years ? ` <small>${years}</small>` : ''}`,
      body: item.description,
    })
    if (item.wordpressId) oldPaths.set(path, `description/${item.wordpressId}/`)
  }

  const files: Record<string, string> = {}
  for (const page of pages) {
    const source = pageHtml(html, page, siteUrl)
    files[`${page.path}index.html`] = source
    const oldPath = oldPaths.get(page.path)
    if (oldPath) files[`${oldPath}index.html`] = source
  }
  // The old site's page for the sidebar, which is the site itself now.
  files['maps-and-plans/index.html'] = html

  const urls = ['', ...pages.map((page) => page.path)].map(
    (path) => `  <url><loc>${escape(siteUrl + path)}</loc></url>`,
  )
  files['sitemap.xml'] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
  files['robots.txt'] =
    `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`
  return files
}

/** index.html, made over for one page. */
function pageHtml(html: string, page: Page, siteUrl: string): string {
  const url = siteUrl + page.path
  const summary = summarize(page.body)
  const image = firstImage(page.body, siteUrl)

  html = replace(html, /<title>[^<]*<\/title>/, () => {
    return `<title>${escape(windowTitle(page.title))}</title>`
  })
  html = replace(html, /<link\s+rel="canonical"\s+href="[^"]*"/, () => {
    return `<link rel="canonical" href="${escape(url)}"`
  })
  html = setMeta(html, 'property', 'og:url', url)
  html = setMeta(html, 'property', 'og:type', 'article')
  html = setMeta(html, 'property', 'og:title', page.title)
  if (summary) {
    html = setMeta(html, 'name', 'description', summary)
    html = setMeta(html, 'property', 'og:description', summary)
  }
  // Images in the text aren't measured, so they go without a size.
  if (image) {
    html = setMeta(html, 'property', 'og:image', image.url)
    html = removeMeta(html, 'property', 'og:image:width')
    html = removeMeta(html, 'property', 'og:image:height')
    html = image.alt
      ? setMeta(html, 'property', 'og:image:alt', image.alt)
      : removeMeta(html, 'property', 'og:image:alt')
  }
  const base = new URL(siteUrl).pathname
  return replace(html, /<div id="root"><\/div>/, () =>
    [
      '<div id="root">',
      '<main class="static-page">',
      `<p><a href="${escape(base)}">${SITE_NAME}</a></p>`,
      `<h1>${page.heading}</h1>`,
      page.body,
      '</main>',
      '</div>',
    ].join('\n'),
  )
}

// index.html changes by hand, so a tag that's gone missing fails the build
// rather than leaving every page with the site's own.
function replace(html: string, tag: RegExp, replacement: () => string) {
  if (!tag.test(html)) {
    throw new Error(`index.html has no tag matching ${tag}`)
  }
  return html.replace(tag, replacement)
}

const metaTag = (attribute: string, key: string) =>
  new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="[^"]*"\\s*/?>`)

const setMeta = (html: string, attribute: string, key: string, value: string) =>
  replace(
    html,
    metaTag(attribute, key),
    () => `<meta ${attribute}="${key}" content="${escape(value)}" />`,
  )

const removeMeta = (html: string, attribute: string, key: string) =>
  replace(
    html,
    new RegExp(`\\n\\s*${metaTag(attribute, key).source}`),
    () => '',
  )

/** The text of the first paragraph with any, cut to about a sentence or two. */
export function summarize(html: string, length = 160): string | undefined {
  for (const [, inner] of html.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
    const text = decode(inner.replace(/<[^>]*>/g, ''))
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) continue
    if (text.length <= length) return text
    const cut = text.slice(0, length - 1)
    return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:.–—-]+$/, '')}…`
  }
  return undefined
}

/** The full URL and alt text of the first image in some HTML, if any. */
function firstImage(html: string, siteUrl: string) {
  const tag = /<img\s[^>]*>/.exec(html)?.[0]
  const src = tag && /\ssrc="([^"]*)"/.exec(tag)?.[1]
  if (!src) return undefined
  return {
    url: new URL(decode(src), siteUrl).href,
    alt: decode(/\salt="([^"]*)"/.exec(tag)?.[1] ?? ''),
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
}

// Rendered Markdown escapes only a few characters, and numbers any others.
function decode(html: string) {
  return html.replace(
    /&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi,
    (entity, dec, hex, name) => {
      if (dec) return String.fromCodePoint(Number(dec))
      if (hex) return String.fromCodePoint(parseInt(hex, 16))
      return ENTITIES[name] ?? entity
    },
  )
}

function escape(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
