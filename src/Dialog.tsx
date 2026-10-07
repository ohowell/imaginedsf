import { useEffect, useId, useRef, type ReactNode } from 'react'

interface DialogProps {
  open: boolean
  /** The dialog's heading. */
  title: ReactNode
  /** Called when the dialog closes itself, by Escape, × or a click outside. */
  onClose: () => void
  children: ReactNode
}

/** A modal dialog with a title and close button, over the rest of the page. */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      // Clicks outside the content land on the dialog itself, as backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close()
      }}
    >
      {open && (
        <div className="dialog-content">
          <header>
            {/* Content Markdown starts its headings at level 2. */}
            <h1 id={titleId}>{title}</h1>
            <button
              type="button"
              className="close"
              aria-label="Close"
              onClick={() => dialog.current?.close()}
            >
              ×
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}
