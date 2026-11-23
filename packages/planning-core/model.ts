import type { StereotaxBasePlate } from './stereotaxSetup.ts'
import type { BiteBar, FrameDimensions, ManipulatorPreset, StereotaxPreset } from './stereotax.ts'
/** Numerical guardrail for custom shaft geometry, not a manufacturer specification. */
export const MAX_ELECTRODE_LENGTH_MM = 1000

/** Plain serializable domain objects. No DOM, NiiVue, source sessions, or file handles. */
export type Vec3 = [number, number, number]
export interface Pose {
  origin: Vec3
  angles: Vec3
} // intrinsic local X, Y, Z rotations in degrees
export interface SurfaceBrushStroke {
  mode: 'erase' | 'restore'
  normal: 0 | 1 | 2
  thicknessMm: number
  radius: number
  points: Vec3[]
}
export type AvoidanceConstraint = 'hard' | 'soft' | 'ignore'
export interface SurfaceOpening {
  constraint?: AvoidanceConstraint
  normal?: Vec3
  patch?: {pts: number[];tris: number[]}

  id: string
  name: string
  frameId: string
  assetId: string
  assetSha256: string
  surfaceKey: string
  center: Vec3
  radius: number
  origin: 'detected' | 'manual'
  measurement?: { diameter: number; minimumWidth: number; maximumWidth: number; resolutionMm: number; source: 'ct' | 'mesh' }
  reviewed: boolean
  avoid: boolean
}
export interface FunctionalFrames {
  valueFrame: number
  thresholdFrame?: number
  cutoff?: number
  includeZero?: boolean
}
export interface Asset {
  derivation?: { description:string; references:Array<{label:string;url:string}> }
  id: string
  name: string
  role: 'anatomy' | 'surface' | 'atlas' | 'ct' | 'overlay' | 'mask'
  frameId: string
  sha256: string
  sourcePath: string | null
  functionalSurfaceId?: string
  surfaceLayer?: 'white'
  imageDisplay?: {
    min: number
    max: number
    opacity: number
    colormap: string
    visible: boolean
    functional?: FunctionalFrames
    skull?: { edits?: SurfaceBrushStroke[]; smoothing?: { iterations: number; maximumDisplacementMm: number }; representation?: 'voxel' | 'isosurface' | 'smooth' | 'outer'; center?: Vec3; componentSeed?: Vec3; spacingMm?: number; components?: 'all' | 'largest'; threshold: number; bounds: [Vec3, Vec3]; show?: boolean; opacity?: number; useForPlanning?: boolean }
  }
  /** Reference-image role is independent of acquisition modality; missing means legacy MRI. */
  modality?: 'mri' | 'ct' | 'functional'
  surfaceKind?: 'skull' | 'brain'
  corticalEnvelope?: { sourceAssetIds: string[]; offsetMm: number }
  mriSurface?: {sourceAssetId:string;maskAssetId?:string;boundaryAssetId?:string;method:'brain-envelope'|'brain-dilate'|'head-erode'|'head-threshold'|'dark-band'|'dark-band-head';brainEstimate?:{threshold:number;seed:Vec3};darkBand?:{maximumIntensity:number;searchMm:number;minimumWidthMm:number;maximumWidthMm:number;minimumScalpMm:number;center?:Vec3;completion?:{enabled:boolean;maximumGapMm:number;smoothness:number}};offsetMm:number;threshold:number;spacingMm:number;largest:boolean;fillHoles:boolean;smooth:boolean;bounds:[Vec3,Vec3];edits?:SurfaceBrushStroke[]}
  atlasInfo?: { name: string; tsv: string | null }
}
export interface Target {
  region?:{kind:'sphere';radiusMm:number}|{kind:'voxels';centers:Vec3[];axes:[Vec3,Vec3,Vec3]}
  /** Display-only halo radius in physical mm; never a targeting tolerance. */
  displayRadiusMm?: number
  id: string
  name: string
  point: Vec3
  frameId: string
  color: string
  atlas: { name: string; label: string } | null
}
export interface Chamber {
  targetIds?: string[]
  mounting?: 'custom'|'cut'|'pedestal'|'acrylic'
  id: string
  name: string
  frameId: string
  pose: Pose
  innerRadius: number
  wallThickness: number
  height: number
  placementState?: 'unplaced'
  minimumWallHeight?: number
  baseFit?: {
    source: 'skull' | 'brain'
    assetIds: string[]
    gap: number
    maxAdditionalGap?: number
    innerDepths: number[]
    outerDepths: number[]
  }
}
export interface Grid {
  /** Flush seating follows tilt/thickness edits; manual permits an explicitly raised insert. */
  seating?: 'flush' | 'manual'
  /** Parallel guide-channel tilt relative to chamber −Z; direction is chamber-local azimuth. */
  tiltAngle?: number
  tiltAzimuth?: number
  /** Flat seating plane relative to chamber top and thin-edge wedge thickness (mm). */
  seatHeight?: number
  minimumThickness?: number
  holeDiameter?:number
  /** Explicitly permits searching alternative physical grid designs in a fixed chamber. */
  angleSearch?: {maximum:number;step:number;azimuthStep:number}

