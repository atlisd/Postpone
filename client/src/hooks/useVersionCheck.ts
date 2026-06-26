import { useEffect, useRef } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'

const POLL_MS = 5 * 60 * 1000

export function useVersionCheck() {
  const shown = useRef(false)

  useEffect(() => {
    if (import.meta.env.DEV) return

    // Drive updates through the service-worker lifecycle. With registerType
    // 'prompt' the new worker installs but waits; updateSW(true) tells it to
    // skipWaiting and reloads the page exactly once on 'controllerchange'.
    // This replaces the old version.json poll + blind window.location.reload(),
    // which raced the SW activation and forced a double refresh (and a
    // force-close on iOS) before the new assets were actually served.
    const updateSW = registerSW({
      onNeedRefresh() {
        if (shown.current) return
        shown.current = true
        toast.info('A new version is available', {
          action: { label: 'Update', onClick: () => updateSW(true) },
          duration: Infinity,
        })
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return
        // Stale data is refreshed by SignalR's visibility-resume refetch (see
        // lib/signalr.ts onResume); here we only poll for a newer build so the
        // update toast surfaces without waiting for a navigation.
        setInterval(() => { registration.update().catch(() => {}) }, POLL_MS)
      },
    })
  }, [])
}
