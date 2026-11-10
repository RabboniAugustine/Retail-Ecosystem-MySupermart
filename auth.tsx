import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './api'
import type { Profile, Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  id: 1, shop_name: 'My Supermart', address: null, phone: null, vat_rate: 12.5,
  max_discount_pct: 10, block_oversell: true,
  display_message: 'Welcome! Thank you for shopping with us.',
  receipt_footer: 'Thank you for shopping with us!',
}

type AuthState = {
  session: Session | null
  profile: Profile | null
  settings: Settings
  loading: boolean
  /** Set when the database is not set up yet (migrations not run). */
  setupError: string | null
  reloadProfile: () => Promise<void>
  reloadSettings: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [setupError, setSetupError] = useState<string | null>(null)

  const reloadSettings = useCallback(async () => {
    const { data } = await supabase.from('ms_settings').select('*').eq('id', 1).maybeSingle()
    if (data) setSettings({ ...DEFAULT_SETTINGS, ...data, vat_rate: Number(data.vat_rate), max_discount_pct: Number(data.max_discount_pct) })
  }, [])

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); return }
    const { data, error } = await supabase.from('ms_profiles').select('*').eq('id', s.user.id).maybeSingle()
    if (error && /ms_profiles|does not exist|schema cache/i.test(error.message)) {
      setSetupError('The database is not set up yet. Run the SQL files in supabase/migrations (see README).')
    } else {
      setSetupError(null)
    }
    setProfile((data as Profile | null) ?? null)
    if (data) await reloadSettings()
  }, [reloadSettings])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // Token refreshes do not change who is signed in, so skip the reload.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(() => { loadProfile(s) }, 0)
      }
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  const value: AuthState = {
    session, profile, settings, loading, setupError,
    reloadProfile: () => loadProfile(session),
    reloadSettings,
    signOut: async () => { await supabase.auth.signOut(); setProfile(null) },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
