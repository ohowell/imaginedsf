import { useState } from 'react'
import content from 'virtual:content'
import { AboutDialog } from './AboutDialog.tsx'
import { MapView } from './map/MapView.tsx'

type Bbox = [number, number, number, number]

// Map test: a basemap switcher and every layer, grouped by era.
export default function App() {
  const [basemap, setBasemap] = useState(content.defaultBasemap)
  const [overlays, setOverlays] = useState<string[]>([])
  const [opacity, setOpacity] = useState<Record<string, number>>({})
  const [focus, setFocus] = useState<{ bbox: Bbox }>()
  // Slug of the layer or group whose description is open.
  const [about, setAbout] = useState<string>()

  function show(slug: string) {
    if (content.basemaps.includes(slug)) {
      setBasemap(slug)
      return
    }
    if (!overlays.includes(slug)) setOverlays([...overlays, slug])
    const { bbox } = content.layers[slug]
    if (bbox) setFocus({ bbox })
  }

  // For layers that help read others, so they shouldn't cover them or move away.
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

  // Opens the description of a layer or group, for those that have one.
  const info = (slug: string) => {
    const { title, description } = content.layers[slug] ?? content.groups[slug]
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
    const layer = content.layers[slug]
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
            {layer.title} <small>{layer.year}</small>{' '}
            <small className="tag">{layer.source.type}</small>
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
            aria-label={`${layer.title} opacity`}
            onChange={(event) =>
              setOpacity({ ...opacity, [slug]: Number(event.target.value) })
            }
          />
        )}
        {layer.children && <ul>{layer.children.map(row)}</ul>}
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
                {content.layers[slug].title}{' '}
                <small className="tag">
                  {content.layers[slug].source.type}
                </small>
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
              {era.children.map((item) => {
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
                    <ul>{group.children.map(row)}</ul>
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
