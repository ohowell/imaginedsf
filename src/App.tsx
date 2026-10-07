import { useState } from 'react'
import content from 'virtual:content'
import { AboutDialog } from './AboutDialog.tsx'
import { MapView } from './map/MapView.tsx'

type Bbox = [number, number, number, number]

// Map test: a basemap switcher and every map, grouped by era.
export default function App() {
  const [basemap, setBasemap] = useState(content.defaultBasemap)
  const [overlays, setOverlays] = useState<string[]>([])
  const [opacity, setOpacity] = useState<Record<string, number>>({})
  const [focus, setFocus] = useState<{ bbox: Bbox }>()
  // Slug of the map or group whose description is open.
  const [about, setAbout] = useState<string>()

  function show(slug: string) {
    if (content.basemaps.includes(slug)) {
      setBasemap(slug)
      return
    }
    if (!overlays.includes(slug)) setOverlays([...overlays, slug])
    const { bbox } = content.maps[slug]
    if (bbox) setFocus({ bbox })
  }

  // For maps that help read others, so they shouldn't cover them or move away.
  function showUnder(slug: string) {
    if (content.basemaps.includes(slug)) {
      setBasemap(slug)
    } else if (!overlays.includes(slug)) {
      setOverlays([slug, ...overlays])
    }
  }

  function toggle(slug: string) {
    if (overlays.includes(slug)) {
      setOverlays(overlays.filter((other) => other !== slug))
    } else {
      show(slug)
    }
  }

  // Opens the description of a map or group, for those that have one.
  const info = (slug: string) => {
    const { title, description } = content.maps[slug] ?? content.groups[slug]
    if (!description) return null
    return (
      <button
        type="button"
        className="info"
        aria-label={`About ${title}`}
        aria-haspopup="dialog"
        onClick={() => setAbout(slug)}
      >
        i
      </button>
    )
  }

  const row = (slug: string) => {
    const map = content.maps[slug]
    const shown = overlays.includes(slug)
    return (
      <li key={slug}>
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={shown}
              onChange={() => toggle(slug)}
            />{' '}
            {map.title} <small>{map.year}</small>{' '}
            <small className="tag">{map.source.type}</small>
          </label>
          {info(slug)}
        </div>
        {shown && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={opacity[slug] ?? 1}
            aria-label={`${map.title} opacity`}
            onChange={(event) =>
              setOpacity({ ...opacity, [slug]: Number(event.target.value) })
            }
          />
        )}
        {map.children && <ul>{map.children.map(row)}</ul>}
      </li>
    )
  }

  return (
    <div className="layout">
      <aside className="panel">
        <h1>Imagined San Francisco</h1>
        <fieldset>
          <legend>Basemap</legend>
          {content.basemaps.map((slug) => (
            <div key={slug} className="row">
              <label>
                <input
                  type="radio"
                  name="basemap"
                  checked={basemap === slug}
                  onChange={() => setBasemap(slug)}
                />{' '}
                {content.maps[slug].title}{' '}
                <small className="tag">{content.maps[slug].source.type}</small>
              </label>
              {info(slug)}
            </div>
          ))}
        </fieldset>
        {content.eras.map((era) => (
          <section key={era.slug}>
            <h2>
              {era.title}{' '}
              <small>
                {era.start}–{era.end}
              </small>
            </h2>
            {/* Rendered at build time from the site's own Markdown. */}
            <div
              className="era-description"
              dangerouslySetInnerHTML={{ __html: era.description }}
            />
            <ul>
              {era.items.map((item) => {
                const group = content.groups[item]
                if (!group) return row(item)
                return (
                  <li key={item}>
                    <div className="row">
                      <span>
                        {group.title}{' '}
                        <small>
                          {group.year}
                          {group.endYear && `–${group.endYear}`}
                        </small>
                      </span>
                      {info(item)}
                    </div>
                    <ul>{group.maps.map(row)}</ul>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </aside>
      <MapView
        basemap={basemap}
        layers={overlays}
        opacity={opacity}
        focus={focus}
      />
      <AboutDialog
        slug={about}
        basemap={basemap}
        overlays={overlays}
        onShow={show}
        onShowUnder={showUnder}
        onClose={() => setAbout(undefined)}
      />
    </div>
  )
}
