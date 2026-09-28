import { Suspense, use } from 'react'

// Placeholder UI. public/content.json is a temporary snapshot of the
// WordPress content API; these types cover only the fields shown here.
interface ProposalEra {
  ID: number
  post_title: string
  start: string
  end: string
  children: number[]
}

interface Content {
  maps: unknown[]
  narratives: unknown[]
  proposalEras: ProposalEra[]
}

const contentUrl = `${import.meta.env.BASE_URL}content.json`

const contentPromise: Promise<Content | Error> = fetch(contentUrl)
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Couldn't load ${contentUrl} (HTTP ${response.status})`)
    }
    return response.json() as Promise<Content>
  })
  .catch((error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  )

function ContentSummary() {
  const content = use(contentPromise)
  if (content instanceof Error) {
    return <p role="alert">{content.message}</p>
  }

  const { maps, narratives, proposalEras } = content
  const eras = proposalEras.toSorted(
    (a, b) => Number(a.start) - Number(b.start),
  )
  return (
    <>
      <p>
        {maps.length} maps, {proposalEras.length} proposal eras,{' '}
        {narratives.length} narratives
      </p>
      <ol>
        {eras.map((era) => (
          <li key={era.ID}>
            {era.post_title} ({era.start}–{era.end}), {era.children.length}{' '}
            {era.children.length === 1 ? 'item' : 'items'}
          </li>
        ))}
      </ol>
    </>
  )
}

export default function App() {
  return (
    <main>
      <h1>Imagined San Francisco</h1>
      <Suspense fallback={<p>Loading content…</p>}>
        <ContentSummary />
      </Suspense>
    </main>
  )
}
