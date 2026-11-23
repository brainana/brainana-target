import type { RuntimeClient } from '@brainana/core-client/runtimeClient.ts'
import type { Asset, Project } from '@brainana/planning-core/model.ts'
import { createProject, newId } from '@brainana/planning-core/model.ts'
import { createAsset } from './assets.ts'
import type { ProjectBundle } from './archive.ts'
export interface BrainanaManifest {
  id: string
  label: string
  scan: { id: string; stream: string; label: string }
  scans: Array<{ id: string; stream: string; label: string }>
  volumes: Array<{ key: string; label: string; url: string }>
  fullFov: { url: string; status: string | null } | null
  surfaces: { pial: { left: string; right: string } | null }
  atlases: Array<{ name: string; label: string; volume: string; labels: string | null }>
  warnings: string[]
}
export interface AtlasOption {
  name: string
  volume: string
  labels: string | null
}
export function chooseAnatomy(m: BrainanaManifest): string {
  if (m.scan.stream !== 'cross')
    throw new Error(
      "Choose images from a single scan session. A template made by combining scans from different dates does not represent one physical scan.",
    )
  const url = m.fullFov?.url ?? m.volumes.find((v) => v.key === 'mri/norm.mgz')?.url ?? m.volumes[0]?.url
  if (!url) throw new Error('This reconstruction has no anatomical volume')
  return url
}
export function sourcePath(url: string): string | null {
  if (url.startsWith('data:')) return null
  const match = /^\/brainana-data\/[^/]+\/(.*)$/.exec(url)
  return match ? decodeURIComponent(match[1]) : null
}
export async function fetchAsset(
  client: RuntimeClient,
  url: string,
  role: Asset['role'],
  frameId: string,
): Promise<{ asset: Asset; bytes: Uint8Array }> {
  const response = await client.apiFetch(url)
  if (!response.ok) throw new Error(`Cannot load ${url}: ${response.status}`)
  const path = sourcePath(url),
    name = path?.split('/').at(-1) ?? `${role}.nii.gz`
  const bytes = new Uint8Array(await response.arrayBuffer())
  return { asset: await createAsset(name, role, frameId, bytes, path), bytes }
}
export async function importBrainana(
  client: RuntimeClient,
  m: BrainanaManifest,
  sourceRoot: string | null,
): Promise<ProjectBundle> {
  const frameId = newId(),
    anatomy = await fetchAsset(client, chooseAnatomy(m), 'anatomy', frameId)
  const project: Project = createProject(anatomy.asset, `${m.label} · ${m.scan.label}`, {
    kind: 'brainana',
    subject: m.id,
    scan: m.scan.id,
    sourceRoot,
  })
  const bytes = new Map([[anatomy.asset.id, anatomy.bytes]])
  if (m.surfaces.pial) {
    for (const url of [m.surfaces.pial.left, m.surfaces.pial.right]) {
      const item = await fetchAsset(client, url, 'surface', frameId)
      project.assets.push(item.asset)
      bytes.set(item.asset.id, item.bytes)
    }
  }
  return { project, bytes }
}

