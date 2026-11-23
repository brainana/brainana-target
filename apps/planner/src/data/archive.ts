import {calibrationCsv} from './calibrationExport.ts'
import {coordinateCsv} from './export.ts'
import {measurementCsv} from './measurementExport.ts'
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import { validateProject } from '@brainana/planning-core/validation.ts'
import type { Project } from '@brainana/planning-core/model.ts'
import { verifyAssets, type AssetBytes } from './assets.ts'
export interface ProjectBundle {
  project: Project
  bytes: AssetBytes
}
const portableAssetId=/^[a-zA-Z0-9_-]+$/
export async function packProject(project: Project, bytes: AssetBytes, progress:(label:string)=>void=()=>{}): Promise<Uint8Array> {
  progress('Checking project and source files…')
  const checked = validateProject(project)
  // Older applications ignore optional target metadata; prevent silently losing real ROI constraints.
  if(checked.targets.some(t=>!!t.region)||checked.electrodes.some(e=>e.direct||e.connector))checked.schemaVersion=2
  if(checked.assets.some(a=>!portableAssetId.test(a.id)))throw new Error('An image/model ID cannot be written to a portable project. Reimport the affected file before saving.')
  await verifyAssets(checked.assets, bytes)
  const files: Record<string, Uint8Array> = { 'project.json': strToU8(JSON.stringify(checked, null, 2)), 'coordinates.csv': strToU8(coordinateCsv(checked)), 'dimensions-and-coordinates.json': strToU8(JSON.stringify({referenceSha256:checked.assets.find(a=>a.id===checked.frame.referenceAssetId)?.sha256,frame:checked.frame,species:checked.species,stereotax:checked.stereotax,headposts:checked.headposts,chambers:checked.chambers,grids:checked.grids,electrodes:checked.electrodes,targets:checked.targets,landmarks:checked.landmarks,measurements:checked.measurements,frameCalibration:checked.frameCalibration,avoidRegions:checked.avoidRegions,surfaceOpenings:checked.surfaceOpenings},null,2)) }
  if(checked.measurements?.length)files['measurements.csv']=strToU8(measurementCsv(checked))
  if(checked.frameCalibration||checked.stereotax?.arms.some(a=>a.toolCalibration))files['calibration.csv']=strToU8(calibrationCsv(checked))
  for (const a of checked.assets) files[`assets/${a.id}`] = bytes.get(a.id)!
  progress('Packaging portable project…')
  return zipSync(files, { level: 0 }) // image payloads are often compressed already; predictable cost
}
export async function unpackProject(archive: Uint8Array): Promise<ProjectBundle> {
  // Only unpack project metadata and declared asset paths; retain duplicate/path checks.
  const seen=new Set<string>()
  const files = unzipSync(archive, {
    filter: (entry) => {
      const accepted=entry.name==='project.json'||entry.name.startsWith('assets/')&&portableAssetId.test(entry.name.slice(7))
      if(accepted){if(seen.has(entry.name))throw new Error('Project archive contains duplicate entries');seen.add(entry.name)}
      return accepted
    },
  })
  if (!files['project.json']) throw new Error('Not a Brainana Planner project')
  const project = validateProject(JSON.parse(strFromU8(files['project.json'])) as unknown)
  const bytes: AssetBytes = new Map(project.assets.map((a) => [a.id, files[`assets/${a.id}`]]))
  await verifyAssets(project.assets, bytes)
  return { project, bytes }
}
