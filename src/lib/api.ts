import { createClient } from '@supabase/supabase-js'
import { projectId, publicAnonKey } from '../../utils/supabase/info'

export const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
)

const EDGE = `https://${projectId}.supabase.co/functions/v1/make-server-329466e6`

export async function checkout(body: object): Promise<unknown> {
  const res = await fetch(`${EDGE}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
