import { useEffect, useState } from 'react'
import { supabase, refundSale } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Transaction } from '../lib/types'
import { Btn, ErrorBox, Field, Icon, ICONS, Modal, Spinner } from './ui'
import { PrintButton, Receipt, type ReceiptData } from './Receipt'

/** Shows a past sale as a receipt, with reprint, and refund for the owner. */
export function SaleDetail({ txnId, onClose, onChanged }: { txnId: number; onClose: () => void; onChanged?: () => void }) {
  const { profile, settings } = useAuth()
  const [txn, setTxn] = useState<Transaction | null>(null)
  const [refunding, setRefunding] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const { data } = await supabase.from('ms_transactions')
      .select('*, ms_customers(name), ms_transaction_items(*, ms_products(name, category))')
      .eq('id', txnId).single()
    setTxn(data as Transaction | null)
  }
  useEffect(() => { load() }, [txnId]) // eslint-disable-line react-hooks/exhaustive-deps

  const doRefund = async () => {
    setBusy(true); setError('')
    try {
      await refundSale(txnId, reason)
      setRefunding(false); await load(); onChanged?.()
    } catch (e) { setError(e instanceof Error ? e.message : 'Refund failed') }
    setBusy(false)
  }

  const data: ReceiptData | null = txn && {
    txnCode: txn.txn_code, createdAt: txn.created_at, cashier: txn.cashier_name, customer: txn.ms_customers?.name ?? null,
    lines: (txn.ms_transaction_items ?? []).map(i => ({ name: i.product_name ?? i.ms_products?.name ?? 'Removed product', qty: i.quantity, price: Number(i.unit_price) })),
    subtotal: Number(txn.subtotal), discountPct: Number(txn.discount_pct ?? 0),
    discount: Number(txn.discount_amount ?? (Number(txn.subtotal) * Number(txn.discount_pct ?? 0)) / 100),
    vatRate: Number(settings.vat_rate), tax: Number(txn.tax), total: Number(txn.total), paymentMethod: txn.payment_method,
    tendered: txn.amount_tendered != null ? Number(txn.amount_tendered) : null,
    change: txn.change_due != null ? Number(txn.change_due) : null,
    pointsEarned: txn.points_earned ?? 0, customerPoints: null, status: txn.status,
  }

  return (
    <Modal title={txn ? `Sale ${txn.txn_code}` : 'Sale'} onClose={onClose} width={440}>
      {!txn || !data ? <Spinner /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {txn.status === 'Refunded' && (
            <ErrorBox>Refunded {txn.refunded_at ? new Date(txn.refunded_at).toLocaleString('en-GB') : ''}{txn.refund_reason ? ` — ${txn.refund_reason}` : ''}</ErrorBox>
          )}
          <Receipt data={data} settings={settings} />
          {refunding ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid color-mix(in srgb, var(--c-danger) 25%, transparent)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--c-text-2)' }}>Items go back into stock and the customer's loyalty points are taken back. Give the customer {data.total.toFixed(2)} cedis.</div>
              <Field label="Reason *"><input autoFocus className="input-field" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. wrong item, customer returned goods" /></Field>
              <ErrorBox>{error}</ErrorBox>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Btn variant="ghost" onClick={() => setRefunding(false)}>Cancel</Btn>
                <Btn variant="danger" onClick={doRefund} disabled={busy || !reason.trim()}>{busy ? 'Refunding…' : 'Confirm refund'}</Btn>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {profile?.role === 'owner' && txn.status !== 'Refunded' && <Btn variant="danger" onClick={() => setRefunding(true)}>Refund</Btn>}
              <PrintButton />
              <Btn onClick={onClose}>Close</Btn>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
