import { createPortal } from 'react-dom'
import type { Settings } from '../lib/types'
import { cedi } from '../lib/format'

export type ReceiptData = {
  txnCode: string
  createdAt: string
  cashier: string | null
  customer: string | null
  lines: { name: string; qty: number; price: number }[]
  subtotal: number
  discountPct: number
  discount: number
  vatRate: number
  tax: number
  total: number
  paymentMethod: string
  tendered: number | null
  change: number | null
  pointsEarned: number
  customerPoints: number | null
  status?: string
}

function Row({ l, r, bold }: { l: string; r: string; bold?: boolean }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: bold ? 700 : 400 }}><span>{l}</span><span>{r}</span></div>
}

/** On-screen receipt (paper style) plus a hidden copy that is the only thing printed. */
export function Receipt({ data, settings }: { data: ReceiptData; settings: Settings }) {
  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: '1.25em' }}>{settings.shop_name}</div>
        {settings.address && <div>{settings.address}</div>}
        {settings.phone && <div>Tel: {settings.phone}</div>}
      </div>
      <div>{data.txnCode}{data.status === 'Refunded' ? ' — REFUNDED' : ''}</div>
      <div>{new Date(data.createdAt).toLocaleString('en-GB')}</div>
      {data.cashier && <div>Served by: {data.cashier}</div>}
      {data.customer && <div>Customer: {data.customer}</div>}
      <div style={{ borderTop: '1px dashed currentColor', margin: '6px 0' }} />
      {data.lines.map((l, i) => (
        <div key={i}>
          <div>{l.name}</div>
          <Row l={`  ${l.qty} × ${cedi(l.price)}`} r={cedi(l.qty * l.price)} />
        </div>
      ))}
      <div style={{ borderTop: '1px dashed currentColor', margin: '6px 0' }} />
      <Row l="Subtotal" r={cedi(data.subtotal)} />
      {data.discount > 0 && <Row l={`Discount (${data.discountPct}%)`} r={`−${cedi(data.discount)}`} />}
      <Row l={`VAT (${data.vatRate}%)`} r={cedi(data.tax)} />
      <Row l="TOTAL" r={cedi(data.total)} bold />
      <Row l="Paid by" r={data.paymentMethod} />
      {data.tendered != null && <Row l="Cash received" r={cedi(data.tendered)} />}
      {data.change != null && <Row l="Change" r={cedi(data.change)} />}
      {data.customer && data.pointsEarned > 0 && (
        <>
          <div style={{ borderTop: '1px dashed currentColor', margin: '6px 0' }} />
          <Row l="Points earned" r={String(data.pointsEarned)} />
          {data.customerPoints != null && <Row l="Points balance" r={String(data.customerPoints)} />}
        </>
      )}
      <div style={{ textAlign: 'center', marginTop: 8 }}>{settings.receipt_footer}</div>
    </div>
  )

  return (
    <>
      <div style={{ background: '#f8fafc', color: '#111827', borderRadius: 8, padding: 16, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, maxHeight: '55vh', overflowY: 'auto' }}>
        {body}
      </div>
      {createPortal(<div className="receipt-print">{body}</div>, document.body)}
    </>
  )
}
