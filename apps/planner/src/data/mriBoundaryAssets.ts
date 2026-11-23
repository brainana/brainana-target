import type { MeshGeometry } from '../render/primitives.ts'
import type { Project } from '@brainana/planning-core/model.ts'
import type { MRISurfaceSave } from '../ui/mriSurfaceEditor.ts'
import { binarySTL } from './stl.ts'
import { createAsset, type AssetBytes } from './assets.ts'

/** Publish mesh, native-grid boundary labels and the exact recipe as one project update. */
export async function mriBoundaryAssets(project: Project, bytes: AssetBytes, value: MRISurfaceSave) {
  if (!project.assets.some(a => a.id === value.settings.sourceAssetId)) throw Error('The source MRI changed. Reopen the surface editor.')
  const recipe = structuredClone(value.settings), nextBytes = new Map(bytes)
  const data = binarySTL(value.geometry)
  const surface = await createAsset(recipe.method === 'brain-envelope' ? 'MRI-cortical-envelope.stl' : ['dark-band', 'dark-band-head'].includes(recipe.method) ? 'MRI-dark-band-boundary.stl' : 'MRI-estimated-mounting-boundary.stl', 'surface', project.frame.id, data)
  const boundary = await createAsset('MRI-boundary-voxels.nii.gz', 'overlay', project.frame.id, value.boundary.file)
  const previous = project.assets.find(a => a.mriSurface?.sourceAssetId === recipe.sourceAssetId)
  if (previous) surface.id = previous.id
  if (previous?.mriSurface?.boundaryAssetId) boundary.id = previous.mriSurface.boundaryAssetId
  boundary.imageDisplay = { min: 1, max: 2, opacity: .55, colormap: 'gray', visible: true }
  recipe.boundaryAssetId = boundary.id
  let assets = project.assets.filter(a => a.id !== surface.id && a.id !== boundary.id)
  if (value.mask) {
    const mask = assets.find(a => a.id === value.mask!.assetId && a.role === 'mask') ?? await createAsset(value.mask.name, 'mask', project.frame.id, value.mask.bytes)
    if (!assets.some(a => a.id === mask.id)) assets.push(mask)
    nextBytes.set(mask.id, value.mask.bytes); recipe.maskAssetId = mask.id
  } else delete recipe.maskAssetId
  surface.surfaceKind = recipe.method === 'brain-envelope' ? 'brain' : 'skull'; surface.mriSurface = recipe
  assets.push(surface, boundary)
  assets = assets.filter(a => a.role !== 'mask' || assets.some(s => s.mriSurface?.maskAssetId === a.id)).map(a => a.imageDisplay?.skull ? { ...a, imageDisplay: { ...a.imageDisplay, skull: { ...a.imageDisplay.skull, useForPlanning: false } } } : a)
  nextBytes.set(surface.id, data); nextBytes.set(boundary.id, value.boundary.file)
  return { project: { ...project, assets, planningSurfaceIds: [surface.id], chambers: project.chambers.map(c => { const chamber = { ...c }; delete chamber.baseFit; return chamber }) }, bytes: nextBytes }
}


export interface CorticalEnvelopeSave {
  geometry: MeshGeometry
  sourceAssetIds: string[]
  offsetMm: number
}

export async function corticalEnvelopeAsset(project: Project, bytes: AssetBytes, value: CorticalEnvelopeSave) {
  const data = binarySTL(value.geometry)
  const surface = await createAsset('Cortical-envelope.stl', 'surface', project.frame.id, data)
  const previous = project.assets.find(a => a.corticalEnvelope)
  if (previous) surface.id = previous.id
  surface.surfaceKind = 'brain'
  surface.corticalEnvelope = { sourceAssetIds: [...value.sourceAssetIds], offsetMm: value.offsetMm }
  const assets = project.assets.filter(a => a.id !== surface.id).map(a => a.imageDisplay?.skull ? {
    ...a, imageDisplay: { ...a.imageDisplay, skull: { ...a.imageDisplay.skull, useForPlanning: false } },
  } : a)
  const nextBytes = new Map(bytes).set(surface.id, data)
  const chambers = project.chambers.map(({ baseFit: _fit, ...chamber }) => chamber)
  return { project: { ...project, assets: [...assets, surface], planningSurfaceIds: [surface.id], chambers }, bytes: nextBytes }
}
