import { useId, useState } from 'react'
import content from 'virtual:content'
import { InfoButton } from './InfoButton.tsx'
import { MapControl } from './map/MapControl.tsx'

interface BasemapControlProps {
  /** Slug of the current basemap. */
  basemap: string
  onChange: (slug: string) => void
  /** Opens a basemap's description. */
  onAbout: (slug: string) => void
}

/** A collapsible list of basemaps, floating in the map's corner. */
export function BasemapControl({
  basemap,
  onChange,
  onAbout,
}: BasemapControlProps) {
  const [open, setOpen] = useState(true)
  const listId = useId()

  return (
    <MapControl position="bottom-right" className="basemap-control">
      <button
        type="button"
        className="basemap-toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
      >
        Basemaps
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 2 8.5 12 14l10-5.5z" />
          <path d="m2 12.5 10 5.5 10-5.5M2 16.5 12 22l10-5.5" />
        </svg>
      </button>
      <div
        id={listId}
        role="radiogroup"
        aria-label="Basemap"
        className="basemap-list"
        hidden={!open}
      >
        {content.basemaps.map((slug) => (
          <div key={slug} className="row">
            <label>
              <input
                type="radio"
                name="basemap"
                checked={basemap === slug}
                onChange={() => onChange(slug)}
              />{' '}
              {content.layers[slug].title}
            </label>
            <InfoButton slug={slug} onOpen={onAbout} />
          </div>
        ))}
      </div>
    </MapControl>
  )
}