export async function importNmtDemo(client: RuntimeClient, sourceId: string): Promise<ProjectBundle> {
  const frameId = newId()
  const base = `/brainana-data/${sourceId}/nmt2sym/`
  const assets = new Map<string, ReturnType<typeof fetchAsset>>()
  const get = async (name: string, role: Asset['role']) => {
    let loading = assets.get(name)
    if (!loading) {
      loading = fetchAsset(client, base + name, role, frameId)
      assets.set(name, loading)
    }
    const item = await loading
    return { bytes: item.bytes, asset: { ...item.asset, id: newId() } }
  }
  const reference = await get('tpl-NMT2Sym_res-05_T1w.nii.gz', 'anatomy')
  const project = createProject(reference.asset, 'NMT2Sym macaque demo', {
    kind: 'brainana', subject: 'NMT2Sym', scan: 'res-05', sourceRoot: null,
  })
  project.species = 'macaque'
  const bytes = new Map([[reference.asset.id, reference.bytes]])
  const add = (item: { asset: Asset; bytes: Uint8Array }) => {
    project.assets.push(item.asset)
    bytes.set(item.asset.id, item.bytes)
    return item.asset
  }
  const layers = await Promise.all([
    get('tpl-NMT2Sym_res-05_T1w_brain.nii.gz', 'overlay'),
    get('tpl-NMT2Sym_res-05_brainmask.nii.gz', 'mask'),
    get('tpl-NMT2Sym_res-05_desc-MEBRAINS_CT.nii.gz', 'ct'),
    ...['lh', 'rh'].flatMap(side => ['pial', 'white'].map(layer => get(`${side}.${layer}.surf.gii`, 'surface'))),
  ])
  for (const item of layers) {
    const asset = add(item)
    if (asset.role === 'overlay') asset.modality = 'mri'
    if(asset.role==='ct'){
      asset.name='MEBRAINS CT estimate (warped to NMT2Sym).nii.gz'
      asset.modality='ct'
      asset.imageDisplay={min:350,max:650,opacity:.5,colormap:'gray',visible:true}
      asset.derivation={
        description:'Warped MEBRAINS population CT estimate aligned to NMT2Sym, with a larger field of view than the MRI to retain the skull crown. Brain MRI registration does not independently validate skull anatomy. Intensities are not calibrated Hounsfield units.',
        references:[{label:'MEBRAINS template and CT source',url:'https://doi.org/10.1162/imag_a_00077'},{label:'RheMAP template registration',url:'https://github.com/PRIME-RE/RheMAP'}],
      }
      project.display.anatomyOverlayIds=[asset.id]
    }
    if (asset.name.includes('.white.')) {
      asset.surfaceLayer = 'white'
      asset.imageDisplay = { min: 0, max: 1, colormap: 'gray', opacity: 1, visible: false }
    }
  }
  const atlasNames = ['ARM1', 'ARM2', 'ARM3', 'ARM4', 'ARM5', 'ARM6', 'D99', 'MacBNA', 'FuncNetwork']
  const atlases = await Promise.all(atlasNames.map(async name => {
    const [item, labels] = await Promise.all([
      get(`atlas-${name}_space-NMT2Sym_res-05.nii.gz`, 'atlas'),
      client.apiFetch(base + `atlas-${name}.tsv`),
    ])
    if (!labels.ok) throw new Error(`Demo atlas labels unavailable for ${name}.`)
    item.asset.atlasInfo = { name, tsv: await labels.text() }
    item.asset.imageDisplay = { min: 0, max: 1, opacity: 0.35, colormap: 'random', visible: false }
    return item
  }))
  atlases.forEach(add)
  project.display.atlasAssetId = atlases[6].asset.id
  const loadMap = async (source: string, name: string, min: number, max: number, colormap: string, valueFrame: number,
    thresholdFrame?: number, cutoff?: number, hemisphere?: 'lh' | 'rh') => {
    const item = await get(source, 'overlay')
    item.asset.name = `${name}${hemisphere ? ' · ' + hemisphere + '.func.gii' : '.nii.gz'}`
    item.asset.modality = 'functional'
    if (hemisphere) item.asset.functionalSurfaceId = project.assets.find(a => a.name === `${hemisphere}.pial.surf.gii`)!.id
    item.asset.imageDisplay = {
      min, max, colormap, opacity: 0.7, visible: false,
      functional: { valueFrame, thresholdFrame, cutoff, includeZero: thresholdFrame !== undefined },
    }
    return item
  }
  const maps = await Promise.all([
    loadMap('atlas-CortHierarchy_space-NMT2Sym_res-05.nii.gz', 'Cortical hierarchy', 0, 2, 'viridis', 0),
    loadMap('atlas-FuncConnGrad_space-NMT2Sym_res-05.nii.gz', 'Functional connectivity gradient', -2.3, 2.3, 'blue2red', 0),
    ...([undefined, 'lh', 'rh'] as const).flatMap(side => {
      const suffix = side ? `hemi-${side}.func.gii` : 'res-1.nii.gz'
      const retino = 'atlas-retinotopy_space-NMT2Sym_' + suffix
      return [
        loadMap(retino, 'Retinotopy polar angle', -Math.PI, Math.PI, 'brainana_polar_angle', 0, 1, 3, side),
        loadMap(retino, 'Retinotopy eccentricity', 0, 10, 'brainana_eccentricity', 2, 3, 3, side),
        loadMap('atlas-somatotopy_space-NMT2Sym_' + suffix, 'Somatotopy', 0, 100, 'brainana_somatotopy', 0, 1, 3, side),
      ]
    }),
  ])
  maps.forEach(add)
  return { project, bytes }
}
