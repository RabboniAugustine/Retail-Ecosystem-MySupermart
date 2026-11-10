import { useTheme } from '../lib/theme'
import { Icon } from './ui'

const SUN = 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42'
const MOON = 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z'

export function ThemeToggle() {
  const [theme, setTheme] = useTheme()
  const next = theme === 'light' ? 'dark' : 'light'
  return (
    <button onClick={() => setTheme(next)} title={`Switch to ${next} mode`} aria-label={`Switch to ${next} mode`}
      style={{ background: 'none', border: 'none', color: 'var(--c-text-3)', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
      <Icon d={theme === 'light' ? MOON : SUN} size={14} /> {theme === 'light' ? 'Dark' : 'Light'}
    </button>
  )
}
