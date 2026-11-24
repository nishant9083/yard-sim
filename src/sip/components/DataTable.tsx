import type { InfoTable } from '@/sip/model'

export function DataTable({ table }: { table: Pick<InfoTable, 'title' | 'columns' | 'rows'> }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-on-surface">{table.title}</h3>
      <div className="overflow-x-auto rounded-md border border-outline-variant">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="bg-surface-container-high text-[10.5px] tracking-wide text-on-surface-variant uppercase">
            <tr>
              {table.columns.map((c) => (
                <th key={c} scope="col" className="px-2.5 py-1.5 font-semibold whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className="border-t border-outline-variant align-top even:bg-surface-container-low/60 hover:bg-surface-container-high/60">
                {row.map((cell, j) => (
                  <td key={j} className="px-2.5 py-1.5 text-on-surface">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
