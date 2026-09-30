// Imports the WordPress site's content into content/, replacing what's there.
// Only content the live site shows is imported. Before writing, it checks that
// converting each description to Markdown kept all of its text, links and
// images.
//
//   node scripts/import-wordpress.ts [--source <url or file>]

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import TurndownService from 'turndown'
import { Document, isSeq } from 'yaml'
import { buildContent, formatIssue } from '../plugins/content/index.ts'
import { renderMarkdown } from '../plugins/content/markdown.ts'

const WORDPRESS = 'https://www.imaginedsanfrancisco.org'
const CONTENT_DIR = path.resolve(import.meta.dirname, '../content')

interface WpPost {
  ID: number
  post_name: string
  post_title: string
}

interface WpMetadata {
  description: string
  year: string
  enabled_by_default: boolean
  indented: boolean
  recommended_basemap: number | false
}

interface WpMap extends WpPost {
  source_type: 'wms' | 'tile' | 'geojson' | 'wfs'
  metadata: WpMetadata
  wms: { url: string; layers: string } | null
  tile: { url: string } | null
  geojson: { file: string | null } | null
  tile_zoom: { min_tile_zoom: string; max_tile_zoom: string } | null
  points: {
    directional_pins: boolean
    pin_direction_property_key: string
    popup_images_property_key: string
    popup_text_property_key: string
  } | null
  bounds: { validated_coordinates: { lng: number; lat: number }[] } | false
}

interface WpGroup extends WpPost {
  metadata: WpMetadata
  children: number[]
}

interface WpEra extends WpPost {
  start: string
  end: string
  description: string
  children: number[]
}

interface WpContent {
  contentAreaContent: Record<string, string>
  maps: WpMap[]
  mapGroups: WpGroup[]
  proposalEras: WpEra[]
  basemaps: number[]
}

// WordPress content area key → page file name and title.
const PAGES: Record<string, [string, string]> = {
  introduction: ['introduction', 'Introduction'],
  proposalMapsIntro: ['maps-and-plans', 'Maps and Plans'],
  bibliography: ['bibliography', 'Bibliography'],
  credits: ['credits', 'Credits'],
  feedback: ['feedback', 'Feedback'],
}

const { values: args } = parseArgs({
  options: {
    source: {
      type: 'string',
      default: `${WORDPRESS}/wp-json/imaginedsf/content`,
    },
  },
})

const wp: WpContent = /^https?:\/\//.test(args.source)
  ? await (await fetch(args.source)).json()
  : JSON.parse(await readFile(args.source, 'utf8'))

// --- HTML to Markdown ------------------------------------------------------

/** Points images at WordPress's own copy instead of Jetpack's CDN. */
function uploadUrl(src: string): string {
  const url = new URL(
    src.replace(/^https?:\/\/i\d\.wp\.com\//, 'https://'),
    WORDPRESS,
  )
  if (url.origin === WORDPRESS) url.search = ''
  return url.href
}

/** Makes a URL safe to use as a Markdown link destination. */
function destination(href: string): string {
  const url = /^https?:\/\//i.test(href) ? new URL(href).href : href
  return url.replace(/\s/g, '%20').replace(/[()]/g, '\\$&')
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  emDelimiter: '*',
  br: '\\',
})

// WordPress image captions become <figure> blocks, since captions can contain
// links and formatting.
turndown.addRule('caption', {
  filter: (node) =>
    node.nodeName === 'DIV' && /\bwp-caption\b/.test(node.className),
  replacement: (_content, node) => {
    const image = node.querySelector('img')
    const caption = node.querySelector('.wp-caption-text')
    const imageMarkdown = image ? turndown.turndown(image.outerHTML) : ''
    const captionMarkdown = caption ? turndown.turndown(caption.innerHTML) : ''
    return `\n\n<figure>\n\n${imageMarkdown}\n\n<figcaption>\n\n${captionMarkdown}\n\n</figcaption>\n</figure>\n\n`
  },
})

// CommonMark only reads * as emphasis when it isn't wedged between certain
// characters (as in <em>varas–</em>a), so breaks and spaces move outside the
// delimiters, and HTML tags stand in where * wouldn't work.
const PUNCTUATION = /[\p{P}\p{S}]/u
const EDGES = /^((?:\s|\\\n)*)([\s\S]*?)((?:\s|\\\n)*)$/
function emphasis(tag: 'em' | 'strong', delimiter: string) {
  return (content: string, node: TurndownService.Node) => {
    const [, leading = '', inner = '', trailing = ''] =
      EDGES.exec(content) ?? []
    if (!inner) return leading + trailing
    const before = leading
      ? ' '
      : (node.previousSibling?.textContent ?? '').slice(-1)
    const after = trailing
      ? ' '
      : (node.nextSibling?.textContent ?? '').slice(0, 1)
    const flanked = (edge: string, outside: string) =>
      !PUNCTUATION.test(edge) ||
      !outside ||
      /\s/.test(outside) ||
      PUNCTUATION.test(outside)
    const wrapped =
      flanked(inner.slice(0, 1), before) && flanked(inner.slice(-1), after)
        ? `${delimiter}${inner}${delimiter}`
        : `<${tag}>${inner}</${tag}>`
    return leading + wrapped + trailing
  }
}
turndown.addRule('emphasis', {
  filter: ['em', 'i'],
  replacement: emphasis('em', '*'),
})
turndown.addRule('strong', {
  filter: ['strong', 'b'],
  replacement: emphasis('strong', '**'),
})

