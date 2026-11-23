import type { Vec3 } from '@brainana/planning-core/model.ts'

/** Distinguish an adjustable crop from missing source-image coverage. */
export function ctCropFeedback(boundaryFaces: number[], bounds: [Vec3, Vec3], imageBounds: [Vec3, Vec3]): string {
  const image: string[] = [], crop: string[] = []
  boundaryFaces.forEach((count, face) => {
    if (!count) return
    const axis = Math.floor(face / 2), side = face % 2, value = bounds[side][axis]
    const label = `${['R', 'A', 'S'][axis]} ${side ? 'maximum' : 'minimum'} (${Number(value.toFixed(2))} mm)`
    ;(Math.abs(value - imageBounds[side][axis]) < 1e-4 ? image : crop).push(label)
  })
  return [
    image.length ? `Bone reaches the CT image boundary at ${image.join(', ')}. Open patches there may be caused by truncated image coverage. A wider crop cannot recover anatomy outside the CT; use a CT with a larger field of view.` : '',
    crop.length ? `Bone reaches the selected crop at ${crop.join(', ')}. Widen the crop to include that bone.` : '',
    image.length || crop.length ? 'Cut faces stay open; the app does not invent bone across them.' : '',
  ].filter(Boolean).join(' ')
}
