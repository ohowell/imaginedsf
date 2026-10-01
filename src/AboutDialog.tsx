import { useEffect, useId, useRef } from 'react'
import content from 'virtual:content'

interface AboutDialogProps {
  /** Slug of the map or group to describe, or nothing to stay closed. */
  slug?: string
  /** Slug of the current basemap. */
  basemap: string
  /** Slugs of the maps shown on the basemap. */
  overlays: string[]
  /** Shows a map: as the basemap if it's one, or on top and zoomed to. */
  onShow: (slug: string) => void
  /** Shows a map under the others, or as the basemap if it's one. */
  onShowUnder: (slug: string) => void
  onClose: () => void
}

/** A map's or group's description, with ways to see the map. */
export function AboutDialog({
  slug,
  basemap,
  overlays,
  onShow,
  onShowUnder,
  onClose,
}: AboutDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (slug && !element.open) element.showModal()
    if (!slug) element.close()
  }, [slug])

  const map = slug ? content.maps[slug] : undefined
  const group = slug ? content.groups[slug] : undefined
  const item = map ?? group

  const isShown = (target: string) =>
    target === basemap || overlays.includes(target)

  // Labels and what they do, which ends with closing to reveal the map.
  const actions: [string, () => void][] = []
  if (map && !isShown(map.slug)) {
    const isBasemap = content.basemaps.includes(map.slug)
    actions.push([
      isBasemap ? 'Use as basemap' : 'Show on map',
      () => onShow(map.slug),
    ])
  } else if (map?.bbox && map.slug !== basemap) {
    actions.push(['Zoom to map', () => onShow(map.slug)])
  }
  // Despite the name, these can be any map that helps read this one.
  const recommended = map?.recommendedBasemap
  if (recommended && !isShown(recommended)) {
    actions.push([
      `Show recommended basemap: ${content.maps[recommended].title}`,
      () => onShowUnder(recommended),
    ])
  }

  return (
    <dialog
      ref={dialog}
      className="about"
      aria-labelledby={titleId}
      onClose={onClose}
      // Clicks outside the content land on the dialog itself, as backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close()
      }}
    >
      {item && (
        <div className="about-content">
          <header>
            {/* Descriptions start their headings at level 2. */}
            <h1 id={titleId}>
              {item.title}{' '}
              <small>
                {item.year}
                {group?.endYear && `–${group.endYear}`}
              </small>
            </h1>
            <button
              type="button"
              className="close"
              aria-label="Close"
              onClick={() => dialog.current?.close()}
            >
              ×
            </button>
          </header>
          {actions.length > 0 && (
            <p className="actions">
              {actions.map(([label, run]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    run()
                    dialog.current?.close()
                  }}
                >
                  {label}
                </button>
              ))}
            </p>
          )}
          {/* Rendered at build time from the site's own Markdown. */}
          <div
            className="description"
            dangerouslySetInnerHTML={{ __html: item.description }}
          />
        </div>
      )}
    </dialog>
  )
}
