import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { normalizePath, type Plugin } from 'vite'
import { loadContent, type ContentIssue } from './load.ts'
import { resolveContent } from './resolve.ts'

const VIRTUAL_ID = 'virtual:content'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

/** Loads, validates and renders everything in content/ and assets/. */
async function buildContent(root: string, base: string) {
  const loaded = await loadContent(
    path.join(root, 'content'),
    path.join(root, 'assets'),
  )
  // Cross-references are only checked once every file is valid on its own,
  // so one broken file doesn't also surface as a missing reference.
  if (loaded.errors.length > 0) {
    return {
      content: undefined,
      assets: [],
      errors: loaded.errors,
      warnings: [],
    }
  }
  return resolveContent(loaded.raw, { base })
}

const formatIssue = ({ file, message }: ContentIssue) => `${file}: ${message}`

/**
 * Provides the site content as `virtual:content`, and copies the files in
 * assets/ that it uses into the build.
 */
export function content(): Plugin {
  let root = ''
  let base = '/'
  let usedAssets: string[] = []
  return {
    name: 'imaginedsf-content',
    config() {
      // A separate file for content means editing content doesn't change the
      // app's code file, or the other way around, so each stays cached.
      return {
        build: {
          rolldownOptions: {
            output: {
              codeSplitting: {
                groups: [{ name: 'content', test: /virtual:content/ }],
              },
            },
          },
        },
      }
    },
    configResolved(config) {
      root = normalizePath(config.root)
      base = config.base
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },
    async load(id) {
      if (id !== RESOLVED_ID) return
      const { content, assets, errors, warnings } = await buildContent(
        root,
        base,
      )
      for (const warning of warnings) {
        this.warn(formatIssue(warning))
      }
      if (!content) {
        // No stack trace, since the problem is in the content, not the code.
        return this.error({
          message: `Invalid content:\n${errors.map(formatIssue).join('\n')}`,
          stack: '',
        })
      }
      usedAssets = assets
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(content))})`
    },
    // The dev server serves assets/ from the project root, so assets only need
    // copying when building.
    async writeBundle({ dir }) {
      if (!dir) return
      for (const asset of usedAssets) {
        const target = path.join(dir, asset)
        await mkdir(path.dirname(target), { recursive: true })
        await copyFile(path.join(root, asset), target)
      }
    },
    hotUpdate({ file }) {
      if (
        this.environment.name !== 'client' ||
        !(
          file.startsWith(`${root}/content/`) ||
          file.startsWith(`${root}/assets/`)
        )
      ) {
        return
      }
      const module = this.environment.moduleGraph.getModuleById(RESOLVED_ID)
      if (module) {
        this.environment.moduleGraph.invalidateModule(module)
      }
      this.environment.hot.send({ type: 'full-reload' })
      return []
    },
  }
}
