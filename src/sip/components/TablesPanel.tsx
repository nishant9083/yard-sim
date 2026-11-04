import type { AspectChart, Station } from '@/sip/model'
import { DataTable } from './DataTable'

function Aspects({ chart }: { chart: AspectChart }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-medium text-on-surface">{chart.title}</h3>
      <div className="overflow-x-auto rounded-md border border-outline-variant">
        <table className="w-full border-collapse text-center text-[11px]">
          <thead className="bg-surface-container-high text-on-surface-variant">
            <tr>
              {chart.signals.map((s) => (
                <th key={s.name} scope="col" className="px-2 py-1 font-medium">
                  {s.name}
                  {s.code && <span className="block text-on-surface">{s.code}</span>}
                </th>
              ))}
            </tr>
            <tr className="text-on-surface-variant">
              {chart.signals.map((s, i) => (
                <td key={s.name} className="px-2 pb-1 text-[10px]">
                  {i < chart.gaps.length ? `→ ${chart.gaps[i]}` : ''}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row, i) => (
              <tr key={i} className="border-t border-outline-variant">
                {row.map((a, j) => (
                  <td key={j} className="px-2 py-1 font-medium text-on-surface">
                    {a || <span className="text-on-surface-variant">–</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-on-surface-variant">
        Aspects per signal, top to bottom, as printed. Y yellow, YY double yellow, G green, R red, Ywu yellow with white (calling-on/route) as shown on the SIP. The dashed linking lines of the chart are not reproduced.
      </p>
    </section>
  )
}

export function TablesPanel({ station }: { station: Station }) {
  const { info } = station
  return (
    <div className="space-y-5 p-4">
      <section>
        <h3 className="mb-1.5 text-xs font-medium text-on-surface">Title block</h3>
        <dl className="space-y-1 text-[11px]">
          {info.titleBlock.map((r) => (
            <div key={r.label} className="flex justify-between gap-4">
              <dt className="shrink-0 text-on-surface-variant">{r.label}</dt>
              <dd className="text-right text-on-surface">{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {info.lines.length > 0 && (
        <DataTable
          table={{
            title: 'Lines and clear standing length',
            columns: ['Line', 'Name', 'CSL'],
            rows: info.lines.map((l) => [String(l.lineNo), l.name, l.csl]),
          }}
        />
      )}
      {info.tables.map((t) => (
        <DataTable key={t.id} table={t} />
      ))}
      {info.aspectCharts.map((c) => (
        <Aspects key={c.direction} chart={c} />
      ))}
    </div>
  )
}
