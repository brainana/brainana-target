import type { Vec3, SurfaceBrushStroke } from '@brainana/planning-core/model.ts'
import type { MRISurfaceSettings } from './mriSurface.ts'
import { smoothSurface } from './smoothSurface.ts'
import { completeRadialBoundary } from './radialCompletion.ts'
export interface ScalarImage { sample: (point: Vec3, nearest?: boolean) => number }
export interface DarkBandReport {
  center: Vec3; directions: number; supported: number; missingBrain: number
  missingBand: number; ambiguous: number; cropped: number; discontinuousFaces: number
  detected: number; reconstructed: number; bridgedGaps: number; skippedGaps: number; outliers: number
}
/** Seed an editable cutoff from brain signal and the outside-image background, not an extreme maximum. */
export function darkBandCutoff(image: ScalarImage, brain: ScalarImage, bounds: [Vec3, Vec3], foreground: number): number | undefined {
  const tissue: number[] = [], background: number[] = []
  for (let z = 0; z < 16; z++) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const p = [x, y, z].map((v, k) => bounds[0][k] + (v + .5) / 16 * (bounds[1][k] - bounds[0][k])) as Vec3
    const value = image.sample(p)
    if (!Number.isFinite(value)) continue
    if (brain.sample(p, true) >= foreground) tissue.push(value)
    else if (!x || !y || !z || x === 15 || y === 15 || z === 15) background.push(value)
  }
  if (!tissue.length || !background.length) return undefined
  tissue.sort((a, b) => a - b); background.sort((a, b) => a - b)
  const bright = tissue[Math.floor(tissue.length / 2)], dark = background[Math.floor(background.length / 2)]
  return bright > dark ? dark + .35 * (bright - dark) : undefined
}
function erased(point: Vec3, strokes: SurfaceBrushStroke[]): boolean {
  let removed = false
  for (const stroke of strokes) {
    const [u, v] = [0, 1, 2].filter(k => k !== stroke.normal), n = stroke.normal
    for (let j = 0; j < stroke.points.length; j++) {
      const a = stroke.points[Math.max(0, j - 1)], b = stroke.points[j], du = b[u] - a[u], dv = b[v] - a[v], length = du * du + dv * dv
      const t = length ? Math.max(0, Math.min(1, ((point[u] - a[u]) * du + (point[v] - a[v]) * dv) / length)) : 0
      const offset = point[n] - a[n] - t * (b[n] - a[n])
      if (offset < -stroke.thicknessMm / 2 - 1e-6 || offset >= stroke.thicknessMm / 2 - 1e-6) continue
      if (Math.hypot(point[u] - a[u] - t * du, point[v] - a[v] - t * dv) <= stroke.radius) { removed = stroke.mode === 'erase'; break }
    }
  }
  return removed
}
/** One scalp-side dark-band boundary, located from scalp inward or anchored to a brain region.
 * Bounded missing profiles may be reconstructed along the neighbouring curvature.
 * Crops/manual erasures remain open; no internal brain/scalp shells are returned.
 * This is an explicit star-shaped approximation, not a measured bone segmentation.
 */
