import type { Station } from '@/sip/model'

export function NotesPanel({ station }: { station: Station }) {
  const { info } = station
  return (
    <div className="space-y-5 p-4">
      <section>
        <h3 className="mb-2 text-xs font-medium tracking-wide text-on-surface-variant uppercase">Notes</h3>
        <ol className="space-y-2 text-xs">
          {info.notes.map((n) => (
            <li key={`${n.no}-${n.text.slice(0, 12)}`} className="flex gap-2">
              <span className="w-5 shrink-0 text-right text-on-surface-variant tabular-nums">{n.no ? `${n.no}.` : "\u2022"}</span>
              <span className="text-on-surface">{n.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {info.procedures.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-medium tracking-wide text-on-surface-variant uppercase">Hot axle siding key working</h3>
          <div className="space-y-2">
            {info.procedures.map((p) => (
              <details key={p.id} className="rounded-md border border-outline-variant bg-surface-container">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-on-surface">{p.title}</summary>
                <div className="space-y-2 px-3 pb-3 text-[11px]">
                  <p className="text-on-surface-variant">{p.location}</p>
                  <ol className="list-decimal space-y-1.5 pl-4 text-on-surface">
                    {p.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {info.revisions.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-medium tracking-wide text-on-surface-variant uppercase">Revisions</h3>
          <ul className="space-y-2 text-[11px]">
            {info.revisions.map((r) => (
              <li key={r.ver} className="rounded-md border border-outline-variant p-2">
                <p className="font-medium text-on-surface">Version {r.ver}</p>
                <p className="text-on-surface">{r.text}</p>
                {r.supersedes && <p className="text-on-surface-variant">Supersedes {r.supersedes}</p>}
                <p className="text-on-surface-variant">{r.reference}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
