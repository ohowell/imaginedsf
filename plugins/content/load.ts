import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { z } from 'zod'
import { headingProblems } from './markdown.ts'
import {
  eraSchema,
  groupSchema,
  layerSchema,
  pageSchema,
  siteSchema,
  type EraData,
  type GroupData,
  type LayerData,
  type PageData,
  type SiteData,
} from './schema.ts'

export interface ContentIssue {
  file: string
  message: string
}

export interface Entry<T> {
  slug: string
  file: string
  data: T
  body: string
}

export interface RawContent {
  /** The content directory as shown in messages, e.g. "content". */
  dir: string
  site: { file: string; data: SiteData } | undefined
  layers: Entry<LayerData>[]
  groups: Entry<GroupData>[]
  eras: Entry<EraData>[]
  pages: Entry<PageData>[]
  /** Files in assets/, as paths from the project root like "assets/images/x.jpg". */
  assets: string[]
  /** Parsed GeoJSON files in assets/, by path. */
  geojson: Map<string, unknown>
}

const FRONT_MATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---(?:\r?\n|$)/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Reads and validates each content file on its own, and lists the files in
 * the assets directory.
 */
export async function loadContent(
  dir: string,
  assetsDir: string,
): Promise<{ raw: RawContent; errors: ContentIssue[] }> {
  const errors: ContentIssue[] = []
  const display = (file: string) =>
    path.relative(path.dirname(dir), file).split(path.sep).join('/')

  function check<T>(schema: z.ZodType<T>, value: unknown, file: string) {
    const result = schema.safeParse(value)
    if (result.success) return result.data
    for (const issue of result.error.issues) {
      const field = issue.path.join('.')
      errors.push({
        file: display(file),
        message: field ? `${field}: ${issue.message}` : issue.message,
      })
    }
  }

  function parse(text: string, file: string): { value: unknown } | undefined {
    try {
      return { value: parseYaml(text) }
    } catch (error) {
      errors.push({ file: display(file), message: String(error) })
    }
  }

  async function loadSite() {
    const file = path.join(dir, 'site.yml')
    const text = await readFile(file, 'utf8').catch(() => undefined)
    if (text === undefined) {
      errors.push({ file: display(file), message: 'missing' })
      return
    }
    const parsed = parse(text, file)
    const data = parsed && check(siteSchema, parsed.value, file)
    return data && { file: display(file), data }
  }

  async function loadCollection<T>(name: string, schema: z.ZodType<T>) {
    const folder = path.join(dir, name)
    const names = await readdir(folder).catch(() => [])
    const entries: Entry<T>[] = []
    for (const name of names.toSorted()) {
      if (name.startsWith('.')) continue
      const file = path.join(folder, name)
      const slug = path.basename(name, '.md')
      if (!name.endsWith('.md')) {
        errors.push({
          file: display(file),
          message:
            'content folders only hold Markdown; put other files in assets/',
        })
        continue
      }
      if (!SLUG.test(slug)) {
        errors.push({
          file: display(file),
          message:
            'file name must be a lowercase slug such as "fulton-circle.md"',
        })
        continue
      }
      const text = await readFile(file, 'utf8')
      const match = FRONT_MATTER.exec(text)
      if (!match) {
        errors.push({
          file: display(file),
          message: 'must start with YAML front matter between --- lines',
        })
        continue
      }
      const body = text.slice(match[0].length)
      for (const problem of headingProblems(body)) {
        errors.push({ file: display(file), message: problem })
      }
      const parsed = parse(match[1] ?? '', file)
      const data = parsed && check(schema, parsed.value ?? {}, file)
      if (data) {
        entries.push({ slug, file: display(file), data, body })
      }
    }
    return entries
  }

  async function loadAssets() {
    const entries = await readdir(assetsDir, {
      recursive: true,
      withFileTypes: true,
    }).catch(() => [])
    const assets: string[] = []
    const geojson = new Map<string, unknown>()
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue
      const file = path.join(entry.parentPath, entry.name)
      const asset = display(file)
      assets.push(asset)
      if (/\.(?:geo)?json$/i.test(entry.name)) {
        try {
          geojson.set(asset, JSON.parse(await readFile(file, 'utf8')))
        } catch (error) {
          errors.push({ file: asset, message: String(error) })
        }
      }
    }
    return { assets: assets.toSorted(), geojson }
  }

  const raw: RawContent = {
    dir: display(dir),
    site: await loadSite(),
    layers: await loadCollection('layers', layerSchema),
    groups: await loadCollection('groups', groupSchema),
    eras: await loadCollection('eras', eraSchema),
    pages: await loadCollection('pages', pageSchema),
    ...(await loadAssets()),
  }
  return { raw, errors }
}