  enabled?: boolean
  id: string
  name: string
  chamberId: string
  spacing: number
  count: number
  rotation: number
}
/** Regular rigid layout; dimensions in mm. Saved with the project, independent of catalog updates. */
export interface ElectrodeHardware {
  presetId: string
  manufacturer: string
  model: string
  sources: string[]
  checkedAt: string
  notes: string
  modified: boolean
  shape: 'round' | 'blade'
  width: number
  thickness: number
  rows: number
  columns: number
  pitchX: number
  pitchY: number
  rotation: number
  selectedShank: number
  /** Per-shank physical lengths; empty uses the common usable length. */
  shankLengths: number[]
  /** Common shaft portion reserved above the grid; physical length = usable + reserved. */
  reservedLength?: number
  siteColumns: number
  sitePitchX: number
  /** Centre of first site measured back from the tip. */
  tipOffset: number
  recordingChannels: number
  /** Manufacturer order selections; descriptive fields do not imply modeled holder clearance. */
  configuration?: Record<string, string | number>
  /** Explicit site centres [x,y,distance back from tip], shared by shafts, in mm. */
  sitePositions?: Vec3[]
}
export interface Electrode {
  /** A skull-entry coordinate frame, independent of any chamber or grid. */
  direct?: { pose: Pose; unplaced?: boolean; preferredEntry?: Vec3 }
  connector?: { presetId: string; pose: Pose; unplaced?: boolean; shape: 'cylinder' | 'box'; width: number; depth: number; height: number; neckDiameter?: number; baseThickness?: number; sources: string[] }
  id: string
  name: string
  gridId: string
  hole: [number, number]
  depth: number
  /** Usable shaft length from grid plane; legacy projects default to 150 mm. */
  length?: number
  hardware?: ElectrodeHardware
  /** Coaxial single-shaft guide; distal depth is measured inward from the grid plane. */
  guideTube?: { innerDiameter: number; outerDiameter: number; length: number; tipDepth: number }
  diameter: number
  contactCount: number
  contactSpacing: number
  contactLength: number
  color: string
  targetId: string | null
}
export interface AvoidRegion {
  /** Independent fill stamps; unlike points, no connecting capsules. */
  stamps?: Vec3[]
  drawingMode?: 'volume' | 'surface'
  /** Surface-only painted triangles in RAS millimetres; no volumetric dilation. */
  surfacePatch?: { pts: number[]; tris: number[] }
  constraint?: AvoidanceConstraint
  /** Optional brush centreline: union of spheres and connecting capsules, in RAS mm. */
  points?: Vec3[]
  id: string
  name: string
  frameId: string
  center: Vec3
  radius: number
}
export interface PlanningSettings {
  avoidRegionIds?: string[]
  mode: 'new' | 'existing'
  seed: Vec3 | null
  searchRadius: number
  searchStep: number
  maxMiss: number
  margin: number
}
/** Explicit planning source; undefined preserves legacy automatic selection, [] disables it. */
export type PlanningIntent = 'chamber' | 'electrode' | 'combined' | 'headpost' | 'headpost-chamber' | 'headpost-combined' | 'direct' | 'headpost-direct'
export const chamberOnlyTask=(intent:PlanningIntent|undefined):boolean=>intent==='chamber'||intent==='headpost-chamber'
export interface Headpost {
 id:string;name:string;frameId:string;pose:Pose;avoid:boolean;existing:boolean;reference:string;
 postDiameter?:number;postHeight?:number;baseDiameter?:number;baseThickness?:number;
 mesh?:{pts:number[];tris:number[]};sourceName?:string
}
export interface StereotaxArm {
  toolCalibration?: import('./armCalibration.ts').ToolCalibration
  id?: string
  stageTravelMm?: Vec3
  stageXmm?: number; stageYmm?: number; stageZmm?: number
  toolTiltXDeg?: number; toolTiltYDeg?: number; holderLengthMm?: number; holderDiameterMm?: number
  model?: ManipulatorPreset
  postWidthMm?: number
  linkWidthMm?: number
  azimuthDeg?: number
  elevationDeg?: number
  side: 'left' | 'right'
  apMm: number
  heightMm: number
  reachMm: number
}
export interface Stereotax {
  basePlate?: StereotaxBasePlate
  showDetails?: boolean
  earTipCenterMm?: number
  earBlockOffsets?: { left: { apMm:number; heightMm:number }; right: { apMm:number; heightMm:number } }
  preset: StereotaxPreset | 'custom'
  dimensions?: FrameDimensions
  pose: Pose
  railDropMm: number
  earTipSpacingMm: number
  showEarBars?: boolean
  earBarId?: string
  earSupportSpanMm?: number
  railLateralMm?: number
  biteBar?: BiteBar
  arms: StereotaxArm[]
}
export const speciesLabels = {
  mouse: 'Mouse', rat: 'Rat', macaque: 'Macaque', 'tree-shrew': 'Tree shrew', marmoset: 'Marmoset', other: 'Other',
} as const
export type Species = keyof typeof speciesLabels
export function isCorticalEnvelope(asset: Asset): boolean {
  return !!asset.corticalEnvelope || asset.mriSurface?.method === 'brain-envelope'
}
export interface Project {
  frameCalibration?: import('./calibration.ts').FrameCalibration
  measurements?: import('./measurements.ts').DistanceMeasurement[]
  species?: Species
  landmarks?: Array<Pick<Target, 'id' | 'name' | 'point' | 'frameId'>>
  stereotax?: Stereotax
  headposts?:Headpost[]
  /** Missing in older projects means combined planning. */
  planningIntent?: PlanningIntent
  surfaceOpenings?: SurfaceOpening[]
  planningSurfaceIds?: string[]
  schemaVersion: 1 | 2
  id: string
  name: string
  createdAt: string
  updatedAt: string
  frame: { id: string; convention: 'RAS'; units: 'mm'; referenceAssetId: string }
  provenance: {
    kind: 'brainana' | 'standalone'
    subject: string | null
    scan: string | null
    sourceRoot: string | null
  }
  display: {
    setupOffsetMm?: Vec3
    gridPreviewHoles?:Array<{electrodeId:string;hole:[number,number]}>
    atlasVisible: boolean
    anatomyAssetId?: string
    anatomyOverlayIds?: string[]
    atlasAssetId?: string
  }
  assets: Asset[]
  targets: Target[]
  chambers: Chamber[]
  grids: Grid[]
  electrodes: Electrode[]
  avoidRegions?: AvoidRegion[]
  planning?: PlanningSettings
}
export function newId(): string {
  return crypto.randomUUID()
}
export function createProject(asset: Asset, name: string, provenance: Project['provenance']): Project {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    planningSurfaceIds: [],
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    frame: { id: asset.frameId, convention: 'RAS', units: 'mm', referenceAssetId: asset.id },
    provenance,
    display: { atlasVisible: true },
    assets: [asset],
    targets: [],
    chambers: [],
    grids: [],
    electrodes: [],
  }
}
export function addAssembly(project: Project, origin: Vec3): void {
  const chamber: Chamber = {
    id: newId(),
    name: `Chamber ${project.chambers.length + 1}`,
    frameId: project.frame.id,
    pose: { origin: [...origin], angles: [0, 0, 0] },
    innerRadius: 8,
    wallThickness: 1,
    height: 12,
  }
  const grid: Grid = {
    id: newId(),
    name: `Grid ${project.grids.length + 1}`,
    chamberId: chamber.id,
    spacing: 1,
    count: 15,
    rotation: 0,
  }
  project.chambers.push(chamber)
  project.grids.push(grid)
  project.electrodes.push({
    id: newId(),
    name: `Electrode ${project.electrodes.length + 1}`,
    gridId: grid.id,
    hole: [0, 0],
    depth: 30,
    diameter: 0.3,
    contactCount: 1,
    contactSpacing: 1,
    contactLength: 0.5,
    length: 150,
    color: '#67d9d1',
    targetId: null,
  })
}
