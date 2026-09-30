import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { z } from 'zod'
import { headingProblems } from './markdown.ts'
import {
  eraSchema,
  groupSchema,
  mapSchema,
  pageSchema,
  siteSchema,
  type EraData,
  type GroupData,
  type MapData,
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
  maps: Entry<MapData>[]
  groups: Entry<GroupData>[]
  eras: Entry<EraData>[]
  pages: Entry<PageData>[]
}

const FRONT_MATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---(?:\r?\n|$)/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Reads and validates each content file on its own. */
export async function loadContent(
  dir: string,
): Promise<{ raw: RawContent; errors: ContentIssue[] }> {
  const errors: ContentIssue[] = []
  const display = (file: string) => path.relative(path.dirname(dir), file)

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
          message: 'content files must end in .md',
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

  const raw: RawContent = {
    dir: display(dir),
    site: await loadSite(),
    maps: await loadCollection('maps', mapSchema),
    groups: await loadCollection('groups', groupSchema),
    eras: await loadCollection('eras', eraSchema),
    pages: await loadCollection('pages', pageSchema),
  }
  return { raw, errors }
}
