/** Default lower CT cutoff: the midpoint of the full finite intensity range. */
export function ctDefaults(image: { global_min?: number; global_max?: number; cal_min?: number; cal_max?: number }) {
  const lo = Number.isFinite(image.global_min) ? image.global_min! : Number.isFinite(image.cal_min) ? image.cal_min! : 0
  const maximum = Number.isFinite(image.global_max) ? image.global_max! : Number.isFinite(image.cal_max) ? image.cal_max! : lo + 1
  const hi = Math.max(lo + .001, maximum)
  return { lo, hi, min: lo + (hi - lo) / 2, max: hi }
}
