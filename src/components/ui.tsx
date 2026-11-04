import type React from 'react'

// ── Icons ──────────────────────────────────────────────────────────────────

export const Icon = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

export const ICONS: Record<string, string> = {
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  pos: 'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM8 10h8M8 14h5',
  inventory: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z',
  accounting: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  reports: 'M18 20V10M12 20V4M6 20v-6',
  crm: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  suppliers: 'M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5 21a2 2 0 100-4 2 2 0 000 4zM19 21a2 2 0 100-4 2 2 0 000 4z',
  alert: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0',
  trending: 'M23 6l-9.5 9.5-5-5L1 18',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15',
  trash: 'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2',
  edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  chevronDown: 'M6 9l6 6 6-6',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  staff: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  monitor: 'M2 3h20v14H2zM8 21h8M12 17v4',
  receipt: 'M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .67V2l-1 .67L16 1l-3 2-3-2-3 2-3-2zM8 7h8M8 11h8M8 15h5',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z',
  history: 'M3 3v5h5M3.05 13A9 9 0 106 5.3L3 8M12 7v5l4 2',
  home: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10',
  menu: 'M3 12h18M3 6h18M3 18h18',
}

export const CATEGORY_COLORS: Record<string, string> = {
  Dairy: '#3b82f6', Bakery: '#f59e0b', Beverages: '#a855f7',
  Produce: '#00d46a', Grains: '#06b6d4', Oils: '#ef4444', Meat: '#f43f5e', Frozen: '#38bdf8',
  Household: '#94a3b8', Toiletries: '#ec4899', Snacks: '#f97316', Default: '#9ca3af'
}

export const TS = {
  backgroundColor: '#0d1120',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: '#e8ecf4', fontSize: 12,
}

// ── Primitives ─────────────────────────────────────────────────────────────

export function StatCard({ label, value, sub, trend, color = '#00d46a', icon }: {
  label: string; value: string; sub?: string; trend?: string; color?: string; icon: string
}) {
  const up = trend?.startsWith('+')
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={ICONS[icon]} size={17} />
        </div>
        {trend && (
          <span style={{ fontSize: 11, fontWeight: 600, color: up ? '#00d46a' : '#ef4444', background: up ? 'rgba(0,212,106,0.1)' : 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: 4 }}>
            {trend}
          </span>
        )}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Roboto Slab, serif', color: '#e8ecf4', letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#4b5563', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#6b7280', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 26, height: 26, border: '2.5px solid rgba(0,212,106,0.15)', borderTopColor: '#00d46a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export function EmptyState({ title, sub, action }: { icon?: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: '#4b5563', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid #374151', marginBottom: 6 }} />
      <div style={{ fontSize: 14, fontWeight: 600, color: '#9ca3af' }}>{title}</div>
      {sub && <div style={{ fontSize: 13 }}>{sub}</div>}
      {action}
    </div>
  )
}

export function Modal({ title, onClose, children, width = 520 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#0d1120', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, width: `min(${width}px, calc(100vw - 24px))`, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 17, fontWeight: 700, margin: 0, color: '#e8ecf4' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex' }}>
            <Icon d={ICONS.x} size={18} />
          </button>
        </div>
        <div style={{ padding: '20px 24px' }}>{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
    </div>
  )
}

export function Btn({ children, onClick, variant = 'primary', type = 'button', disabled }: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger'
  type?: 'button' | 'submit'; disabled?: boolean
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: '#00d46a', color: '#03120a', border: 'none' },
    ghost: { background: 'rgba(255,255,255,0.06)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' },
    danger: { background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...styles[variant], borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s' }}>
      {children}
    </button>
  )
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
      <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 15, fontWeight: 600, margin: 0, color: '#e8ecf4' }}>{children}</h3>
      {right}
    </div>
  )
}

export function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th style={{ textAlign: right ? 'right' : 'left', padding: '7px 10px', fontSize: 10, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{children}</th>
}

export function Td({ children, mono, strong, muted, right, style }: {
  children?: React.ReactNode; mono?: boolean; strong?: boolean; muted?: boolean; right?: boolean; style?: React.CSSProperties
}) {
  return (
    <td style={{
      padding: '10px 10px', fontSize: mono ? 12 : 13, textAlign: right ? 'right' : 'left',
      fontFamily: mono ? 'JetBrains Mono, monospace' : undefined, fontWeight: strong ? 600 : 400,
      color: strong ? '#e8ecf4' : muted ? '#6b7280' : '#9ca3af', whiteSpace: 'nowrap', ...style,
    }}>{children}</td>
  )
}

/** Recharts tooltip formatter for cedi values. */
export const cediTip = (label: string) => (v: unknown) => [`₵${Number(v ?? 0).toFixed(2)}`, label] as [string, string]

export const statusBadge = (status: string) =>
  status === 'Refunded' ? 'badge badge-red' : status === 'Completed' ? 'badge badge-green' : 'badge badge-yellow'
