import content from 'virtual:content'
import { Dialog } from './Dialog.tsx'

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
    <Dialog
      open={item !== undefined}
      title={
        item && (
          <>
            {item.title}{' '}
            <small>
              {item.year}
              {group?.endYear && `–${group.endYear}`}
            </small>
          </>
        )
      }
      onClose={onClose}
    >
      {actions.length > 0 && (
        <p className="actions">
          {actions.map(([label, run]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                run()
                onClose()
              }}
            >
              {label}
            </button>
          ))}
        </p>
      )}
      {item && (
        // Rendered at build time from the site's own Markdown.
        <div dangerouslySetInnerHTML={{ __html: item.description }} />
      )}
    </Dialog>
  )
}
