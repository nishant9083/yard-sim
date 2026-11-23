import { isLevelCrossing, validateStation, type Station, type ValidationIssue } from '@/sip/model'

/**
 * Structural validation plus completeness checks that only matter while authoring:
 * things the app cannot work out for the user and that are still blank.
 */
export function editorIssues(s: Station): ValidationIssue[] {
  const issues = validateStation(s)
  const add = (code: string, message: string, entityId?: string) => issues.push({ level: 'warning', code, message, entityId })

  if (!s.meta.code.trim()) add('meta.code', 'Station code is empty')
  if (!s.meta.name.trim()) add('meta.name', 'Station name is empty')
  const needsScale = s.assets.platforms.length + s.assets.bridges.length + s.assets.structures.length > 0
  if (needsScale && !s.meta.chainage) add('meta.chainage', 'Set the chainage scale so lengths and chainages can be filled in')

  const dupes = (codes: { id: string; code: string }[], kind: string) => {
    const seen = new Map<string, string>()
    for (const { id, code } of codes) {
      const first = seen.get(code)
      if (first) add(`${kind}.code-duplicate`, `${kind} code ${code} is used twice`, id)
      else seen.set(code, id)
    }
  }
  dupes(s.assets.signals, 'Signal')
  dupes(s.assets.points, 'Point')
  dupes(s.assets.trackCircuits, 'Track circuit')

  for (const p of s.assets.points) if (!p.ratio.trim()) add('point.ratio', `Point ${p.code}: ratio not set (the SIP default will apply)`, p.id)
  for (const b of s.assets.bridges) if (!b.number.trim()) add('bridge.number', `${isLevelCrossing(b) ? 'Level crossing' : 'Bridge'} has no number`, b.id)
  for (const p of s.assets.platforms) if (!p.widthM) add('platform.width', `${p.name}: width not set`, p.id)
  for (const t of s.tracks) if (!t.name.trim()) add('track.name', `Track ${t.id} has no name`, t.id)
  return issues
}
