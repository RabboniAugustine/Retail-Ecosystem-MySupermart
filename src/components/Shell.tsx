import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { Icon, ICONS } from './ui'

export type NavItem = { id: string; label: string; icon: string }

export function Shell({ nav, active, onNavigate, onSync, children, roleLabel }: {
  nav: NavItem[]
  active: string
  onNavigate: (id: string) => void
  onSync: () => void
  children: React.ReactNode
  roleLabel: string
}) {
  const { profile, settings, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const current = nav.find(n => n.id === active)
  const wide = !collapsed || drawerOpen

  const go = (id: string) => { onNavigate(id); setDrawerOpen(false) }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#06080f' }}>
      {drawerOpen && <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />}

      <aside className={`shell-sidebar ${drawerOpen ? 'open' : ''}`}
        style={{ width: collapsed ? 56 : 224, flexShrink: 0, background: '#0d1120', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, background: 'linear-gradient(135deg, #00d46a, #009f50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#03120a', fontFamily: 'Roboto Slab, serif' }}>
            {(settings.shop_name || 'M').charAt(0).toUpperCase()}
          </div>
          {wide && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Roboto Slab, serif', color: '#e8ecf4', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{settings.shop_name}</div>
              <div style={{ fontSize: 9, color: '#00d46a', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>{roleLabel}</div>
            </div>
          )}
        </div>

        <nav style={{ flex: 1, padding: '10px 6px', overflowY: 'auto' }}>
          {nav.map(item => (
            <div key={item.id} className={`sidebar-link ${active === item.id ? 'active' : ''}`} onClick={() => go(item.id)} title={!wide ? item.label : undefined}>
              <span style={{ flexShrink: 0 }}><Icon d={ICONS[item.icon]} size={16} /></span>
              {wide && <span style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{item.label}</span>}
            </div>
          ))}
        </nav>

        <div style={{ padding: '10px 6px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {wide && (
            <div style={{ padding: '4px 12px 8px', minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#e8ecf4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.full_name}</div>
              <div style={{ fontSize: 11, color: '#4b5563', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.email}</div>
            </div>
          )}
          <div className="sidebar-link" onClick={signOut} title="Sign out">
            <Icon d={ICONS.logout} size={16} />
            {wide && <span style={{ whiteSpace: 'nowrap', fontSize: 13 }}>Sign out</span>}
          </div>
          <div className="sidebar-link shell-collapse" onClick={() => setCollapsed(!collapsed)} title="Toggle sidebar">
            <Icon d={collapsed ? 'M13 17l5-5-5-5M6 17l5-5-5-5' : 'M11 17l-5-5 5-5M18 17l-5-5 5-5'} size={16} />
            {wide && <span style={{ whiteSpace: 'nowrap', fontSize: 13 }}>Collapse</span>}
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <header style={{ height: 52, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', flexShrink: 0, background: '#0d1120', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <button className="shell-menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu"
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 4, alignItems: 'center' }}>
              <Icon d={ICONS.menu} size={18} />
            </button>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#e8ecf4' }}>{current?.label}</span>
          </div>
          <button onClick={onSync} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <Icon d={ICONS.refresh} size={14} /> Sync
          </button>
        </header>
        <main className="shell-content" style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {children}
        </main>
      </div>
    </div>
  )
}
