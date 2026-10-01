import { createClient } from '@supabase/supabase-js'
import { projectId, publicAnonKey } from '../../utils/supabase/info'

export const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
)

export async function checkout(body: { txn: object; items: object[]; customer_id: number | null }): Promise<unknown> {
  const { data, error } = await supabase.rpc('ms_checkout', {
    p_txn: body.txn,
    p_items: body.items,
    p_customer_id: body.customer_id,
  })
  if (error) throw new Error(error.message)
  return data
}
