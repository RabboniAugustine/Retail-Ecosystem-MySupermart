// Light (black, white, red) or dark theme. Remembered on each computer.
import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'mysupermart-theme'

export function getTheme(): Theme {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#ffffff' : '#06080f')
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t) } catch { /* storage unavailable */ }
  applyTheme(t)
  window.dispatchEvent(new CustomEvent('mysupermart-theme', { detail: t }))
}

/** Current theme; updates when it changes here or in another window (e.g. the customer display). */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>(getTheme())
  useEffect(() => {
    const onLocal = (e: Event) => set((e as CustomEvent<Theme>).detail)
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) { const t = getTheme(); applyTheme(t); set(t) } }
    window.addEventListener('mysupermart-theme', onLocal)
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener('mysupermart-theme', onLocal); window.removeEventListener('storage', onStorage) }
  }, [])
  return [theme, setTheme]
}
