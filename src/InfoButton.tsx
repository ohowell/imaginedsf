import content from 'virtual:content'

interface InfoButtonProps {
  /** Slug of the layer or group to describe. */
  slug: string
  onOpen: (slug: string) => void
}

/** Opens the description of a layer or group, for those that have one. */
export function InfoButton({ slug, onOpen }: InfoButtonProps) {
  const { title, description } = content.layers[slug] ?? content.groups[slug]
  if (!description) return null
  return (
    <button
      type="button"
      className="info"
      aria-label={`About ${title}`}
      aria-haspopup="dialog"
      onClick={() => onOpen(slug)}
    >
      i
    </button>
  )
}
