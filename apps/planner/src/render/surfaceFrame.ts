import type { Vec3 } from '@brainana/planning-core/model.ts'

/** Rendering metadata only: never changes the extracted mesh coordinates. */
export function lockPreviewFrame(mesh: { extentsMin: number[] | number; extentsMax: number[] | number }, bounds: [Vec3, Vec3]) {
  mesh.extentsMin = [...bounds[0]]; mesh.extentsMax = [...bounds[1]]
}
