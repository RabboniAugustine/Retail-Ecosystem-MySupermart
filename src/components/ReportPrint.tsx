import { createPortal } from 'react-dom'
import type { ReportOut } from '../lib/exporter'

/** Black-on-white copy of a report, only visible when printing. */
export function ReportPrint({ report, shopName }: { report: ReportOut; shopName: string }) {
  const cell: React.CSSProperties = { padding: '3px 6px', borderBottom: '1px solid #ddd', fontSize: 10, textAlign: 'left' }
  return createPortal(
    <div className="report-print">
      <div style={{ fontSize: 16, fontWeight: 700 }}>{shopName}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{report.title}</div>
      <div style={{ fontSize: 11, color: '#444', marginBottom: 10 }}>{report.subtitle} · printed {new Date().toLocaleString('en-GB')}</div>
      {report.summary.length > 0 && (
        <table style={{ borderCollapse: 'collapse', marginBottom: 14, minWidth: '50%' }}>
          <tbody>
            {report.summary.map(s => (
              <tr key={s.label}><td style={cell}>{s.label}</td><td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{s.value}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {report.tables.map(t => (
        <div key={t.title} style={{ marginBottom: 14, breakInside: 'auto' }}>
          <div style={{ fontSize: 12, fontWeight: 700, margin: '6px 0' }}>{t.title}</div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>{t.columns.map(c => <th key={c.label} style={{ ...cell, fontWeight: 700, borderBottom: '1px solid #000', textAlign: c.align ?? 'left' }}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => (
                <tr key={i}>{r.map((v, j) => (
                  <td key={j} style={{ ...cell, textAlign: t.columns[j]?.align ?? 'left' }}>
                    {typeof v === 'number' && t.columns[j]?.money ? v.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v}
                  </td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>,
    document.body,
  )
}
