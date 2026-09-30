import content from 'virtual:content'

// Placeholder UI showing that content loads.
export default function App() {
  const { eras, groups, maps, pages } = content
  return (
    <main>
      <h1>Imagined San Francisco</h1>
      <p>Static rebuild in progress.</p>
      <p>
        {Object.keys(maps).length} maps, {Object.keys(groups).length} groups,{' '}
        {eras.length} proposal eras
      </p>
      <ol>
        {eras.map((era) => (
          <li key={era.slug}>
            {era.title} ({era.start}–{era.end}), {era.items.length}{' '}
            {era.items.length === 1 ? 'item' : 'items'}
          </li>
        ))}
      </ol>
      <h2>{pages.introduction.title}</h2>
      <div dangerouslySetInnerHTML={{ __html: pages.introduction.body }} />
    </main>
  )
}
