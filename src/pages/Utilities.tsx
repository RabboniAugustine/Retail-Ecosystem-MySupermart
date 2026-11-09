import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, fetchAll, importItems, bulkUpdateItems, type RowError } from '../lib/api'
import { cedi, localDate } from '../lib/format'
import { ITEM_COLUMNS, downloadTemplate, exportItems, readItemsFile, type ExportItem, type ItemField, type ParsedFile, type ParsedRow } from '../lib/itemsFile'
import type { InventoryRow } from '../lib/types'
import { Btn, ErrorBox, Field, Icon, ICONS, SectionTitle, Spinner, StatCard, Th, Td } from '../components/ui'

type Tool = 'import' | 'bulk' | 'export'

async function loadItems(): Promise<InventoryRow[]> {
  const rows = await fetchAll<InventoryRow>((a, b) => supabase.from('ms_inventory')
    .select('*, ms_products!inner(id, name, sku, barcode, category, price, cost, active)').eq('ms_products.active', true).order('id').range(a, b))
  return rows.sort((x, y) => x.ms_products.name.localeCompare(y.ms_products.name))
}

const toExport = (r: InventoryRow): ExportItem => ({
  name: r.ms_products.name, sku: r.ms_products.sku, barcode: r.ms_products.barcode, category: r.ms_products.category,
  cost: Number(r.ms_products.cost), price: Number(r.ms_products.price), stock: r.stock, reorder_level: r.reorder_level,
  supplier: r.supplier, expiry_date: r.expiry_date,
})

