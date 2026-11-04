import { createClient } from '@supabase/supabase-js'
import { projectId, publicAnonKey } from '../../utils/supabase/info'
import type { CheckoutResult } from './types'

// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (optional, e.g. in .env.local) point the
// app at another Supabase project, such as a local one for testing.
const url = import.meta.env.VITE_SUPABASE_URL || `https://${projectId}.supabase.co`
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || publicAnonKey

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Turns database error codes into messages a shop worker understands. */
export function friendlyError(e: { code?: string; message: string } | null | undefined): string {
  if (!e) return 'Something went wrong'
  if (e.code === '23505') return 'That SKU, barcode or code is already used by another record.'
  if (e.code === '42501' || /permission denied|row-level security/i.test(e.message)) return 'Your account is not allowed to do that.'
  if (/Failed to fetch|NetworkError/i.test(e.message)) return 'No internet connection. Check the network and try again.'
  return e.message
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(friendlyError(error))
  return data as T
}

/** Records a sale. Prices, VAT and totals are calculated in the database. */
export const checkout = (args: {
  items: { product_id: number; quantity: number }[]
  customerId: number | null
  discountPct: number
  paymentMethod: string
  amountTendered: number | null
}) => rpc<CheckoutResult>('ms_checkout', {
  p_items: args.items,
  p_customer_id: args.customerId,
  p_discount_pct: args.discountPct,
  p_payment_method: args.paymentMethod,
  p_amount_tendered: args.amountTendered,
})

export const refundSale = (txnId: number, reason: string) =>
  rpc<void>('ms_refund', { p_txn_id: txnId, p_reason: reason })

export const adjustStock = (productId: number, quantity: number, mode: 'add' | 'set', reason: string) =>
  rpc<number>('ms_adjust_stock', { p_product_id: productId, p_quantity: quantity, p_mode: mode, p_reason: reason })

export const createProduct = (p: Record<string, string>) => rpc<number>('ms_create_product', { p })

export const removeProduct = (productId: number, reason: string, note: string | null) =>
  rpc<void>('ms_remove_product', { p_product_id: productId, p_reason: reason, p_note: note })

export const setStaffRole = (userId: string, role: string) =>
  rpc<void>('ms_set_staff_role', { p_user_id: userId, p_role: role })

export const setStaffName = (userId: string, name: string) =>
  rpc<void>('ms_set_staff_name', { p_user_id: userId, p_name: name })

// ── Staff logins created by the owner ───────────────────────────────────────
// A username without "@" is stored as <username>@staff.mysupermart.
export const STAFF_DOMAIN = '@staff.mysupermart'
export const loginToEmail = (login: string) => {
  const l = login.trim().toLowerCase()
  return l.includes('@') ? l : l + STAFF_DOMAIN
}
export const emailToLogin = (email: string | null | undefined) =>
  email ? (email.endsWith(STAFF_DOMAIN) ? email.slice(0, -STAFF_DOMAIN.length) : email) : ''

export const createStaff = (fullName: string, login: string, password: string, role: 'sales' | 'owner') =>
  rpc<string>('ms_create_staff', { p_full_name: fullName, p_login: login, p_password: password, p_role: role })

export const resetStaffPassword = (userId: string, password: string) =>
  rpc<void>('ms_reset_staff_password', { p_user_id: userId, p_password: password })

/** True until the first (owner) account exists. */
export async function setupNeeded(): Promise<boolean> {
  const { data, error } = await supabase.rpc('ms_setup_needed')
  return error ? true : Boolean(data)
}

/** Easy-to-read password, e.g. "mango-4821". */
export function generatePassword() {
  const words = ['mango', 'kente', 'cocoa', 'plantain', 'shea', 'baobab', 'river', 'market', 'sunrise', 'palm', 'harbor', 'yam']
  const n = new Uint32Array(2); crypto.getRandomValues(n)
  return `${words[n[0] % words.length]}-${1000 + (n[1] % 9000)}`
}
