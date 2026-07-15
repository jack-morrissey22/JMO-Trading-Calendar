import { useEffect } from 'react'

// Close a modal when the Escape key is pressed. Skipped while `disabled` is true
// (e.g. a save is in flight) to match the disabled state of the Cancel button.
export function useEscClose(onClose: () => void, disabled = false) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disabled) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, disabled])
}
