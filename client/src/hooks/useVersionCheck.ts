import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

const POLL_MS = 5 * 60 * 1000

export function useVersionCheck() {
  const notified = useRef(false)

  useEffect(() => {
    if (import.meta.env.DEV) return

    async function check() {
      if (notified.current) return
      try {
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
        if (!res.ok) return
        const { buildTime } = await res.json()
        if (buildTime !== __BUILD_TIME__) {
          notified.current = true
          toast.info('A new version is available', {
            action: { label: 'Update', onClick: () => window.location.reload() },
            duration: Infinity,
          })
        }
      } catch { /* network offline */ }
    }

    const timer = setInterval(check, POLL_MS)

    // Stale data is refreshed by SignalR's visibility-resume refetch (see
    // lib/signalr.ts onResume); here we only re-check the build version so the
    // update toast appears promptly when returning to a backgrounded tab.
    function onVisibility() {
      if (document.visibilityState === 'visible') check()
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}
