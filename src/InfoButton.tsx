import content from 'virtual:content'
import { openFromLink, toPath } from './path.ts'

interface InfoButtonProps {
  /** Slug of the layer or group to describe. */
  slug: string
  onOpen: (slug: string) => void
}

/**
 * Opens the description of a layer or group, for those that have one. It
 * links to the description's own address, for opening in a new tab.
 */
export function InfoButton({ slug, onOpen }: InfoButtonProps) {
  const { title, description } = content.layers[slug] ?? content.groups[slug]
  if (!description) return null
  return (
    <a
      href={toPath({ about: slug })}
      className="info"
      aria-label={`About ${title}`}
      aria-haspopup="dialog"
      onClick={(event) => openFromLink(event, () => onOpen(slug))}
    >
      i
    </a>
  )
}
