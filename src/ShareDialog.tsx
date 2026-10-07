import { useRef, useState } from 'react'
import { Dialog } from './Dialog.tsx'

interface ShareDialogProps {
  open: boolean
  onClose: () => void
}

/** A link to what the map shows now, from the address bar, ready to copy. */
export function ShareDialog({ open, onClose }: ShareDialogProps) {
  // Read when opened, since the address keeps up with the map.
  const [link, setLink] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState<'yes' | 'failed'>()
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setLink(window.location.href)
      setCopied(undefined)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied('yes')
      return
    } catch {
      // Some browsers and embedded views block the clipboard API.
    }
    // The older way copies whatever's selected, and leaves the link selected
    // for copying by hand if that's blocked too.
    field.current?.select()
    setCopied(document.execCommand('copy') ? 'yes' : 'failed')
  }

  return (
    <Dialog
      open={open}
      title="Share this view"
      className="share-dialog"
      onClose={onClose}
    >
      <p>This link opens the map to the view you're currently seeing.</p>
      <div className="share-link">
        <input
          type="text"
          ref={field}
          readOnly
          value={link}
          aria-label="Link to this view"
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="button" onClick={copy}>
          {copied === 'yes' ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="share-status" role="status">
        {copied === 'failed' &&
          "Your browser didn't allow copying, so select the link and copy it yourself."}
      </p>
    </Dialog>
  )
}
