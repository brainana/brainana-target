import type { Headpost, Pose, Project, Vec3 } from '@brainana/planning-core/model.ts'
import type { ProjectStore } from '../state/store.ts'
export interface SceneTools {
  colors?:{gridBlocked:string;gridSafe:string;gridTarget:string;gridPreview:string}
  voxelAt?:(point:Vec3)=>{center:Vec3;axes:[Vec3,Vec3,Vec3]}|null
  targetPaintId?:string
  setTargetPaintHandler?:(handler:((points:Vec3[])=>void)|null,id?:string)=>void
  readonly mountingSurface: {
    source: 'brain' | 'skull'
    assetIds: string[]
    surfaces: import('@brainana/planning-core/surface-fit.ts').TriangleSurface[]
  }
  readonly surfaceFitActive?:boolean
  readonly headpostSlideId?:string
  setHeadpostSlide?: (post: Headpost | null, commit?: (pose: Pose) => void) => void
  setSurfaceFitHandler?: (handler:((point:Vec3, normal:Vec3)=>void)|null, onMiss?:()=>void)=>void
  setObjectDrag?: (prefix: string | null, drag?: Omit<import('../render/objectDrag.ts').DraggableObject, 'meshes'>) => void
  fitHeadpostAt?: (point: Vec3, normal: Vec3, post: Headpost) => Pose
  setPlacementSelection?: (point: Vec3 | null) => void
  setPlacementMap?: (candidates: import('@brainana/planning-core/optimization.ts').Candidate[], spacing: number, onSelect?: (candidate: import('@brainana/planning-core/optimization.ts').Candidate) => void) => void
  readonly placementSurface: ArrayLike<number> | null
  dragEnabled: boolean
  dragChamberId?: string
  drawingEnabled: boolean
  brushRadius: number
  brushMode?: 'volume' | 'surface'
  fillOutline?: boolean
  updateAvoidanceSurfaces: () => void
  unitsSpecified: boolean
  moveCrosshair: (point: Vec3) => void
  atlasReadout: (point: Vec3) => { name: string; label: string } | null
}
export interface FeatureContext {
  store: ProjectStore
  scene: SceneTools
  project: Project | null
  hasPlacementPreview: boolean
  previewReview?: (project: Project | null) => void
  previewHeadpost?: (post: Headpost | null) => void
  selectedElectrode: string | null
  selectElectrode: (id: string) => void
  edit: (change: (draft: Project) => void, group?: string) => void | boolean
  crosshair: () => Vec3
  previewPlacement: (project: Project | null, label?: string, apply?: () => void) => void
  refresh: () => void
  actions: {
    imagePanel: () => HTMLElement
    surfacePanel: () => HTMLElement
    addMRI: () => void
    addCT: () => void
    manageImages: () => void
    loadAnatomy: () => void
    loadCT: () => void
    loadBrainana: () => void
    loadDemo: () => void
    openAtlas: () => void
    loadAtlas: () => void
    loadSkullSurface: () => void
    prepareCTSurface?: () => void
    preparePlanningSurface?: () => void
    open: () => void
    save: () => void
    importBookmarks: () => void
    exportGeometry?: () => void
    exportCoordinates: () => void
    exportReport: () => void
    openStereotax?: () => void
    openReview?: () => void
    evaluatePlan?: () => void
  }
}
/** Explicit feature registry. A new panel depends on this context, never another panel. */
export interface PlannerFeature {
  id: string
  label: string
  glyph: string
  description: string
  render: (context: FeatureContext) => HTMLElement
}
