const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Symbols (signal heads, markers, boxes) keep a readable pixel size: they grow with zoom
 * but stay between a floor and a ceiling. Positions stay in world space.
 */
export const symbolRadius = (zoom: number): number => clamp(zoom * 6, 4.4, 11)

export const clampPx = clamp