export function Utilities({ refresh }: { refresh: number }) {
  const [tool, setTool] = useState<Tool>('import')
  const [items, setItems] = useState<InventoryRow[] | null>(null)
  const [reload, setReload] = useState(0)

  // Keep showing the current tool (and its results) while the item list reloads.
  useEffect(() => { loadItems().then(setItems).catch(() => setItems(prev => prev ?? [])) }, [refresh, reload])

  const tools: { id: Tool; label: string; text: string }[] = [
    { id: 'import', label: 'Import items', text: 'Add many new items at once from an Excel or CSV file.' },
    { id: 'bulk', label: 'Update items in bulk', text: 'Change prices, costs, stock counts and details for many items.' },
    { id: 'export', label: 'Export items', text: 'Download all items with prices and stock to Excel or CSV.' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="g3">
        {tools.map(t => (
          <button key={t.id} onClick={() => setTool(t.id)} className="stat-card"
            style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', borderColor: tool === t.id ? 'rgba(0,212,106,0.45)' : undefined, background: tool === t.id ? 'rgba(0,212,106,0.05)' : undefined }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: tool === t.id ? '#00d46a' : '#e8ecf4', marginBottom: 4 }}>{t.label}</div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{t.text}</div>
          </button>
        ))}
      </div>
      {items == null ? <Spinner /> : (
        <>
          {tool === 'import' && <ImportTool items={items} onDone={() => setReload(n => n + 1)} />}
          {tool === 'bulk' && <BulkTool items={items} onDone={() => setReload(n => n + 1)} />}
          {tool === 'export' && <ExportTool items={items} />}
        </>
      )}
    </div>
  )
}

function FilePicker({ onFile, busy }: { onFile: (f: File) => void; busy: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  return (
    <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
      onClick={() => ref.current?.click()}
      style={{ border: `1.5px dashed ${drag ? '#00d46a' : 'rgba(255,255,255,0.14)'}`, borderRadius: 10, padding: '26px 16px', textAlign: 'center', cursor: 'pointer', background: drag ? 'rgba(0,212,106,0.05)' : 'transparent' }}>
      <input ref={ref} type="file" accept=".xlsx,.csv,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <div style={{ fontSize: 14, color: '#e8ecf4', fontWeight: 600 }}>{busy ? 'Reading file…' : 'Choose a file or drop it here'}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Excel (.xlsx) or CSV</div>
    </div>
  )
}

function Results({ ok, okLabel, errors }: { ok: number; okLabel: string; errors: RowError[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(0,212,106,0.08)', border: '1px solid rgba(0,212,106,0.25)', color: '#00d46a', fontSize: 13 }}>
        {ok} {okLabel}{errors.length ? `, ${errors.length} skipped` : ''}.
      </div>
      {errors.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><Th>File row</Th><Th>Item</Th><Th>Why it was skipped</Th></tr></thead>
            <tbody>{errors.map((e, i) => <tr key={i}><Td mono>{e.row}</Td><Td strong>{e.name || '—'}</Td><Td style={{ color: '#f87171', whiteSpace: 'normal' }}>{e.error}</Td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const validDate = (s?: string) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(`${s}T00:00:00`).getTime())
const validNum = (s?: string) => !s || (!isNaN(Number(s)) && Number(s) >= 0)

// ── Import ───────────────────────────────────────────────────────────────────
function ImportTool({ items, onDone }: { items: InventoryRow[]; onDone: () => void }) {
  const [file, setFile] = useState<ParsedFile | null>(null)
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ created: number; errors: RowError[] } | null>(null)

  const existingSku = useMemo(() => new Set(items.map(i => i.ms_products.sku?.toLowerCase()).filter(Boolean) as string[]), [items])
  const existingBarcode = useMemo(() => new Set(items.map(i => i.ms_products.barcode).filter(Boolean) as string[]), [items])

  const checked = useMemo(() => {
    if (!file) return []
    const seenSku = new Set<string>(), seenBc = new Set<string>()
    return file.rows.map(r => {
      let problem = ''
      const sku = r.sku?.toLowerCase()
      if (!r.name) problem = 'Name is missing'
      else if (!r.price) problem = 'Selling price is missing'
      else if (!validNum(r.price) || !validNum(r.cost) || !validNum(r.stock) || !validNum(r.reorder_level)) problem = 'A number is not valid'
      else if (!validDate(r.expiry_date)) problem = `Expiry date "${r.expiry_date}" is not a date`
      else if (sku && existingSku.has(sku)) problem = 'Already in the shop (same SKU). Use Update items in bulk'
      else if (r.barcode && existingBarcode.has(r.barcode)) problem = 'Already in the shop (same barcode). Use Update items in bulk'
      else if (sku && seenSku.has(sku)) problem = 'SKU appears twice in the file'
      else if (r.barcode && seenBc.has(r.barcode)) problem = 'Barcode appears twice in the file'
      if (sku) seenSku.add(sku)
      if (r.barcode) seenBc.add(r.barcode)
      return { row: r, problem }
    })
  }, [file, existingSku, existingBarcode])

  const good = checked.filter(c => !c.problem)

  const onFile = async (f: File) => {
    setReading(true); setError(''); setResult(null); setFile(null)
    try {
      const parsed = await readItemsFile(f)
      if (!parsed.fields.includes('name')) throw new Error('The file needs a "Name" column. Download the template to see the expected columns.')
      setFile(parsed); setFileName(f.name)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read the file') }
    setReading(false)
  }

  const run = async () => {
    setBusy(true); setError('')
    try {
      const rows = good.map(c => ({ ...c.row }))
      const res: { created: number; errors: RowError[] } = { created: 0, errors: [] }
      for (let i = 0; i < rows.length; i += 500) {
        const r = await importItems(rows.slice(i, i + 500))
        res.created += r.created; res.errors.push(...r.errors)
      }
      setResult(res); setFile(null); onDone()
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed') }
    setBusy(false)
  }

  return (
    <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionTitle right={<div style={{ display: 'flex', gap: 6 }}>
        <Btn variant="ghost" onClick={() => downloadTemplate('xlsx')}><Icon d={ICONS.download} size={14} /> Excel template</Btn>
        <Btn variant="ghost" onClick={() => downloadTemplate('csv')}><Icon d={ICONS.download} size={14} /> CSV template</Btn>
      </div>}>Import new items</SectionTitle>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#9ca3af', lineHeight: 1.8 }}>
        <li>Download the template and fill one item per row. <b style={{ color: '#e8ecf4' }}>Name</b> and <b style={{ color: '#e8ecf4' }}>Selling price</b> are required.</li>
        <li>Upload the file and check the preview. Items that already exist (same SKU or barcode) are skipped.</li>
        <li>Click Import. Opening stock is added to the stock log.</li>
      </ol>
      <FilePicker onFile={onFile} busy={reading} />
      <ErrorBox>{error}</ErrorBox>
      {result && <Results ok={result.created} okLabel="items imported" errors={result.errors} />}
      {file && (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: '#9ca3af' }}>
            <span><b style={{ color: '#e8ecf4' }}>{fileName}</b></span>
            <span>{file.rows.length} rows</span>
            <span style={{ color: '#00d46a' }}>{good.length} ready to import</span>
            {checked.length - good.length > 0 && <span style={{ color: '#f59e0b' }}>{checked.length - good.length} will be skipped</span>}
            {file.unknownHeaders.length > 0 && <span>Ignored columns: {file.unknownHeaders.join(', ')}</span>}
          </div>
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table>
              <thead><tr><Th>Row</Th><Th>Name</Th><Th>SKU</Th><Th>Category</Th><Th right>Cost</Th><Th right>Price</Th><Th right>Stock</Th><Th>Check</Th></tr></thead>
              <tbody>
                {checked.map(({ row, problem }) => (
                  <tr key={row._row} className="table-row">
                    <Td mono muted>{row._row}</Td>
                    <Td strong style={{ whiteSpace: 'normal' }}>{row.name || '—'}</Td>
                    <Td mono>{row.sku || '—'}</Td>
                    <Td>{row.category || 'Other'}</Td>
                    <Td mono right>{row.cost ? cedi(row.cost) : '—'}</Td>
                    <Td mono right>{row.price ? cedi(row.price) : '—'}</Td>
                    <Td mono right>{row.stock || '0'}</Td>
                    <Td style={{ whiteSpace: 'normal', color: problem ? '#f59e0b' : '#00d46a' }}>{problem || 'New item'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="ghost" onClick={() => setFile(null)}>Cancel</Btn>
            <Btn onClick={run} disabled={busy || good.length === 0}>{busy ? 'Importing…' : `Import ${good.length} items`}</Btn>
          </div>
        </>
      )}
    </div>
  )
}

// ── Bulk update ──────────────────────────────────────────────────────────────
type Change = { field: ItemField; from: string; to: string }
type Planned = { row: ParsedRow | null; item: InventoryRow | null; changes: Change[]; problem: string }

const currentValue = (i: InventoryRow, f: ItemField): string => {
  const p = i.ms_products
  switch (f) {
    case 'name': return p.name
    case 'sku': return p.sku ?? ''
    case 'barcode': return p.barcode ?? ''
    case 'category': return p.category
    case 'cost': return String(Number(p.cost))
    case 'price': return String(Number(p.price))
    case 'stock': return String(i.stock)
    case 'reorder_level': return String(i.reorder_level)
    case 'supplier': return i.supplier ?? ''
    case 'expiry_date': return i.expiry_date ?? ''
  }
}
const same = (f: ItemField, a: string, b: string) => ['cost', 'price', 'stock', 'reorder_level'].includes(f) ? Number(a) === Number(b) : a.trim() === b.trim()
const labelOf = (f: ItemField) => ITEM_COLUMNS.find(c => c.field === f)!.label.replace(' (YYYY-MM-DD)', '')

function BulkTool({ items, onDone }: { items: InventoryRow[]; onDone: () => void }) {
  const [mode, setMode] = useState<'file' | 'percent'>('file')
  const [plan, setPlan] = useState<Planned[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [includeStock, setIncludeStock] = useState(true)
  const [reason, setReason] = useState(`Stock take ${localDate()}`)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ updated: number; errors: RowError[] } | null>(null)
  // percent mode
  const [cat, setCat] = useState('All')
  const [pct, setPct] = useState('')
  const [target, setTarget] = useState<'price' | 'cost'>('price')
  const [roundTo, setRoundTo] = useState('0.5')

  const bySku = useMemo(() => new Map(items.filter(i => i.ms_products.sku).map(i => [i.ms_products.sku!.toLowerCase(), i])), [items])
  const byBc = useMemo(() => new Map(items.filter(i => i.ms_products.barcode).map(i => [i.ms_products.barcode!, i])), [items])
  const byName = useMemo(() => new Map(items.map(i => [i.ms_products.name.trim().toLowerCase(), i])), [items])

  const onFile = async (f: File) => {
    setReading(true); setError(''); setResult(null); setPlan(null)
    try {
      const parsed = await readItemsFile(f)
      if (!parsed.fields.some(x => x === 'sku' || x === 'barcode' || x === 'name')) throw new Error('The file needs a SKU, Barcode or Name column to find each item.')
      const used = new Set<number>()
      const planned: Planned[] = parsed.rows.map(r => {
        const item = (r.sku && bySku.get(r.sku.toLowerCase())) || (r.barcode && byBc.get(r.barcode)) || (r.name && byName.get(r.name.trim().toLowerCase())) || null
        if (!item) return { row: r, item: null, changes: [], problem: 'No matching item (check SKU, barcode or name)' }
        if (used.has(item.product_id)) return { row: r, item, changes: [], problem: 'This item appears twice in the file' }
        used.add(item.product_id)
        if (!validNum(r.price) || !validNum(r.cost) || !validNum(r.stock) || !validNum(r.reorder_level)) return { row: r, item, changes: [], problem: 'A number is not valid' }
        if (!validDate(r.expiry_date)) return { row: r, item, changes: [], problem: `Expiry date "${r.expiry_date}" is not a date` }
        const changes: Change[] = []
        for (const f of parsed.fields) {
          const v = r[f]
          if (v == null || v === '') continue // empty cell = leave unchanged
          const cur = currentValue(item, f)
          if (!same(f, cur, v)) changes.push({ field: f, from: cur, to: v })
        }
        return { row: r, item, changes, problem: '' }
      })
      setPlan(planned); setFileName(f.name)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read the file') }
    setReading(false)
  }

  const previewPercent = () => {
    setResult(null); setError('')
    const p = Number(pct)
    if (!pct || isNaN(p) || p === 0 || p <= -100) { setError('Enter a percentage, e.g. 10 to increase or -5 to decrease.'); return }
    const step = Number(roundTo)
    const planned: Planned[] = items.filter(i => cat === 'All' || i.ms_products.category === cat).map(i => {
      const cur = Number(target === 'price' ? i.ms_products.price : i.ms_products.cost)
      let next = cur * (1 + p / 100)
      next = step > 0 ? Math.round(next / step) * step : Math.round(next * 100) / 100
      next = Math.round(next * 100) / 100
      return { row: null, item: i, changes: same(target, String(cur), String(next)) ? [] : [{ field: target, from: String(cur), to: next.toFixed(2) }], problem: '' }
    })
    setPlan(planned); setFileName('')
  }

  const effective = (p: Planned) => p.changes.filter(c => includeStock || c.field !== 'stock')
  const toApply = (plan ?? []).filter(p => !p.problem && p.item && effective(p).length > 0)
  const hasStock = (plan ?? []).some(p => p.changes.some(c => c.field === 'stock'))

  const apply = async () => {
    if (!window.confirm(`Update ${toApply.length} items?`)) return
    setBusy(true); setError('')
    try {
      const rows = toApply.map(p => {
        const o: Record<string, unknown> = { product_id: p.item!.product_id, _row: p.row?._row }
        effective(p).forEach(c => { o[c.field] = c.to })
        return o
      })
      const res: { updated: number; errors: RowError[] } = { updated: 0, errors: [] }
      for (let i = 0; i < rows.length; i += 500) {
        const r = await bulkUpdateItems(rows.slice(i, i + 500), reason)
        res.updated += r.updated; res.errors.push(...r.errors)
      }
      setResult(res); setPlan(null); onDone()
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed') }
    setBusy(false)
  }

  const fmt = (f: ItemField, v: string) => (f === 'price' || f === 'cost') && v !== '' ? cedi(v) : v || '—'
  const cats = ['All', ...Array.from(new Set(items.map(i => i.ms_products.category))).sort()]

  return (
    <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionTitle>Update items in bulk</SectionTitle>
      <div style={{ display: 'flex', gap: 4, background: '#06080f', padding: 4, borderRadius: 8, maxWidth: 460 }}>
        {([['file', 'From a file'], ['percent', 'Change prices by %']] as const).map(([k, l]) => (
          <button key={k} className="tab-btn" onClick={() => { setMode(k); setPlan(null); setResult(null); setError('') }}
            style={{ flex: 1, background: mode === k ? 'rgba(0,212,106,0.12)' : 'transparent', color: mode === k ? '#00d46a' : '#6b7280' }}>{l}</button>
        ))}
      </div>

      {mode === 'file' ? (
        <>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#9ca3af', lineHeight: 1.8 }}>
            <li>Go to <b style={{ color: '#e8ecf4' }}>Export items</b> and download the Excel file.</li>
            <li>Change the prices, costs, stock counts or details you need. Leave a cell empty to keep it as it is.</li>
            <li>Upload it here. Items are found by SKU, then barcode, then name. Check the changes, then apply.</li>
          </ol>
          <FilePicker onFile={onFile} busy={reading} />
        </>
      ) : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Category"><select className="input-field" value={cat} onChange={e => setCat(e.target.value)} style={{ width: 170 }}>{cats.map(c => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Change"><select className="input-field" value={target} onChange={e => setTarget(e.target.value as 'price' | 'cost')} style={{ width: 150 }}><option value="price">Selling price</option><option value="cost">Cost price</option></select></Field>
          <Field label="By % (minus to reduce)"><input className="input-field" type="number" step="0.5" value={pct} onChange={e => setPct(e.target.value)} placeholder="e.g. 10" style={{ width: 130 }} /></Field>
          <Field label="Round to"><select className="input-field" value={roundTo} onChange={e => setRoundTo(e.target.value)} style={{ width: 130 }}>
            <option value="0">Nearest pesewa</option><option value="0.1">₵0.10</option><option value="0.5">₵0.50</option><option value="1">₵1.00</option>
          </select></Field>
          <Btn onClick={previewPercent}>Preview</Btn>
        </div>
      )}

      <ErrorBox>{error}</ErrorBox>
      {result && <Results ok={result.updated} okLabel="items updated" errors={result.errors} />}

      {plan && (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: '#9ca3af', alignItems: 'center' }}>
            {fileName && <b style={{ color: '#e8ecf4' }}>{fileName}</b>}
            <span style={{ color: '#00d46a' }}>{toApply.length} items will change</span>
            <span>{plan.filter(p => !p.problem && effective(p).length === 0).length} unchanged</span>
            {plan.some(p => p.problem) && <span style={{ color: '#f59e0b' }}>{plan.filter(p => p.problem).length} rows skipped</span>}
          </div>
          {hasStock && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: 12, borderRadius: 8, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.05)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e8ecf4', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeStock} onChange={e => setIncludeStock(e.target.checked)} style={{ accentColor: '#00d46a', width: 16, height: 16 }} />
                Also set stock to the counts in the file
              </label>
              {includeStock && <input className="input-field" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for the stock log" style={{ maxWidth: 260, padding: '6px 10px' }} />}
            </div>
          )}
          <div className="table-wrap" style={{ maxHeight: 440, overflowY: 'auto' }}>
            <table>
              <thead><tr>{fileName && <Th>Row</Th>}<Th>Item</Th><Th>Changes</Th></tr></thead>
              <tbody>
                {plan.filter(p => p.problem || effective(p).length > 0).map((p, i) => (
                  <tr key={i} className="table-row">
                    {fileName && <Td mono muted>{p.row?._row}</Td>}
                    <Td strong style={{ whiteSpace: 'normal' }}>{p.item?.ms_products.name ?? p.row?.name ?? p.row?.sku ?? '—'}</Td>
                    <Td style={{ whiteSpace: 'normal' }}>
                      {p.problem ? <span style={{ color: '#f59e0b' }}>{p.problem}</span> : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                          {effective(p).map(c => (
                            <span key={c.field} style={{ fontSize: 12 }}>
                              <span style={{ color: '#6b7280' }}>{labelOf(c.field)}</span>{' '}
                              <span style={{ color: '#9ca3af', textDecoration: 'line-through' }}>{fmt(c.field, c.from)}</span>{' → '}
                              <span style={{ color: '#00d46a', fontWeight: 600 }}>{fmt(c.field, c.to)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="ghost" onClick={() => setPlan(null)}>Cancel</Btn>
            <Btn onClick={apply} disabled={busy || toApply.length === 0}>{busy ? 'Updating…' : `Apply changes to ${toApply.length} items`}</Btn>
          </div>
        </>
      )}
    </div>
  )
}

// ── Export ───────────────────────────────────────────────────────────────────
function ExportTool({ items }: { items: InventoryRow[] }) {
  const [cat, setCat] = useState('All')
  const [busy, setBusy] = useState(false)
  const cats = ['All', ...Array.from(new Set(items.map(i => i.ms_products.category))).sort()]
  const chosen = items.filter(i => cat === 'All' || i.ms_products.category === cat)
  const run = async (format: 'xlsx' | 'csv') => {
    setBusy(true)
    try { await exportItems(chosen.map(toExport), format, `items_${cat === 'All' ? 'all' : cat.toLowerCase()}_${localDate()}`) } finally { setBusy(false) }
  }
  return (
    <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionTitle>Export items</SectionTitle>
      <div className="g3">
        <StatCard label="Items" value={chosen.length.toLocaleString()} icon="inventory" color="#3b82f6" />
        <StatCard label="Units in stock" value={chosen.reduce((s, i) => s + i.stock, 0).toLocaleString()} icon="inventory" color="#00d46a" />
        <StatCard label="Value at cost" value={cedi(chosen.reduce((s, i) => s + i.stock * Number(i.ms_products.cost), 0))} icon="accounting" color="#a855f7" />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Category"><select className="input-field" value={cat} onChange={e => setCat(e.target.value)} style={{ width: 200 }}>{cats.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Btn onClick={() => run('xlsx')} disabled={busy || !chosen.length}><Icon d={ICONS.download} size={14} /> Download Excel</Btn>
        <Btn variant="ghost" onClick={() => run('csv')} disabled={busy || !chosen.length}><Icon d={ICONS.download} size={14} /> Download CSV</Btn>
      </div>
      <div style={{ fontSize: 12, color: '#6b7280' }}>Columns: {ITEM_COLUMNS.map(c => c.label).join(', ')}. The same file can be edited and uploaded in Update items in bulk.</div>
    </div>
  )
}
