import content from 'virtual:content'
import type { PageName } from '../plugins/content/schema.ts'
// Kept a separate file, since <use> can't point into an inlined data URL.
import logoUrl from './logo.svg?no-inline'

// Pages the header opens. Maps and plans is the sidebar itself.
const headerPages = (Object.keys(content.pages) as PageName[]).filter(
  (name) => name !== 'maps-and-plans',
)

interface HeaderProps {
  onOpenPage: (name: PageName) => void
}

/** The site's logo, which starts over, and links to its pages. */
export function Header({ onOpenPage }: HeaderProps) {
  return (
    <header className="site-header">
      <h1>
        <a href={import.meta.env.BASE_URL} title="Start over">
          <svg
            viewBox="0 0 198 49"
            role="img"
            aria-label="Imagined San Francisco"
          >
            <use href={`${logoUrl}#logo`} />
          </svg>
        </a>
      </h1>
      <nav aria-label="Pages">
        <ul>
          {headerPages.map((name) => (
            <li key={name}>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => onOpenPage(name)}
              >
                {content.pages[name].title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
