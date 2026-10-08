import type { MouseEvent } from 'react'
import content from 'virtual:content'
import {
  headerPages,
  itemPath,
  pagePath,
  type HeaderPage,
} from '../plugins/content/addresses.ts'

/** A dialog with an address of its own. See addresses.ts. */
export interface Opened {
  /** A page from the header, like the introduction. */
  page?: HeaderPage
  /** Slug of a layer or group whose description is open. */
  about?: string
}

/** The path that opens a dialog, or the site's own, for none. */
export function toPath({ page, about }: Opened): string {
  const path = about
    ? itemPath(content, about)
    : page
      ? pagePath(page)
      : undefined
  return `${import.meta.env.BASE_URL}${path ?? ''}`
}

const isHeaderPage = (name: string): name is HeaderPage =>
  (headerPages as string[]).includes(name)

/**
 * The dialog a path opens: its own, or the one the old site opened there, for
 * pages and descriptions by WordPress ID, like /description/569. Other paths,
 * like the old site's /maps-and-plans for the sidebar, open none.
 */
export function fromPath(pathname: string): Opened {
  const base = import.meta.env.BASE_URL
  if (!pathname.startsWith(base)) return {}
  const [route, id, ...rest] = pathname
    .slice(base.length)
    .split('/')
    .filter(Boolean)
  if (rest.length > 0) return {}
  if ((route === 'layers' || route === 'groups') && id) {
    return itemPath(content, id) === `${route}/${id}/` ? { about: id } : {}
  }
  if (route === 'description' && id) {
    const about = [
      ...Object.values(content.layers),
      ...Object.values(content.groups),
    ].find((item) => String(item.wordpressId) === id)?.slug
    return about ? { about } : {}
  }
  return route && !id && isHeaderPage(route) ? { page: route } : {}
}

/**
 * Puts the open dialog's path in the address bar, keeping the hash, without
 * adding to the history. Old site addresses become new ones.
 */
export function replacePath(opened: Opened) {
  const url = new URL(window.location.href)
  url.pathname = toPath(opened)
  if (url.href !== window.location.href) {
    history.replaceState(history.state, '', url)
  }
}

/**
 * Opens a dialog from a link to its address, unless the click opens the link
 * in another tab or window instead.
 */
export function openFromLink(event: MouseEvent, open: () => void) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return
  }
  event.preventDefault()
  open()
}
