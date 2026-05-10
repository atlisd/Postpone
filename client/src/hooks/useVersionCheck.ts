import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

const POLL_MS = 5 * 60 * 1000
const AUTO_RELOAD_HIDDEN_MS = 30 * 60 * 1000

export function useVersionCheck() {
  const notified = useRef(false)
  const hiddenAt = useRef<number | null>(null)

  useEffect(() => {
    if (import.meta.env.DEV) return

    async function check() {
      try {
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
        if (!res.ok) return
        const { buildTime } = await res.json()
        if (buildTime !== __BUILD_TIME__ && !notified.current) {
          notified.current = true
          toast.info('A new version is available', {
            action: { label: 'Update', onClick: () => window.location.reload() },
            duration: Infinity,
          })
        }
      } catch { /* network offline */ }
    }

    const timer = setInterval(check, POLL_MS)

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        return
      }
      const hiddenDuration = hiddenAt.current ? Date.now() - hiddenAt.current : 0
      hiddenAt.current = null
      if (hiddenDuration > AUTO_RELOAD_HIDDEN_MS && !notified.current) {
        window.location.reload()
      } else {
        check()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}
