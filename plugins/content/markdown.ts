import { Marked, Renderer } from 'marked'

// External links open in a new tab so readers keep their place on the map.
const marked = new Marked({
  renderer: {
    link(token) {
      const html = Renderer.prototype.link.call(this, token)
      return /^https?:\/\//i.test(token.href)
        ? html.replace(/^<a /, '<a target="_blank" rel="noopener" ')
        : html
    },
    image(token) {
      return Renderer.prototype.image
        .call(this, token)
        .replace(/^<img /, '<img loading="lazy" decoding="async" ')
    },
  },
})

export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown, { async: false })
}

/**
 * Describes headings that break the outline. The title is level 1, so
 * headings in a body start at level 2 and don't skip levels.
 */
export function headingProblems(markdown: string): string[] {
  const problems: string[] = []
  let previous = 1
  for (const token of marked.lexer(markdown)) {
    if (token.type !== 'heading') continue
    if (token.depth === 1) {
      problems.push(
        `heading "${token.text}" is level 1, which is for the title; use ## instead`,
      )
    } else if (token.depth > previous + 1) {
      problems.push(
        `heading "${token.text}" skips from level ${previous} to level ${token.depth}`,
      )
    }
    previous = token.depth
  }
  return problems
}