turndown.addRule('image', {
  filter: 'img',
  replacement: (_content, node) => {
    const src = node.getAttribute('src')
    const alt = (node.getAttribute('alt') ?? '').replace(/[[\]\\]/g, '\\$&')
    return src ? `![${alt}](${destination(uploadUrl(src))})` : ''
  },
})

turndown.addRule('link', {
  filter: (node) => node.nodeName === 'A' && node.getAttribute('href') !== null,
  replacement: (content, node) => {
    const href = node.getAttribute('href') ?? ''
    return content.trim() ? `[${content}](${destination(href)})` : content
  },
})

function toMarkdown(html: string): string {
  return turndown
    .turndown(html)
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// --- Conversion check ------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
}
const decode = (html: string) =>
  html.replace(/&(#x?[0-9a-f]+|\w+);/gi, (entity, code: string) =>
    code[0] === '#'
      ? String.fromCodePoint(
          Number(code[1] === 'x' ? `0${code.slice(1)}` : code.slice(1)),
        )
      : (ENTITIES[code] ?? entity),
  )
// Inline tags don't separate words; other tags do.
const textOf = (html: string) =>
  decode(
    html
      .replace(/<\/?(?:a|em|strong|b|i|span|sup|sub|u|s)\b[^>]*>/gi, '')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
const attributes = (html: string, tag: string, name: string) =>
  [
    ...html.matchAll(new RegExp(`<${tag}\\s[^>]*?\\b${name}="([^"]*)"`, 'gi')),
  ].map((match) => decode(match[1]))
const normalizeUrl = (href: string) =>
  /^https?:\/\//i.test(href) ? new URL(href).href : href

// --- Headings --------------------------------------------------------------

// WordPress authors often marked body text, source lines and citations as
// headings to get bigger type. Only short headings without links that don't
// read as a sentence stay headings. They're renumbered from level 2, below the
// item's title, without skipping levels.
const HEADING = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi
const plainText = (html: string) =>
  decode(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
const headingCounts = { kept: 0, paragraphs: 0, removed: 0 }

function isSectionHeading(inner: string): boolean {
  const text = plainText(inner)
  return (
    text.length > 0 &&
    text.length <= 100 &&
    !/<(?:a|img)\b/i.test(inner) &&
    !/[.,;!?]["'”’)\]]*$/.test(text) &&
    // All-caps text is a label, like DEVELOPERS above a list of firms.
    text !== text.toUpperCase()
  )
}

function normalizeHeadings(html: string): string {
  const levels = [
    ...new Set(
      [...html.matchAll(HEADING)]
        .filter(([, , inner]) => isSectionHeading(inner))
        .map(([, level]) => Number(level)),
    ),
  ].sort((a, b) => a - b)
  return html.replace(HEADING, (_heading, level: string, inner: string) => {
    if (!plainText(inner) && !/<img\b/i.test(inner)) {
      headingCounts.removed++
      return ''
    }
    if (!isSectionHeading(inner)) {
      headingCounts.paragraphs++
      return `<p>${inner}</p>`
    }
    headingCounts.kept++
    // Headings lose trailing colons and bold or italics, and text after a
    // line break, like a subtitle, becomes a paragraph.
    const [title = '', ...rest] = inner.split(/<br\s*\/?>/i)
    const text = plainText(title)
      .replace(/:$/, '')
      .replace(/^further reading$/i, 'Further Reading')
    const tag = `h${Math.min(6, 2 + levels.indexOf(Number(level)))}`
    const subtitle = rest.join('<br>')
    return `<${tag}>${escapeHtml(text)}</${tag}>${plainText(subtitle) ? `<p>${subtitle}</p>` : ''}`
  })
}

// --- Conversion ------------------------------------------------------------

const mismatches: string[] = []

/**
 * Converts HTML to Markdown, recording anything lost along the way. The
 * check compares against the HTML after the deliberate cleanup above.
 */
function convert(html: string, file: string): string {
  const source = normalizeHeadings(html.replace(/&nbsp;|\xa0/g, ' '))
  const markdown = toMarkdown(source)
  const rendered = renderMarkdown(markdown)
  const [textBefore, textAfter] = [textOf(source), textOf(rendered)]
  if (textBefore !== textAfter) {
    let i = 0
    while (textBefore[i] === textAfter[i]) i++
    const context = (text: string) =>
      JSON.stringify(text.slice(Math.max(0, i - 30), i + 50))
    mismatches.push(
      `${file}: text changed\n  before: ${context(textBefore)}\n  after:  ${context(textAfter)}`,
    )
  }
  const compare = (what: string, before: string[], after: string[]) => {
    const lost = before.filter((item) => !after.includes(item))
    // Bare URLs in the text become links, which is fine.
    const added = after.filter(
      (item) => !before.includes(item) && !textBefore.includes(item),
    )
    if (lost.length > 0 || added.length > 0) {
      mismatches.push(
        `${file}: ${what} changed\n  lost: ${lost.join(' | ')}\n  added: ${added.join(' | ')}`,
      )
    }
  }
  compare(
    'links',
    attributes(source, 'a', 'href').map(normalizeUrl),
    attributes(rendered, 'a', 'href').map(normalizeUrl),
  )
  compare(
    'images',
    attributes(source, 'img', 'src').map((src) => normalizeUrl(uploadUrl(src))),
    attributes(rendered, 'img', 'src').map(normalizeUrl),
  )
  return markdown
}

// --- Files -----------------------------------------------------------------

function markdownFile(data: Record<string, unknown>, body: string): string {
  const document = new Document(
    Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    ),
  )
  const bbox = document.get('bbox', true)
  if (isSeq(bbox)) bbox.flow = true
  return `---\n${document.toString({ lineWidth: 0, flowCollectionPadding: false })}---\n${body ? `\n${body}\n` : ''}`
}

const slugify = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const isSlug = (text: string) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text) && !/^\d+$/.test(text)
const number = (value: string) => (value === '' ? undefined : Number(value))

const files = new Map<string, string>()
const report: string[] = []
const oddTitles: string[] = []

/** Notes titles with stray leading punctuation or doubled spaces. */
function checkTitle(title: string, file: string): string {
  if (/^[^\p{L}\p{N}]|\s{2}/u.test(title)) oddTitles.push(file)
  return title
}

const mapsById = new Map(wp.maps.map((map) => [map.ID, map]))
const groupsById = new Map(wp.mapGroups.map((group) => [group.ID, group]))

// Only maps and groups reachable from the basemaps or an era are shown.
const shown = new Set<number>()
const show = (id: number) => {
  shown.add(id)
  groupsById.get(id)?.children.forEach(show)
}
wp.basemaps.forEach(show)
wp.proposalEras.forEach((era) => era.children.forEach(show))

// Groups keep their WordPress slugs; maps that collide with one, or whose
// slug isn't usable, get one from their title.
const slugs = new Map<number, string>()
const taken = new Set<string>()
function assignSlug(post: WpPost) {
  let slug =
    isSlug(post.post_name) && !taken.has(post.post_name)
      ? post.post_name
      : slugify(post.post_title)
  for (let n = 2; taken.has(slug); n++)
    slug = `${slugify(post.post_title)}-${n}`
  if (slug !== post.post_name) {
    report.push(`Renamed ${post.post_name} (${post.post_title}) to ${slug}`)
  }
  slugs.set(post.ID, slug)
  taken.add(slug)
}
wp.mapGroups.filter((group) => shown.has(group.ID)).forEach(assignSlug)
wp.maps.filter((map) => shown.has(map.ID)).forEach(assignSlug)

for (const map of wp.maps) {
  if (!shown.has(map.ID)) {
    report.push(`Skipped unlisted map ${map.ID}: ${map.post_title}`)
    continue
  }
  const file = `maps/${slugs.get(map.ID)}.md`
  const zoom = {
    minZoom: number(map.tile_zoom?.min_tile_zoom ?? ''),
    maxZoom: number(map.tile_zoom?.max_tile_zoom ?? ''),
  }
  let source
  if (map.source_type === 'wms' && map.wms) {
    source = {
      type: 'wms',
      url: map.wms.url.replace(/\?$/, ''),
      layers: map.wms.layers,
      ...zoom,
    }
  } else if (map.source_type === 'tile' && map.tile) {
    // OpenStreetMap no longer recommends the {s} subdomains.
    const url = map.tile.url.replace(
      '{s}.tile.openstreetmap.org',
      'tile.openstreetmap.org',
    )
    source = { type: 'tile', url, ...zoom }
  } else if (map.source_type === 'geojson' && map.geojson?.file) {
    const points = map.points
    source = {
      type: 'geojson',
      url: map.geojson.file,
      properties: points
        ? {
            text: points.popup_text_property_key || undefined,
            images: points.popup_images_property_key || undefined,
            direction:
              (points.directional_pins && points.pin_direction_property_key) ||
              undefined,
          }
        : undefined,
    }
  } else {
    throw new Error(`${file}: can't convert ${map.source_type} source`)
  }
  // Adding 0 turns the -0 that WordPress sometimes stores into 0.
  const corners = map.bounds ? map.bounds.validated_coordinates : []
  const lngs = corners.map((corner) => corner.lng + 0)
  const lats = corners.map((corner) => corner.lat + 0)
  const recommended = map.metadata.recommended_basemap
  files.set(
    file,
    markdownFile(
      {
        title: checkTitle(map.post_title, file),
        year: number(map.metadata.year),
        indented: map.metadata.indented || undefined,
        recommendedBasemap: recommended ? slugs.get(recommended) : undefined,
        source,
        bbox: corners.length
          ? [
              Math.min(...lngs),
              Math.min(...lats),
              Math.max(...lngs),
              Math.max(...lats),
            ]
          : undefined,
        wordpressId: map.ID,
      },
      convert(map.metadata.description, file),
    ),
  )
}

for (const group of wp.mapGroups) {
  if (!shown.has(group.ID)) continue
  const file = `groups/${slugs.get(group.ID)}.md`
  files.set(
    file,
    markdownFile(
      {
        title: checkTitle(group.post_title, file),
        year: number(group.metadata.year),
        maps: group.children.map((id) => slugs.get(id)),
        wordpressId: group.ID,
      },
      convert(group.metadata.description, file),
    ),
  )
}

for (const era of wp.proposalEras) {
  const file = `eras/${era.post_name}.md`
  files.set(
    file,
    markdownFile(
      {
        title: checkTitle(era.post_title, file),
        start: Number(era.start),
        end: Number(era.end),
        items: era.children.map((id) => slugs.get(id)),
        wordpressId: era.ID,
      },
      convert(escapeHtml(era.description), file),
    ),
  )
}

for (const [key, [name, title]] of Object.entries(PAGES)) {
  const file = `pages/${name}.md`
  const html = wp.contentAreaContent[key] ?? ''
  // The maps and plans intro is plain text in WordPress.
  const body = key === 'proposalMapsIntro' ? escapeHtml(html) : html
  files.set(file, markdownFile({ title }, convert(body, file)))
}

const defaultBasemap =
  wp.basemaps.find((id) => mapsById.get(id)?.metadata.enabled_by_default) ??
  wp.basemaps[0]
files.set(
  'site.yml',
  new Document({
    basemaps: wp.basemaps.map((id) => slugs.get(id)),
    defaultBasemap: slugs.get(defaultBasemap),
  }).toString({ lineWidth: 0 }),
)

if (mismatches.length > 0) {
  console.error(
    `Conversion lost content; nothing was written:\n${mismatches.join('\n')}`,
  )
  process.exit(1)
}

// --- Write and validate ----------------------------------------------------

for (const name of [
  'maps',
  'groups',
  'eras',
  'pages',
  'site.yml',
]) {
  await rm(path.join(CONTENT_DIR, name), { recursive: true, force: true })
}
for (const [file, text] of files) {
  await mkdir(path.dirname(path.join(CONTENT_DIR, file)), { recursive: true })
  await writeFile(path.join(CONTENT_DIR, file), text)
}

const all = [...files.entries()]
const matching = (pattern: RegExp) =>
  all.filter(([, text]) => pattern.test(text)).map(([file]) => file)
const summarize = (label: string, list: string[]) => {
  if (list.length > 0)
    report.push(`${label} (${list.length}): ${list.join(', ')}`)
}
report.push(
  `Kept ${headingCounts.kept} section headings, turned ${headingCounts.paragraphs} headings into paragraphs, and removed ${headingCounts.removed} empty ones`,
)
summarize(
  'Links into the old site',
  matching(
    /\]\((?:https:\/\/www\.imaginedsanfrancisco\.org\/(?!wp-content)|#)/,
  ),
)
summarize(
  'Files on the WordPress server',
  matching(/imaginedsanfrancisco\.org\/wp-content\/uploads/),
)
summarize('Placeholder text', matching(/lorem ipsum/i))
summarize('Titles with stray punctuation or spacing', oddTitles)

const { errors, warnings } = await buildContent(CONTENT_DIR)
console.log(`Imported ${files.size} files into content/.`)
for (const line of report) console.log(`- ${line}`)
for (const warning of warnings) console.log(`Warning: ${formatIssue(warning)}`)
if (errors.length > 0) {
  console.error(
    `Imported content is invalid:\n${errors.map(formatIssue).join('\n')}`,
  )
  process.exit(1)
}
