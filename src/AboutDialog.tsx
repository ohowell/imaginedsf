import { useEffect, useId, useRef } from 'react'
import content from 'virtual:content'

interface AboutDialogProps {
  /** Slug of the layer or group to describe, or nothing to stay closed. */
  slug?: string
  /** Slug of the current basemap. */
  basemap: string
  /** Slugs of the layers shown on the basemap. */
  overlays: string[]
  /** Shows a layer: as the basemap if it's one, or on top and zoomed to. */
  onShow: (slug: string) => void
  /** Shows a layer under the others, or as the basemap if it's one. */
  onShowUnder: (slug: string) => void
  onClose: () => void
}

/** A layer's or group's description, with ways to see it on the map. */
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

  const layer = slug ? content.layers[slug] : undefined
  const group = slug ? content.groups[slug] : undefined
  const item = layer ?? group

  const isShown = (target: string) =>
    target === basemap || overlays.includes(target)

  // Labels and what they do, which ends with closing to reveal the map.
  const actions: [string, () => void][] = []
  if (layer && !isShown(layer.slug)) {
    const isBasemap = content.basemaps.includes(layer.slug)
    actions.push([
      isBasemap ? 'Use as basemap' : 'Show on map',
      () => onShow(layer.slug),
    ])
  } else if (layer?.bbox && layer.slug !== basemap) {
    actions.push(['Zoom to layer', () => onShow(layer.slug)])
  }
  const companion = layer?.showWith
  if (companion && !isShown(companion)) {
    actions.push([
      `Show with ${content.layers[companion].title}`,
      () => onShowUnder(companion),
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
