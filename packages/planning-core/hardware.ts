import type { Electrode, Vec3 } from './model.ts'

/** All local offsets are relative to the assembly centre at the chosen grid hole. */
export function shankOffsets(e: Electrode): Vec3[] {
  const h = e.hardware
  if (!h) return [[0, 0, 0]]
  const a = (h.rotation * Math.PI) / 180
  return Array.from({ length: h.rows * h.columns }, (_, i) => {
    const x = ((i % h.columns) - (h.columns - 1) / 2) * h.pitchX
    const y = (Math.floor(i / h.columns) - (h.rows - 1) / 2) * h.pitchY
    return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), 0]
  })
}
export function shankLength(e: Electrode, i: number): number {
  return e.hardware?.shankLengths[i] ?? e.length ?? 150
}
export function shankDepth(e: Electrode, i: number): number {
  const reference = e.hardware?.selectedShank ?? 0
  return e.depth + shankLength(e, i) - shankLength(e, reference)
}
export function maximumInsertion(e: Electrode): number {
  return shankLength(e, e.hardware?.selectedShank ?? 0)
}
export function siteSpan(e: Electrode): number {
  if (!e.hardware) return e.contactLength + (e.contactCount - 1) * e.contactSpacing
  if (e.hardware.sitePositions)
    return Math.max(...e.hardware.sitePositions.map((p) => p[2])) + e.contactLength / 2
  return (
    e.hardware.tipOffset +
    Math.floor((e.contactCount - 1) / e.hardware.siteColumns) * e.contactSpacing +
    e.contactLength / 2
  )
}
export function minimumInsertion(e: Electrode): number {
  if (!e.hardware) return siteSpan(e)
  const ref = shankLength(e, e.hardware.selectedShank)
  // Dense probes can be partly inserted with proximal sites above the grid.
  return Math.max(0, ...shankOffsets(e).map((_, i) => ref - shankLength(e, i)))
}
/** Conservative enclosing circular cross-section used only by the clearance solver. */
export function shaftDiameter(e: Electrode): number {
  return e.hardware?.shape === 'blade' ? Math.hypot(e.hardware.width, e.hardware.thickness) : e.diameter
}
export function localSites(e: Electrode, shank: number): Vec3[] {
  const h = e.hardware,
    offset = shankOffsets(e)[shank],
    a = ((h?.rotation ?? 0) * Math.PI) / 180
  return Array.from({ length: e.contactCount }, (_, i) => {
    const explicit = h?.sitePositions?.[i]
    const x = explicit ? explicit[0] : h ? ((i % h.siteColumns) - (h.siteColumns - 1) / 2) * h.sitePitchX : 0
    const back = explicit
      ? explicit[2]
      : (h?.tipOffset ?? e.contactLength / 2) + Math.floor(i / (h?.siteColumns ?? 1)) * e.contactSpacing
    const y = explicit ? explicit[1] : h ? (h.shape === 'blade' ? h.thickness / 2 : e.diameter / 2) : 0
    return [
      offset[0] + x * Math.cos(a) - y * Math.sin(a),
      offset[1] + x * Math.sin(a) + y * Math.cos(a),
      -shankDepth(e, shank) + back,
    ]
  })
}
export function hardwareFitsBore(e: Electrode, entry: Vec3, radius: number): boolean {
  return shankOffsets(e).every(
    (o) =>
      Math.hypot(entry[0] + o[0], entry[1] + o[1]) +
        Math.max(shaftDiameter(e), e.guideTube?.outerDiameter ?? 0) / 2 <=
      radius + 1e-8,
  )
}

/** A regular single-hole guide cannot be assumed to support a rigid multi-needle assembly. */
export function gridCompatibility(e: Electrode | undefined): { available: boolean; reason: string } {
  if (!e) return { available: false, reason: 'Select an electrode to configure its grid access.' }
  if (e.direct) return { available: false, reason: 'This electrode uses direct skull entry, without a chamber or guide grid.' }
  const h = e.hardware
  if ((h && h.rows * h.columns > 1) || h?.presetId === 'utah' || h?.presetId === 'micro-fma')
    return {
      available: false,
      reason:
        'Grid hole selection is unavailable for this array. Its needles have a fixed footprint and require an array-specific mount; a regular single-hole guide does not establish mechanical compatibility. Position the assembly and its selected targeting needle in Position. Custom array holders are not modeled.',
    }
  return {
    available: true,
    reason:
      'Choose a guide hole for this single-shaft device. Confirm the actual hole diameter and holder fit; these interfaces are not modeled.',
  }
}

export function minimumTargetInsertion(e: Electrode): number {
  return Math.max(minimumInsertion(e), e.guideTube ? e.guideTube.tipDepth + 1e-6 : 0)
}
