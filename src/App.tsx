import { useState } from 'react'
import content from 'virtual:content'
import { MapView } from './map/MapView.tsx'

type Bbox = [number, number, number, number]

// Map test: a basemap switcher and every map, grouped by era.
export default function App() {
  const [basemap, setBasemap] = useState(content.defaultBasemap)
  const [overlays, setOverlays] = useState<string[]>([])
  const [opacity, setOpacity] = useState<Record<string, number>>({})
  const [focus, setFocus] = useState<{ bbox: Bbox }>()

  function toggle(slug: string) {
    if (overlays.includes(slug)) {
      setOverlays(overlays.filter((other) => other !== slug))
      return
    }
    setOverlays([...overlays, slug])
    const { bbox } = content.maps[slug]
    if (bbox) setFocus({ bbox })
  }

  const row = (slug: string) => {
    const map = content.maps[slug]
    const shown = overlays.includes(slug)
    return (
      <li key={slug}>
        <label>
          <input
            type="checkbox"
            checked={shown}
            onChange={() => toggle(slug)}
          />{' '}
          {map.title} <small>{map.year}</small>{' '}
          <small className="tag">{map.source.type}</small>
        </label>
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
            <label key={slug}>
              <input
                type="radio"
                name="basemap"
                checked={basemap === slug}
                onChange={() => setBasemap(slug)}
              />{' '}
              {content.maps[slug].title}{' '}
              <small className="tag">{content.maps[slug].source.type}</small>
            </label>
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
            <ul>
              {era.items.map((item) => {
                const group = content.groups[item]
                if (!group) return row(item)
                return (
                  <li key={item}>
                    {group.title}
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
    </div>
  )
}
