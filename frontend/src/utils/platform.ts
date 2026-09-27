import { useEffect, useState } from 'react'
import { Environment } from '../../wailsjs/runtime/runtime'

export type Platform = 'darwin' | 'linux' | 'windows' | 'unknown'

let cached: Promise<Platform> | null = null

function normalize(p: string): Platform {
  if (p === 'darwin' || p === 'linux' || p === 'windows') return p
  return 'unknown'
}

// Resolved once from the Wails runtime. This is the only platform check in the frontend.
export function getPlatform(): Promise<Platform> {
  if (!cached) {
    cached = Environment()
      .then(env => normalize(env.platform))
      .catch(() => 'unknown' as Platform)
  }
  return cached
}

// Returns 'unknown' until the runtime answers, and sets data-platform on <html>.
export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>('unknown')
  useEffect(() => {
    let alive = true
    getPlatform().then(p => {
      document.documentElement.dataset.platform = p
      if (alive) setPlatform(p)
    })
    return () => { alive = false }
  }, [])
  return platform
}