export function mriDarkBand(image: ScalarImage, brain: ScalarImage | undefined, settings: MRISurfaceSettings) {
  const direct=settings.method==='dark-band-head'
  const anchor=brain??image
  const anchorThreshold=settings.brainEstimate ? .5 : settings.threshold
  const band = settings.darkBand
  if (!band) throw Error('Set the dark-band search controls first.')
  const completion = band.completion
  if (completion && (typeof completion.enabled !== 'boolean' || !Number.isFinite(completion.maximumGapMm) || completion.maximumGapMm < .5 || completion.maximumGapMm > 40 || !Number.isFinite(completion.smoothness) || completion.smoothness < 0 || completion.smoothness > 1)) throw Error('Invalid MRI gap reconstruction settings.')
  const [lo, hi] = settings.bounds, step = settings.spacingMm, sampleStep = step / 2
  if (!Number.isFinite(step) || step < .05 || step > 20 || !Number.isFinite(settings.threshold) || !Number.isFinite(settings.offsetMm) || settings.offsetMm < 0 || settings.offsetMm > 30 || ![...lo, ...hi].every(Number.isFinite) || hi.some((v, k) => v <= lo[k]) || !Number.isFinite(band.maximumIntensity) || !Number.isFinite(band.searchMm) || band.searchMm < 2 || band.searchMm > 50 || !Number.isFinite(band.minimumWidthMm) || band.minimumWidthMm < .05 || !Number.isFinite(band.maximumWidthMm) || band.maximumWidthMm < band.minimumWidthMm || band.maximumWidthMm > 50 || !Number.isFinite(band.minimumScalpMm) || band.minimumScalpMm < .05 || band.minimumScalpMm > band.searchMm) throw Error('Invalid MRI dark-band search settings.')
  if(direct&&settings.threshold<=band.maximumIntensity)throw Error('Set the head-tissue brightness cutoff above the dark-band maximum brightness.')
  const scanStep = Math.max(step, Math.max(...hi.map((v, k) => v - lo[k])) / 48)
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity], sum: Vec3 = [0, 0, 0]
  let count = 0
  const brainPoints:number[]=[]
  for (let z = lo[2] + scanStep / 2; z < hi[2]; z += scanStep) for (let y = lo[1] + scanStep / 2; y < hi[1]; y += scanStep) for (let x = lo[0] + scanStep / 2; x < hi[0]; x += scanStep) {
    const p: Vec3 = [x, y, z], value = anchor.sample(p, true)
    if (!Number.isFinite(value) || value < anchorThreshold) continue
    count++;brainPoints.push(...p)
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k] - scanStep / 2); max[k] = Math.max(max[k], p[k] + scanStep / 2); sum[k] += p[k] }
  }
  if (!count) throw Error(direct?'No head tissue is present in this crop. Lower the head-tissue cutoff or adjust the crop.':'No brain mask is present in this crop. Load a brain-only mask already aligned to the MRI.')
  const center = band.center ?? sum.map(v => v / count) as Vec3
  if (center.some((v, k) => !Number.isFinite(v) || v <= lo[k] || v >= hi[k] || v <= min[k] || v >= max[k])) throw Error('Choose the head centre inside the head, near the middle of the brain in the MRI slices.')
  if(band.center&&!direct&&!(anchor.sample(center,true)>=settings.threshold))throw Error('Choose the head centre inside the brain mask, or use the automatic centre.')
  let radius = 0
  for(let i=0;i<brainPoints.length;i+=3)radius=Math.max(radius,Math.hypot(brainPoints[i]-center[0],brainPoints[i+1]-center[1],brainPoints[i+2]-center[2])+scanStep)
  if(!direct)radius += band.searchMm
  const rings = Math.max(12, Math.ceil(Math.PI * radius / step)), segments = 2 * rings, directions = 2 + (rings - 1) * segments
  if (directions > 1200000) throw Error('This dark-band surface exceeds 1.2 million directions. Crop more tightly or choose coarser surface detail.')
  const points = new Float32Array(directions * 3), unitDirections = new Float32Array(directions * 3), radii = new Float64Array(directions), state = new Uint8Array(directions)
  const triangles: number[] = [], faceKinds: number[] = []
  let index = 0
  const report: DarkBandReport = { center: [...center], directions, supported: 0, missingBrain: 0, missingBand: 0, ambiguous: 0, cropped: 0, discontinuousFaces: 0, detected: 0, reconstructed: 0, bridgedGaps: 0, skippedGaps: 0, outliers: 0 }
  const ray = (direction: Vec3) => {
    const croppedBefore = report.cropped
    let cropEnd = Infinity, brainEnd = Infinity
    for (let k = 0; k < 3; k++) if (Math.abs(direction[k]) > 1e-12) {
      cropEnd = Math.min(cropEnd, ((direction[k] > 0 ? hi[k] : lo[k]) - center[k]) / direction[k])
      brainEnd = Math.min(brainEnd, ((direction[k] > 0 ? max[k] : min[k]) - center[k]) / direction[k])
    }
    const p: Vec3 = [0, 0, 0]
    const at = (r: number, volume: ScalarImage) => { for (let k = 0; k < 3; k++) p[k] = center[k] + r * direction[k]; return volume.sample(p, true) }
    let brainRadius = NaN
    let directRadius=NaN
    if(direct){
      // Work inward from the outermost substantial scalp layer. Internal brain/skin
      // shells never become additional output surfaces, and crop faces stay open.
      const values:number[]=[],locations:number[]=[]
      for(let r=0;r<cropEnd;r+=sampleStep){locations.push(r);values.push(at(r,image))}
      let outer=-1
      for(let i=values.length-1;i>=0;i--)if(Number.isFinite(values[i])&&values[i]>=settings.threshold){outer=i;break}
      if(outer<0)report.missingBrain++
      else if(locations[outer]>=cropEnd-step||!Number.isFinite(values[outer+1]))report.cropped++
      else {
        let innerScalp=outer
        while(innerScalp>=0&&Number.isFinite(values[innerScalp])&&values[innerScalp]>band.maximumIntensity)innerScalp--
        const scalpWidth=(outer-innerScalp)*sampleStep
        let innerBand=innerScalp
        while(innerBand>=0&&Number.isFinite(values[innerBand])&&values[innerBand]<=band.maximumIntensity)innerBand--
        const width=(innerScalp-innerBand)*sampleStep
        let innerTissue=innerBand
        while(innerTissue>=0&&Number.isFinite(values[innerTissue])&&values[innerTissue]>band.maximumIntensity)innerTissue--
        const tissueWidth=(innerBand-innerTissue)*sampleStep
        if(innerBand<0||innerScalp<0||scalpWidth<band.minimumScalpMm||width<band.minimumWidthMm||width>band.maximumWidthMm||scalpWidth+width>band.searchMm||tissueWidth<band.minimumScalpMm||settings.offsetMm>=width)report.missingBand++
        else {
          const fraction=(band.maximumIntensity-values[innerScalp])/(values[innerScalp+1]-values[innerScalp])
          directRadius=locations[innerScalp]+Math.max(0,Math.min(1,fraction))*sampleStep-settings.offsetMm
        }
      }
    }
    if(!direct)for (let r = Math.min(cropEnd - sampleStep, brainEnd + scanStep); r > 0; r -= sampleStep) if (at(r, anchor) >= anchorThreshold) { brainRadius = r + sampleStep / 2; break }
    let found = directRadius
    if(direct){ /* The scalp-first profile above supplied the single boundary. */ }
    else if (!Number.isFinite(brainRadius)) report.missingBrain++
    else if (brainRadius >= cropEnd - step) report.cropped++
    else {
      const end = Math.min(cropEnd - sampleStep, brainRadius + band.searchMm), values: number[] = [], locations: number[] = []
      for (let r = brainRadius; r <= end; r += sampleStep) { locations.push(r); values.push(at(r, image)) }
      const candidates: number[] = []
      let darkStart = -1, brightStart = -1, priorDark = 0
      for (let i = 0; i < values.length; i++) {
        if (!Number.isFinite(values[i])) { darkStart = brightStart = -1; continue }
        if (values[i] <= band.maximumIntensity) {
          if (brightStart >= 0) {
            const scalpWidth = (i - brightStart) * sampleStep
            if (priorDark >= band.minimumWidthMm - 1e-8 && priorDark <= band.maximumWidthMm + 1e-8 && scalpWidth >= band.minimumScalpMm - 1e-8 && brightStart > 0) {
              const a = brightStart - 1, fraction = (band.maximumIntensity - values[a]) / (values[brightStart] - values[a])
              const boundary = locations[a] + Math.max(0, Math.min(1, fraction)) * sampleStep - settings.offsetMm
              if (settings.offsetMm < priorDark && boundary > brainRadius) candidates.push(boundary)
            }
            brightStart = -1
          }
          if (darkStart < 0) darkStart = i
        } else if (brightStart < 0) {
          brightStart = i; priorDark = darkStart < 0 ? 0 : (i - darkStart) * sampleStep; darkStart = -1
        }
      }
      if (candidates.length === 1) found = candidates[0]
      else if (candidates.length > 1) report.ambiguous++
      else if (end < brainRadius + band.searchMm - sampleStep || brightStart >= 0) report.cropped++
      else report.missingBand++
    }
    const point = direction.map((v, k) => center[k] + v * (Number.isFinite(found) ? found : 0)) as Vec3
    const removed = Number.isFinite(found) && erased(point, settings.edits ?? [])
    radii[index] = found
    state[index] = removed || report.cropped > croppedBefore ? 2 : Number.isFinite(found) ? 1 : 0
    unitDirections.set(direction, index * 3); points.set(point, index * 3); index++
  }
  ray([0, 0, 1])
  for (let r = 1; r < rings; r++) for (let s = 0; s < segments; s++) {
    const theta = Math.PI * r / rings, phi = 2 * Math.PI * s / segments
    ray([Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)])
  }
  ray([0, 0, -1])
  if (completion?.enabled) Object.assign(report, completeRadialBoundary({ rings, segments, radius, spacingMm: step, directions: unitDirections, radii, state }, completion))
  for (let i = 0; i < directions; i++) if (state[i] === 1 || state[i] === 3) {
    const point = [0, 1, 2].map(k => center[k] + unitDirections[i * 3 + k] * radii[i]) as Vec3
    if (state[i] === 3 && (point.some((v, k) => v <= lo[k] || v >= hi[k]) || erased(point, settings.edits ?? []))) { state[i] = 2; continue }
    points.set(point, i * 3)
  }
  const face = (a: number, b: number, c: number) => {
    if (![a, b, c].every(i => state[i] === 1 || state[i] === 3)) return
    const rs = [radii[a], radii[b], radii[c]]
    if (Math.max(...rs) - Math.min(...rs) > Math.max(4 * step, Math.min(...rs) * .1)) { report.discontinuousFaces++; return }
    triangles.push(a, b, c)
    faceKinds.push(Number(state[a] === 3 || state[b] === 3 || state[c] === 3))
  }
  const row = (r: number, s: number) => 1 + (r - 1) * segments + s % segments
  for (let s = 0; s < segments; s++) face(0, row(1, s), row(1, s + 1))
  for (let r = 1; r < rings - 1; r++) for (let s = 0; s < segments; s++) { face(row(r, s), row(r + 1, s), row(r + 1, s + 1)); face(row(r, s), row(r + 1, s + 1), row(r, s + 1)) }
  for (let s = 0; s < segments; s++) face(directions - 1, row(rings - 1, s + 1), row(rings - 1, s))
  if (triangles.length < 36) throw Error(direct?'No reliable dark band beneath the scalp was found. Adjust the head-tissue cutoff, dark cutoff, band widths or crop. Check the centre is inside the brain.':'No reliable dark band beneath the scalp was found. Check that the mask contains brain only, adjust the dark cutoff and search distance, and review the MRI slices. Missing evidence is not filled automatically.')
  const remap = new Int32Array(directions).fill(-1), pts: number[] = [], tris = new Uint32Array(triangles.length)
  for (let i = 0; i < triangles.length; i++) { const old = triangles[i]; if (remap[old] < 0) { remap[old] = pts.length / 3; pts.push(points[old * 3], points[old * 3 + 1], points[old * 3 + 2]); if (state[old] === 3) report.reconstructed++; else report.detected++ }; tris[i] = remap[old] }
  report.supported=pts.length/3
  const mesh = { pts: new Float32Array(pts), tris }
  return { ...(settings.smooth ? smoothSurface(mesh, lo, hi, step) : mesh), reconstructedFaces: report.reconstructed ? new Uint8Array(faceKinds) : undefined, report: { samples: directions, croppedFaces: report.cropped, spacingMm: step, darkBand: report } }
}
