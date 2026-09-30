import path from 'node:path'
import { normalizePath, type Plugin } from 'vite'
import { loadContent, type ContentIssue } from './load.ts'
import { resolveContent } from './resolve.ts'

const VIRTUAL_ID = 'virtual:content'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

/** Loads, validates and renders everything in a content directory. */
export async function buildContent(dir: string) {
  const loaded = await loadContent(dir)
  // Cross-references are only checked once every file is valid on its own,
  // so one broken file doesn't also surface as a missing reference.
  if (loaded.errors.length > 0) {
    return { content: undefined, errors: loaded.errors, warnings: [] }
  }
  return resolveContent(loaded.raw)
}

export const formatIssue = ({ file, message }: ContentIssue) =>
  `${file}: ${message}`

/** Provides the site content as `virtual:content`. */
export function content(): Plugin {
  let contentDir = ''
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
      contentDir = normalizePath(path.join(config.root, 'content'))
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },
    async load(id) {
      if (id !== RESOLVED_ID) return
      const { content, errors, warnings } = await buildContent(contentDir)
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
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(content))})`
    },
    hotUpdate({ file }) {
      if (
        this.environment.name !== 'client' ||
        !file.startsWith(`${contentDir}/`)
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
