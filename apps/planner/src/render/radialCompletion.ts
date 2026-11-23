import type { Vec3 } from '@brainana/planning-core/model.ts'

export interface BoundaryCompletionSettings {
  enabled: boolean
  maximumGapMm: number
  smoothness: number
}
export interface RadialBoundary {
  rings: number
  segments: number
  radius: number
  spacingMm: number
  directions: Float32Array
  radii: Float64Array
  /** 0: missing detection; 1: detected; 2: protected opening/crop; 3: reconstructed. */
  state: Uint8Array
}

/** Four surface neighbours, including the longitude seam and the two shared poles. */
export function radialNeighbours(index: number, rings: number, segments: number, visit: (index: number) => void): void {
  const last = 1 + (rings - 1) * segments
  if (index === 0 || index === last) {
    const start = index === 0 ? 1 : last - segments
    for (let s = 0; s < segments; s++) visit(start + s)
    return
  }
  const row = Math.floor((index - 1) / segments), column = (index - 1) % segments, start = 1 + row * segments
  visit(start + (column + segments - 1) % segments)
  visit(start + (column + 1) % segments)
  visit(row === 0 ? 0 : index - segments)
  visit(row === rings - 2 ? last : index + segments)
}

function solve(matrix: Float64Array, values: Float64Array): Float64Array | null {
  const a = matrix.slice(), b = values.slice(), n = b.length
  for (let k = 0; k < n; k++) {
    let pivot = k
    for (let i = k + 1; i < n; i++) if (Math.abs(a[i * n + k]) > Math.abs(a[pivot * n + k])) pivot = i
    if (Math.abs(a[pivot * n + k]) < 1e-12) return null
    if (pivot !== k) {
      for (let j = k; j < n; j++) [a[k * n + j], a[pivot * n + j]] = [a[pivot * n + j], a[k * n + j]]
      ;[b[k], b[pivot]] = [b[pivot], b[k]]
    }
    for (let i = k + 1; i < n; i++) {
      const factor = a[i * n + k] / a[k * n + k]
      for (let j = k + 1; j < n; j++) a[i * n + j] -= factor * a[k * n + j]
      b[i] -= factor * b[k]
    }
  }
  const result = new Float64Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let value = b[i]
    for (let j = i + 1; j < n; j++) value -= a[i * n + j] * result[j]
    result[i] = value / a[i * n + i]
  }
  return result
}

/** Reconstruct bounded gaps on the curved boundary, never inside the head volume.
 * A robust quadratic radius field supplies local curvature. A constrained residual
 * solve joins that field to the surrounding detections, which remain anchored.
 * Missing regions touching protected cuts, or exceeding the physical span limit,
 * remain open. Earlier inferred patches never become evidence for later patches.
 */
