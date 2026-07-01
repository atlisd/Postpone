import { useEffect, useRef } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'

const POLL_MS = 5 * 60 * 1000

// Fetch the deployed build id from /version.json (emitted by buildIdPlugin in
// vite.config.ts). Returns null if it can't be read, in which case we treat the
// update as unconfirmed and stay quiet — a real update will be confirmed on a
// later poll rather than risk a false "update available" prompt.
async function fetchDeployedVersion(): Promise<string | null> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    return typeof data.version === 'string' ? data.version : null
  } catch {
    return null
  }
}

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
      async onNeedRefresh() {
        if (shown.current) return

        // iOS Safari fires spurious SW-update events for byte-identical builds
        // (it evicts and re-installs the worker under storage pressure), which
        // showed as "update available" when nothing had actually shipped. Only
        // prompt once we've confirmed the deployed build id differs from the
        // one baked into the running bundle. version.json still merely *gates*
        // the toast — the actual update is applied through the SW lifecycle, so
        // there's no reintroduced double-refresh race.
        const deployed = await fetchDeployedVersion()
        if (deployed === null || deployed === __APP_VERSION__) return

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
