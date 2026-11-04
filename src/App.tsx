import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { Shell, type NavItem } from './components/Shell'
import { Spinner } from './components/ui'
import { Login, Waiting } from './pages/Login'
import { CustomerDisplay } from './pages/CustomerDisplay'
import { Dashboard } from './pages/Dashboard'
import { SalesHome } from './pages/SalesHome'
import { POS } from './pages/POS'
import { Inventory } from './pages/Inventory'
import { SalesHistory } from './pages/SalesHistory'
import { Accounting } from './pages/Accounting'
import { Reports } from './pages/Reports'
import { Customers } from './pages/Customers'
import { Suppliers } from './pages/Suppliers'
import { Staff } from './pages/Staff'
import { SettingsPage } from './pages/Settings'

// ── Owner: everything ─────────────────────────────────────────────────────
const OWNER_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'pos', label: 'Point of Sale', icon: 'pos' },
  { id: 'sales', label: 'Sales & Refunds', icon: 'receipt' },
  { id: 'inventory', label: 'Inventory', icon: 'inventory' },
  { id: 'accounting', label: 'Accounting', icon: 'accounting' },
  { id: 'reports', label: 'Reports', icon: 'reports' },
  { id: 'customers', label: 'Customers', icon: 'crm' },
  { id: 'suppliers', label: 'Suppliers', icon: 'suppliers' },
  { id: 'staff', label: 'Staff', icon: 'staff' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

function OwnerApp() {
  const [active, setActive] = useState('dashboard')
  const [refresh, setRefresh] = useState(0)
  const { reloadSettings } = useAuth()
  const r = { refresh }
  const page = (() => {
    switch (active) {
      case 'pos': return <POS onSaleComplete={() => setRefresh(n => n + 1)} />
      case 'sales': return <SalesHistory {...r} />
      case 'inventory': return <Inventory {...r} />
      case 'accounting': return <Accounting {...r} />
      case 'reports': return <Reports {...r} />
      case 'customers': return <Customers {...r} />
      case 'suppliers': return <Suppliers {...r} />
      case 'staff': return <Staff {...r} />
      case 'settings': return <SettingsPage key={refresh} />
      default: return <Dashboard {...r} />
    }
  })()
  return (
    <Shell nav={OWNER_NAV} active={active} onNavigate={setActive} roleLabel="Owner" onSync={() => { reloadSettings(); setRefresh(n => n + 1) }}>
      {page}
    </Shell>
  )
}

// ── Salesperson: till, stock and customers. No money reports. ─────────────
const SALES_NAV: NavItem[] = [
  { id: 'home', label: 'My Shift', icon: 'home' },
  { id: 'pos', label: 'Point of Sale', icon: 'pos' },
  { id: 'inventory', label: 'Stock', icon: 'inventory' },
  { id: 'customers', label: 'Customers', icon: 'crm' },
]

function SalesApp() {
  const [active, setActive] = useState('pos')
  const [refresh, setRefresh] = useState(0)
  const { reloadSettings } = useAuth()
  const r = { refresh }
  const page = (() => {
    switch (active) {
      case 'home': return <SalesHome {...r} onStartSelling={() => setActive('pos')} />
      case 'inventory': return <Inventory {...r} />
      case 'customers': return <Customers {...r} />
      default: return <POS onSaleComplete={() => setRefresh(n => n + 1)} />
    }
  })()
  return (
    <Shell nav={SALES_NAV} active={active} onNavigate={setActive} roleLabel="Salesperson" onSync={() => { reloadSettings(); setRefresh(n => n + 1) }}>
      {page}
    </Shell>
  )
}

function Gate() {
  const { session, profile, loading, setupError } = useAuth()
  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>
  if (!session) return <Login />
  if (setupError) return <Waiting kind="setup" />
  if (!profile) return <Waiting kind="noprofile" />
  if (profile.role === 'pending') return <Waiting kind="pending" />
  if (profile.role === 'disabled') return <Waiting kind="disabled" />
  return profile.role === 'owner' ? <OwnerApp /> : <SalesApp />
}

export default function App() {
  // The customer-facing screen runs in its own window with no login.
  if (window.location.pathname.replace(/\/+$/, '') === '/display') return <CustomerDisplay />
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
