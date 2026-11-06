import { worldToScreen } from './camera'
import { emphasisOf, type DrawArgs } from './types'

/** Printed route labels and free text (axle sections, over-run notes, CSL, end-of-yard names). */
export function drawAnnotations({ ctx, layout, camera, theme, state, placer, regions }: DrawArgs): void {
  const { layers } = state
  const { assets } = layout.station
  if (layers.annotations) {
    for (const a of assets.annotations) {
      const at = worldToScreen(camera, layout.place(a))
      const end = a.tone === 'end'
      const emphasis = emphasisOf(state, 'annotation', a.id)
      const base = end ? theme.signal : a.tone === 'line' ? theme.label : theme.labelMuted
      placer.text(ctx, theme, a.text, at.x, at.y, emphasis === 'selected' ? theme.selected : emphasis === 'hovered' ? theme.hover : base, {
        ref: { type: 'annotation', id: a.id },
        regions,
        font: end ? '600 13px ui-sans-serif, system-ui, sans-serif' : theme.fontSmall,
        height: end ? 15 : 12,
        align: end ? 'left' : 'center',
        force: end || emphasis !== null,
      })
    }
  }
  if (layers.routes) {
    for (const r of assets.routeLabels) {
      const at = worldToScreen(camera, layout.place(r))
      const text = r.arrow === 'east' ? `${r.text} →` : r.arrow === 'west' ? `← ${r.text}` : r.text
      placer.text(ctx, theme, text, at.x, at.y, theme.route, { font: theme.fontSmall, height: 12 })
    }
  }
}
