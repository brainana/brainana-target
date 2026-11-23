import type { Project, Vec3 } from '@brainana/planning-core/model.ts'
import { imageLesson } from './player.ts'

export const lessonPoint = (index: number): Vec3 => imageLesson[index].id === 'slices' ? [0, 10, 28] : [0, 10, 20]

export function lessonProject(baseline: Project, ctId: string, index: number): Project {
  const p = structuredClone(baseline), id = imageLesson[index].id
  p.display.anatomyAssetId = id === 'image' ? ctId : p.frame.referenceAssetId
  p.display.anatomyOverlayIds = ['blend', 'opacity'].includes(id) ? [ctId] : []
  p.display.atlasVisible = false
  p.assets.find(a => a.id === ctId)!.imageDisplay!.opacity = .5
  if (id === 'window') {
    const display = p.assets.find(a => a.id === p.frame.referenceAssetId)!.imageDisplay!
    const center = (display.min + display.max) / 2, width = (display.max - display.min) * .65
    display.min = center - width / 2; display.max = center + width / 2
  }
  return p
}

/** Both disabled controls and the mutation boundary enforce the scope of practice. */
export function permittedPracticeEdit(before: Project, candidate: Project, ctId: string, practice: string): boolean {
  const a = structuredClone(before), b = structuredClone(candidate), mri = before.frame.referenceAssetId
  const image = (p: Project, id: string) => p.assets.find(a => a.id === id)?.imageDisplay
  const overlays = candidate.display.anatomyOverlayIds ?? []
  if (practice === 'image') {
    if (![mri, ctId].includes(candidate.display.anatomyAssetId ?? mri) || overlays.length) return false
    b.display.anatomyAssetId = a.display.anatomyAssetId
  } else if (practice === 'blend') {
    const eligible = new Set(before.assets.filter(a => a.role === 'anatomy' || a.role === 'ct' || a.modality === 'mri').map(a => a.id).filter(id => id !== (before.display.anatomyAssetId ?? mri)))
    if (overlays.some(id => !eligible.has(id))) return false
    b.display.anatomyOverlayIds = a.display.anatomyOverlayIds
  } else if (practice === 'opacity') {
    const value = image(b, ctId)?.opacity
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return false
    image(b, ctId)!.opacity = image(a, ctId)!.opacity
  } else if (practice === 'window') {
    const display = image(b, mri)
    if (!display || !Number.isFinite(display.min) || !Number.isFinite(display.max) || display.min >= display.max) return false
    display.min = image(a, mri)!.min; display.max = image(a, mri)!.max
  } else return false
  return JSON.stringify(a) === JSON.stringify(b)
}
