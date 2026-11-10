import { PRESETS, presetRange, type Preset, type Range } from '../lib/ranges'

export function RangePicker({ preset, range, onChange }: {
  preset: Preset; range: Range; onChange: (preset: Preset, range: Range) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <select className="input-field" value={preset} style={{ width: 'auto', padding: '7px 10px' }}
        onChange={e => { const p = e.target.value as Preset; onChange(p, presetRange(p, range)) }}>
        {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <input className="input-field" type="date" value={range.from} max={range.to} style={{ width: 150, padding: '7px 10px' }}
        onChange={e => e.target.value && onChange('custom', { ...range, from: e.target.value })} />
      <span style={{ color: 'var(--c-text-4)', fontSize: 12 }}>to</span>
      <input className="input-field" type="date" value={range.to} min={range.from} style={{ width: 150, padding: '7px 10px' }}
        onChange={e => e.target.value && onChange('custom', { ...range, to: e.target.value })} />
    </div>
  )
}
