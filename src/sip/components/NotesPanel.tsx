import type { Station } from '@/sip/model'

export function NotesPanel({ station }: { station: Station }) {
  const { info } = station
  return (
    <div className="space-y-6 p-4">
      <section>
        <h3 className="mb-2.5 text-[11px] font-semibold tracking-[0.06em] text-on-surface-variant uppercase">Notes</h3>
        <ol className="space-y-2.5 text-xs leading-relaxed">
          {info.notes.map((n) => (
            <li key={`${n.no}-${n.text.slice(0, 12)}`} className="flex gap-2">
              <span className="w-6 shrink-0 text-right font-mono text-[11px] text-on-surface-variant tabular-nums">{n.no ? `${n.no}.` : "\u2022"}</span>
              <span className="text-on-surface">{n.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {info.procedures.length > 0 && (
        <section>
          <h3 className="mb-2.5 text-[11px] font-semibold tracking-[0.06em] text-on-surface-variant uppercase">Hot axle siding key working</h3>
          <div className="space-y-2">
            {info.procedures.map((p) => (
              <details key={p.id} className="group rounded-md border border-outline-variant bg-surface-container-low">
                <summary className="flex list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-high">
                  {p.title}
                  <span className="text-on-surface-variant transition-transform group-open:rotate-90" aria-hidden>›</span>
                </summary>
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
          <h3 className="mb-2.5 text-[11px] font-semibold tracking-[0.06em] text-on-surface-variant uppercase">Revisions</h3>
          <ul className="space-y-2 text-[11px]">
            {info.revisions.map((r) => (
              <li key={r.ver} className="space-y-0.5 rounded-md border border-outline-variant bg-surface-container-low px-3 py-2">
                <p className="text-xs font-semibold text-on-surface">Version {r.ver}</p>
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
