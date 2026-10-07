import content from 'virtual:content'
import type { PageName } from '../plugins/content/schema.ts'
import { chooseTheme, useTheme } from './theme.ts'
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
  const theme = useTheme()
  const other = theme === 'dark' ? 'light' : 'dark'
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
          <li>
            <button
              type="button"
              className="theme-toggle"
              aria-label={`Switch to ${other} mode`}
              title={`Switch to ${other} mode`}
              onClick={() => chooseTheme(other)}
            >
              {/* The current mode: a moon for dark, a sun for light. */}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {theme === 'dark' ? (
                  <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
                ) : (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </>
                )}
              </svg>
            </button>
          </li>
        </ul>
      </nav>
    </header>
  )
}
