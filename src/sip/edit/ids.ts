/** Next free id of the form `<prefix><number>`, e.g. N012. */
export function nextId(prefix: string, existing: Iterable<string>, pad = 2): string {
  let max = 0
  for (const id of existing) {
    if (!id.startsWith(prefix)) continue
    const rest = id.slice(prefix.length)
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest))
  }
  return `${prefix}${String(max + 1).padStart(pad, '0')}`
}

/** `base` if free, else `base_2`, `base_3` ... Used for ids derived from codes. */
export function uniqueId(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing)
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`
}

/** Leading number in a code such as `31A`, `C1(A-M)` or `151AXT`; null if there is none. */
export function numberOf(code: string): number | null {
  const m = /\d+/.exec(code)
  return m ? Number(m[0]) : null
}

export const idSafe = (code: string): string => code.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'X'
