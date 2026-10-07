import { useSyncExternalStore } from 'react'

/**
 * The color scheme: the visitor's choice from the header's toggle, or their
 * system's until they make one. It's the `data-theme` attribute on <html>,
 * which index.html sets before the page draws.
 */
export type Theme = 'light' | 'dark'

// Also read by the script in index.html.
const STORAGE_KEY = 'imaginedsf:theme'

const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function chosenTheme(): Theme | undefined {
  try {
    const theme = localStorage.getItem(STORAGE_KEY)
    return theme === 'light' || theme === 'dark' ? theme : undefined
  } catch {
    // With storage blocked, the system's color scheme is all there is.
    return undefined
  }
}

const currentTheme = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  for (const listener of listeners) listener()
}

// Follows the system's color scheme until the visitor chooses one.
systemDark.addEventListener('change', () => {
  if (!chosenTheme()) applyTheme(systemDark.matches ? 'dark' : 'light')
})

/** The current color scheme, following changes to it. */
export function useTheme(): Theme {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, currentTheme)
}

/** Switches to a color scheme, and remembers the choice for later visits. */
export function chooseTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage is blocked, so the choice lasts only until the page reloads.
  }
  applyTheme(theme)
}