export function completeRadialBoundary(grid: RadialBoundary, settings: BoundaryCompletionSettings) {
  const { rings, segments, radius, spacingMm, directions: d, radii, state } = grid
  const report = { bridgedGaps: 0, skippedGaps: 0, outliers: 0 }
  if (!settings.enabled) return report
  const n = state.length, seen = new Uint8Array(n), queue = new Uint32Array(n), stamp = new Uint32Array(n)
  const predicted = new Float64Array(n), residual = new Float64Array(n)
  const neighbours = (i: number, visit: (j: number) => void) => radialNeighbours(i, rings, segments, visit)
  // Only isolated deviations are removed. Smooth slopes/large curved areas are not outliers.
  const isolated: number[] = [], limit = Math.max(2, 3 * spacingMm)
  for (let i = 1; i < n - 1; i++) if (state[i] === 1) {
    const values: number[] = []
    neighbours(i, j => { if (state[j] === 1) values.push(radii[j]) })
    if (values.length !== 4) continue
    values.sort((a, b) => a - b)
    const median = (values[1] + values[2]) / 2
    if (Math.abs(radii[i] - median) > limit && values[3] - values[0] < limit) isolated.push(i)
  }
  for (const i of isolated) { state[i] = 0; report.outliers++ }
  let generation = 0
  for (let seed = 0; seed < n; seed++) {
    if (state[seed] !== 0 || seen[seed]) continue
    let head = 0, count = 1, protectedEdge = false, borderRadius = 0, borderCount = 0
    queue[0] = seed; seen[seed] = 1
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    const physicalLo = [Infinity, Infinity, Infinity], physicalHi = [-Infinity, -Infinity, -Infinity]
    const sum: Vec3 = [0, 0, 0]
    while (head < count) {
      const i = queue[head++]
      for (let k = 0; k < 3; k++) {
        const value = d[i * 3 + k]
        lo[k] = Math.min(lo[k], value); hi[k] = Math.max(hi[k], value); sum[k] += value
      }
      neighbours(i, j => {
        if (state[j] === 2) protectedEdge = true
        else if (state[j] === 1) {
          borderRadius += radii[j]; borderCount++
          for (let k = 0; k < 3; k++) {
            const unit = d[j * 3 + k], position = unit * radii[j]
            lo[k] = Math.min(lo[k], unit); hi[k] = Math.max(hi[k], unit)
            physicalLo[k] = Math.min(physicalLo[k], position); physicalHi[k] = Math.max(physicalHi[k], position)
          }
        }
        else if (state[j] === 0 && !seen[j]) { seen[j] = 1; queue[count++] = j }
      })
    }
    const localRadius = borderCount ? borderRadius / borderCount : radius
    // The bounding-box diagonal is a conservative upper bound on a gap's span.
    const span = localRadius * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
    if (protectedEdge || span > settings.maximumGapMm || count === n) { report.skippedGaps++; continue }
    const length = Math.hypot(...sum)
    if (length < 1e-8) { report.skippedGaps++; continue }
    const center = sum.map(v => v / length) as Vec3
    const tangent: Vec3 = Math.abs(center[2]) < .9 ? [-center[1], center[0], 0] : [0, -center[2], center[1]]
    const tangentLength = Math.hypot(...tangent)
    for (let k = 0; k < 3; k++) tangent[k] /= tangentLength
    const second = [center[1] * tangent[2] - center[2] * tangent[1], center[2] * tangent[0] - center[0] * tangent[2], center[0] * tangent[1] - center[1] * tangent[0]]
    let patchRadius = 0
    const distance = (i: number) => localRadius * Math.hypot(d[i * 3] - center[0], d[i * 3 + 1] - center[1], d[i * 3 + 2] - center[2])
    for (let j = 0; j < count; j++) patchRadius = Math.max(patchRadius, distance(queue[j]))
    const reach = patchRadius + Math.max(2 * spacingMm, Math.min(4, settings.maximumGapMm))
    generation++
    for (let j = 0; j < count; j++) stamp[queue[j]] = generation
    head = 0; let tail = count
    while (head < tail) neighbours(queue[head++], j => {
      if (state[j] !== 1 || stamp[j] === generation || distance(j) > reach) return
      stamp[j] = generation; queue[tail++] = j
    })
    if (tail - count < 12) { report.skippedGaps++; continue }
    const terms = (i: number) => {
      const x = localRadius * (d[i * 3] * tangent[0] + d[i * 3 + 1] * tangent[1] + d[i * 3 + 2] * tangent[2]) / reach
      const y = localRadius * (d[i * 3] * second[0] + d[i * 3 + 1] * second[1] + d[i * 3 + 2] * second[2]) / reach
      return [1, x, y, x * x, x * y, y * y]
    }
    let mean = 0, area = 0, minimum = Infinity, maximum = -Infinity
    for (let j = count; j < tail; j++) {
      const i = queue[j], weight = Math.max(.001, Math.hypot(d[i * 3], d[i * 3 + 1]))
      mean += radii[i] * weight; area += weight
      minimum = Math.min(minimum, radii[i]); maximum = Math.max(maximum, radii[i])
    }
    mean /= area
    let coefficients: Float64Array = new Float64Array(6)
    // Iteratively downweight mismatched boundary detections in the fit.
    for (let pass = 0; pass < 3; pass++) {
      const matrix = new Float64Array(36), values = new Float64Array(6)
      for (let j = count; j < tail; j++) {
        const i = queue[j], q = terms(i), value = radii[i] - mean
        const error = Math.abs(value - q.reduce((s, v, k) => s + v * coefficients[k], 0))
        const weight = Math.max(.001, Math.hypot(d[i * 3], d[i * 3 + 1])) / (1 + (distance(i) / reach) ** 2) * (pass ? Math.min(1, Math.max(spacingMm, .5) / Math.max(error, 1e-9)) : 1)
        for (let a = 0; a < 6; a++) {
          values[a] += weight * q[a] * value
          for (let b = 0; b < 6; b++) matrix[a * 6 + b] += weight * q[a] * q[b]
        }
      }
      for (let k = 0; k < 6; k++) matrix[k * 6 + k] += area * 1e-7
      const fit = solve(matrix, values)
      if (fit) coefficients = fit
    }
    for (let j = 0; j < tail; j++) {
      const i = queue[j], value = mean + terms(i).reduce((s, v, k) => s + v * coefficients[k], 0)
      predicted[i] = Math.max(minimum - spacingMm, Math.min(maximum + spacingMm, value))
      residual[i] = j < count ? 0 : radii[i] - predicted[i]
    }
    const next = new Float64Array(count)
    for (let pass = 0; pass < 80; pass++) {
      let change = 0
      for (let j = 0; j < count; j++) {
        const i = queue[j]; let sum = 0, weights = 0
        neighbours(i, other => {
          if (stamp[other] !== generation) return
          const squared = localRadius ** 2 * ((d[i * 3] - d[other * 3]) ** 2 + (d[i * 3 + 1] - d[other * 3 + 1]) ** 2 + (d[i * 3 + 2] - d[other * 3 + 2]) ** 2)
          const weight = 1 / Math.max(squared, (spacingMm * .1) ** 2)
          sum += weight * residual[other]; weights += weight
        })
        next[j] = weights ? sum / (weights * (1 + settings.smoothness * .25)) : 0
        change = Math.max(change, Math.abs(next[j] - residual[i]))
      }
      for (let j = 0; j < count; j++) residual[queue[j]] = next[j]
      if (change < .002) break
    }
    for (let j = 0; j < count; j++) {
      const i = queue[j]
      next[j] = Math.max(minimum - spacingMm, Math.min(maximum + spacingMm, predicted[i] + residual[i]))
      for (let k = 0; k < 3; k++) {
        const position = next[j] * d[i * 3 + k]
        physicalLo[k] = Math.min(physicalLo[k], position); physicalHi[k] = Math.max(physicalHi[k], position)
      }
    }
    // Check the physical patch including its attachment edge, not just its empty centre.
    if (Math.hypot(physicalHi[0] - physicalLo[0], physicalHi[1] - physicalLo[1], physicalHi[2] - physicalLo[2]) > settings.maximumGapMm) { report.skippedGaps++; continue }
    for (let j = 0; j < count; j++) { radii[queue[j]] = next[j]; state[queue[j]] = 3 }
    report.bridgedGaps++
  }
  return report
}
