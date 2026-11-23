import { registerColormaps } from '@brainana/niivue-kit/colormaps.ts'
import { functionalBins, functionalLabelVolume, functionalSurfaceData, type FunctionalData } from './functionalMap.ts'
import { isCorticalEnvelope } from '@brainana/planning-core/model.ts'
import { anatomyCenter } from './stereotaxGeometry.ts'
import { installAnatomyCompositing } from './anatomyCompositing.ts'
import { installObjectDrag, type DraggableObject } from './objectDrag.ts'
import { IntersectionOverlay, hardwareIntersectionSurfaces } from './intersectionOverlay.ts'
import type { IntersectionSurface } from './intersections.ts'
import { headpostGeometry } from './headpostGeometry.ts'
import { fitHeadpostPose } from './headpostSlide.ts'
import {bytesView} from '../data/buffers.ts'
import { boundaryColors } from './boundaryVoxels.ts'
import {SceneMeshes} from './sceneMeshes.ts'
import {SceneParts,type ScenePart} from './sceneParts.ts'
import {avoidanceKey,geometryIdentity} from './avoidanceKey.ts'
import {defaultSceneColors,type SceneColors} from './colors.ts'
import { frameBounds, panCamera, applySliceLayout, installRenderZoom } from './camera.ts'
import { placementMap, nearestPlacement } from './placementMap.ts'
import { surfaceRay, raySurface } from './surfacePicking.ts'
import type { TriangleSurface } from '@brainana/planning-core/surface-fit.ts'
import { SurfaceRayIndex } from '@brainana/planning-core/surface-rays.ts'
import type { Candidate } from '@brainana/planning-core/optimization.ts'
import { ctSurfaceKey } from './ctSurfaceKey.ts'
import { ctDefaults } from './ctDefaults.ts'
import { buildCTSurface,disposeCTSurface } from './ctSurfaceBuilder.ts'
import { inspectSurface } from './surfaceInspection.ts'
import { type skullPreview, imageBounds } from './ctSkull.ts'
import { Niivue, NVImage, NVMesh, SLICE_TYPE, SHOW_RENDER } from '@niivue/niivue'
import { mat4, vec4 } from 'gl-matrix'
import type { Headpost, Pose, Project, Stereotax, Vec3 } from '@brainana/planning-core/model.ts'
import {add,length,scale,sub} from '@brainana/planning-core/geometry.ts'
import { buildLabelColortable, parseAtlasTsv, type AtlasLabel } from '@brainana/brainana-data/atlas.ts'
import type { ProjectBundle } from '../data/archive.ts'
import { anatomyViewerOptions, anatomySurfaceColor, ctSurfaceColor, defaultSceneDisplay, layerOpacity, type SceneDisplay, type SceneLayer } from './display.ts'
import {
  defaultCutaway,
  anatomyBounds,
  worldClipPlane,
  volumeClipPlane,
  anatomicalSection,
  clippedMeshShader,
  sectionMeshShader,
  type Cutaway,
} from './cutaway.ts'
import { indexAtlasRegions, type AtlasRegion } from './atlasRegions.ts'
import { VolumeSampler } from './volume.ts'
export interface PlanningRenderer {
  load(bundle: ProjectBundle): Promise<void>
  update(project: Project, selectedElectrode: string | null): void
  setAtlasVisible(visible: boolean): void
  moveCrosshair(p: Vec3): void
}
function instance(): Niivue {
  return new Niivue(anatomyViewerOptions())
}
export class NiiVuePlanningScene implements PlanningRenderer {
  colors:SceneColors={...defaultSceneColors}
  setColors(colors:SceneColors):void {this.colors={...colors};this.#geometryKey=''}
  #frameAll = false
  #setupOffset: Vec3 = [0, 0, 0]
  pan3D(right:number,up:number):void {this.render.position=panCamera(this.render,right,up);this.render.drawScene()}
  focus3D(all=false):void {this.#frameAll=all;this.render.position=[0,0,0];this.render.setScale(1);this.render.drawScene()}
  #placementCandidates: Candidate[] = []
  get hasPlacementCandidates(): boolean { return this.#placementCandidates.length > 0 }
  #placementParts: ReturnType<typeof placementMap> = []
  #placementSurfaceIndex: SurfaceRayIndex | null = null
  #placementPoint: Vec3 | null = null
  setPlacementSelection(point: Vec3 | null): void {this.#placementPoint=point;this.#geometryKey=''}
  #placementSpacing = 2
  #placementSources: TriangleSurface[] = []
  #indexedSurfaces: TriangleSurface[] = []
  #surfaceFitHandler: ((point:Vec3, normal:Vec3)=>void)|null=null
  #surfaceFitMiss?: ()=>void
  stereotaxPreview?: Stereotax
  #headpostPreview: Headpost | null = null
  setHeadpostPreview(post: Headpost | null): boolean {
    if (post === this.#headpostPreview) return false
    this.#headpostPreview = post
    return true
  }
  #headpostSlide: { post: Headpost; commit: (pose: Pose) => void; surface: SurfaceRayIndex } | null = null
  #cancelHeadpostGesture: (() => void) | undefined
  get headpostSlideId(): string | undefined { return this.#headpostSlide?.post.id }
  setHeadpostSlide(post: Headpost | null, commit?: (pose: Pose) => void): void {
    this.#cancelHeadpostGesture?.()
    this.#headpostSlide = null
    if (post && commit) {
      const surfaces = this.mountingSurface.surfaces
      if (!surfaces.length || post.mesh || post.existing) throw new Error('Use a dimensioned headpost and a finalized planning surface to slide it in 3D.')
      if(!this.#hardware.mesh(this.render,`headpost:${post.id}:0`)?.opacity)throw new Error('Show Headposts and raise Hardware opacity before dragging.')
      this.setSurfaceFitHandler(null)
      this.#headpostSlide = { post, commit, surface: this.#surfaceIndex(surfaces) }
    }
    if(this.renderCanvas.style)this.renderCanvas.style.cursor = this.#headpostSlide ? 'grab' : this.#surfaceFitHandler ? 'crosshair' : ''
  }
  get surfaceFitActive():boolean{return !!this.#surfaceFitHandler}
  setSurfaceFitHandler(handler:((point:Vec3, normal:Vec3)=>void)|null,onMiss?:()=>void):void{
    this.#surfaceFitHandler=handler
    this.#surfaceFitMiss=handler?onMiss:undefined
    this.renderCanvas.style.cursor=handler?'crosshair':this.#headpostSlide?'grab':''
    if(handler)this.#surfaceIndex(this.mountingSurface.surfaces)
  }
  fitHeadpostAt(point: Vec3, normal: Vec3, post: Headpost): Pose {
    return fitHeadpostPose(this.#surfaceIndex(this.mountingSurface.surfaces), {point, normal}, post.pose, post.baseDiameter! / 2)
  }
  #surfaceIndex(surfaces: TriangleSurface[]): SurfaceRayIndex {
    const cached=this.#indexedSurfaces
    if(!this.#placementSurfaceIndex||surfaces.length!==cached.length||surfaces.some((s,i)=>s.pts!==cached[i].pts||s.tris!==cached[i].tris)){
      this.#placementSurfaceIndex=new SurfaceRayIndex(surfaces)
      this.#indexedSurfaces=surfaces
    }
    return this.#placementSurfaceIndex
  }
  #placementSelect: ((candidate: Candidate) => void) | undefined
  #placementRevision = 0
  setPlacementMap(candidates: Candidate[], spacing: number, onSelect?: (candidate: Candidate) => void): void {
    const surfaces=this.mountingSurface.surfaces
    const sameSurface=surfaces.length===this.#placementSources.length&&surfaces.every((surface,i)=>surface.pts===this.#placementSources[i].pts&&surface.tris===this.#placementSources[i].tris)
    if((this.#placementCandidates===candidates&&this.#placementSpacing===spacing&&sameSurface)||(!candidates.length&&!this.#placementCandidates.length&&!this.#placementPoint)){
      this.#placementSelect=onSelect;return
    }
    if(!candidates.length)this.#placementPoint=null
    this.#placementCandidates=candidates;this.#placementSpacing=spacing;this.#placementSelect=onSelect
    this.#placementSources=surfaces
    if(candidates.length)this.#surfaceIndex(surfaces)
    this.#placementParts=candidates.length?placementMap(surfaces,candidates,spacing):[]
    this.#placementRevision++
    this.#geometryKey=''
  }
  readonly slices = instance()
  readonly render = instance()
  anatomy: VolumeSampler | null = null
  atlas: VolumeSampler | null = null
  atlasName = ''
  atlasRegions: AtlasRegion[] = []
  atlasOpacity = 0.3
  atlasOutline = false
  atlasIsolated: number | null = null
  atlasHidden = new Set<number>()
  atlasLabels = new Map<number, AtlasLabel>()
  crosshair: Vec3 = [0, 0, 0]
  onCrosshair: (p: Vec3) => void = () => {}
  onDrag: (delta: Vec3, commit: boolean) => void = () => {}
  dragEnabled = false
  dragChamberId?: string
  drawingEnabled = false
  brushRadius = 2
  brushMode: 'volume'|'surface' = 'volume'
  fillOutline = false
  updateAvoidanceSurfaces: () => void = () => {}
  readonly display = defaultSceneDisplay()
  readonly cutaway = defaultCutaway()
  #cutShader = 0
  #sectionShader = 0
  #section: NVMesh | null = null
  #displayMeshes: Array<{ mesh: NVMesh; layer: SceneLayer; opacity: number }> = []
  #surfaces: NVMesh[] = []
  #surfaceAssets: Project['assets'] = []
  #hardware=new SceneMeshes()
  #parts=new SceneParts()
  #currentParts: ScenePart[] = []
  readonly intersections = new IntersectionOverlay([this.render, this.slices])

  #updateIntersections(): void {
    if (!this.display.showIntersections) return
    const sources: IntersectionSurface[] = hardwareIntersectionSurfaces(this.#currentParts)
    this.#surfaces.forEach((mesh, i) => {
      if (isCorticalEnvelope(this.#surfaceAssets[i]) || this.#surfaceAssets[i]?.surfaceLayer === 'white') return
      const kind = this.#surfaceAssets[i]?.surfaceKind === 'skull' ? 'Skull' : 'Brain'
      if (mesh.tris?.length) sources.push({ pts: mesh.pts, tris: mesh.tris, group: kind, name: kind, anatomy: true })
    })
    for (const mesh of this.#ctMeshes) if (mesh.tris?.length && this.#shownCTMeshes.has(mesh))
      sources.push({ pts: mesh.pts, tris: mesh.tris, group: 'Skull', name: 'Skull', anatomy: true })
    this.intersections.update(true, sources)
  }
  #atlasImage: NVImage | null = null
  #displayedRegions: Project['avoidRegions'] = []
  #geometryKey = ''
  #atlasVisible = true
  constructor(
    readonly sliceCanvas: HTMLCanvasElement,
    readonly renderCanvas: HTMLCanvasElement,
  ) {
    installRenderZoom(this.render)
    const originalMvp = this.render.calculateMvpMatrix.bind(this.render)
    this.render.calculateMvpMatrix = (object, bounds, azimuth, elevation) => {
      const matrices = originalMvp(object, bounds, azimuth, elevation)
      if (this.#setupOffset.some(Boolean)) mat4.translate(matrices[0], matrices[0], this.#setupOffset)
      return matrices
    }
    const original=this.render.setPivot3D.bind(this.render)
    this.render.setPivot3D=()=>{
      original()
      if(this.#frameAll)return
      const volume=this.render.volumeObject3D
      if(volume?.extentsMin&&volume.extentsMax){frameBounds(this.render,[Array.from(volume.extentsMin) as Vec3,Array.from(volume.extentsMax) as Vec3]);return}
      const meshes=[...this.#surfaces,...this.#ctMeshes]
      if(!meshes.length)return
      const lo:Vec3=[Infinity,Infinity,Infinity],hi:Vec3=[-Infinity,-Infinity,-Infinity]
      for(const mesh of meshes)for(let i=0;i<mesh.pts.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],mesh.pts[i+k]);hi[k]=Math.max(hi[k],mesh.pts[i+k])}
      if([...lo,...hi].every(Number.isFinite))frameBounds(this.render,[lo,hi])
    }
  }
  #planningAssets: Project['assets'] = []
  #selectedSurfaceIds: string[] | undefined
  #preparedCT = new Map<string, {key: string; geometry: ReturnType<typeof skullPreview>}>()
  prepareCTPreview(id: string, key: string, geometry: ReturnType<typeof skullPreview>): void { this.#preparedCT.set(id, {key, geometry}) }
  ctSurfaceGeometry(id: string, key: string, sourceSha: string): ReturnType<typeof skullPreview> | null {
    const cached = this.#ctPreviewCache.get(id)
    return cached?.key === key && cached.sourceSha === sourceSha ? cached.geometry : null
  }
  #surfaceReports = new WeakMap<object, ReturnType<typeof inspectSurface>>()
  get surfaceCandidates() {
    const entries: Array<{asset: Project['assets'][number]; mesh: NVMesh | undefined; kind: 'skull' | 'brain'; origin: 'mesh' | 'ct'}> = this.#surfaceAssets.flatMap((a, i) => a.surfaceLayer === 'white' ? [] : [{ asset: a, mesh: this.#surfaces[i], kind: a.surfaceKind ?? 'brain', origin: 'mesh' as const }])
    for (const asset of this.#planningAssets.filter(a => a.role === 'ct' || a.modality === 'ct')) {
      const settings = asset.imageDisplay?.skull, entry = this.#ctPreviewCache.get(asset.id)
      const key = settings && ctSurfaceKey(settings)
      entries.push({ asset, mesh: entry && entry.key === key ? entry.mesh : undefined, kind: 'skull', origin: 'ct' })
    }
    return entries.map(entry => {
      const mesh = entry.mesh
      let inspection = mesh && this.#surfaceReports.get(mesh)
      if (mesh?.tris && !inspection) { inspection = inspectSurface({ pts: mesh.pts, tris: mesh.tris }); this.#surfaceReports.set(mesh, inspection) }
      let overlapsImage: boolean | null = null
      if (inspection?.valid && this.anatomy) {
        const bounds = imageBounds(this.anatomy)
        overlapsImage = [0, 1, 2].every(i => inspection!.bounds[1][i] >= bounds[0][i] && inspection!.bounds[0][i] <= bounds[1][i])
      }
      return { id: entry.asset.id, name: entry.asset.name, kind: entry.kind, origin: entry.origin as 'mesh' | 'ct', inspection, overlapsImage,
        ready: !!mesh?.tris && !!inspection?.valid && overlapsImage !== false,
        geometry: mesh?.tris ? { outerEnvelope: isCorticalEnvelope(entry.asset) || entry.asset.imageDisplay?.skull?.representation === 'outer'||['dark-band','dark-band-head'].includes(entry.asset.mriSurface?.method??''), pts: mesh.pts, tris: mesh.tris } : null }
    })
  }
  get stereotaxCenter(): Vec3 {
    const brain = this.#surfaces.filter((_, i) => this.#surfaceAssets[i]?.surfaceKind !== 'skull' && this.#surfaceAssets[i]?.surfaceLayer !== 'white' && !isCorticalEnvelope(this.#surfaceAssets[i]))
    const skull = [...this.#surfaces, ...this.#shownCTMeshes]
    return anatomyCenter(brain.length ? brain : skull, this.anatomy ? imageBounds(this.anatomy) : [this.crosshair, this.crosshair])
  }
  get mountingSurface() {
    const candidates = this.surfaceCandidates.filter(c => c.ready)
    const importedSkull = candidates.filter(c => c.kind === 'skull' && c.origin === 'mesh')
    const ct = candidates.filter(c => c.origin === 'ct' && this.#planningCT.has(c.id))
    const automatic = importedSkull.length ? importedSkull : ct.length ? ct : candidates.filter(c => c.kind === 'brain' && !this.#surfaceAssets.some(a => a.id === c.id && isCorticalEnvelope(a)))
    const selected = this.#selectedSurfaceIds === undefined ? automatic : candidates.filter(c => this.#selectedSurfaceIds!.includes(c.id) && (c.origin !== 'ct' || this.#planningCT.has(c.id)))
    return { source: selected.some(c => c.kind === 'skull') ? 'skull' as const : 'brain' as const,
      assetIds: selected.map(c => c.id), surfaces: selected.map(c => c.geometry!) }
  }

  #surfacePointCache:{sources:ArrayLike<number>[];value:Float32Array}|null=null
  get placementSurface(): ArrayLike<number> | null {
    const selected = this.mountingSurface.surfaces
    if (!selected.length) return null
    const cached=this.#surfacePointCache
    if(cached&&cached.sources.length===selected.length&&selected.every((mesh,i)=>mesh.pts===cached.sources[i]))return cached.value
    const points = new Float32Array(selected.reduce((n, mesh) => n + mesh.pts.length, 0))
    let offset = 0
    for (const mesh of selected) {
      points.set(mesh.pts, offset)
      offset += mesh.pts.length
    }
    this.#surfacePointCache={sources:selected.map(mesh=>mesh.pts),value:points}
    return points
  }
  get unitsSpecified(): boolean {
    return ((this.anatomy?.image.hdr?.xyzt_units ?? 2) & 7) !== 0
  }
  #slicePlane=0
  #sliceLayout='column'
  #attached=false
  get attached():boolean{return this.#attached}
  setSliceLayout(mode:string):void{
    this.#sliceLayout=mode
    if(!this.#attached)return
    applySliceLayout(this.slices,mode)
    this.#slicePlane=mode==='coronal'?1:mode==='sagittal'?2:0
  }
  panSlices(right:number,up:number):void{
    const tile=this.slices.screenSlices.find(t=>Number(t.axCorSag)===this.#slicePlane)??this.slices.screenSlices[0];if(!tile)return
    const [left,top,width,height]=tile.leftTopWidthHeight,x=left+width/2,y=top+height/2,mm=this.slices.screenXY2mm(x,y),dx=this.slices.screenXY2mm(x+16,y),dy=this.slices.screenXY2mm(x,y-16),pan=this.slices.scene.pan2Dxyzmm
    this.slices.setPan2Dxyzmm([...([0,1,2].map(k=>pan[k]+pan[3]*((dx[k]-mm[k])*right+(dy[k]-mm[k])*up))),pan[3]])
    this.onCrosshair(this.crosshair)
  }
  voxelAt(point:Vec3){return this.anatomy?.voxelAt(point)??null}
  targetPaintId:string|undefined
  #targetPaint:((points:Vec3[])=>void)|null=null
  setTargetPaintHandler(handler:((points:Vec3[])=>void)|null,id?:string):void{this.#targetPaint=handler;this.targetPaintId=handler?id:undefined;this.sliceCanvas.style.cursor=handler?'crosshair':''}
  async attach(): Promise<void> {
    registerColormaps(this.slices)
    await Promise.all([
      this.slices.attachToCanvas(this.sliceCanvas),
      // The shell depth textures and 3D canvas must share the same sampling.
      this.render.attachToCanvas(this.renderCanvas, false),
    ])
    this.#attached=true
    let painting=false,last:Vec3|null=null,lastPlane:number|null=null
    const paint=(event:PointerEvent)=>{
      if(!this.#targetPaint||!painting)return
      event.preventDefault();event.stopImmediatePropagation()
      const rect=this.sliceCanvas.getBoundingClientRect(),x=(event.clientX-rect.left)*this.sliceCanvas.width/rect.width,y=(event.clientY-rect.top)*this.sliceCanvas.height/rect.height
      const tile=this.slices.screenSlices.find(t=>{const [left,top,width,height]=t.leftTopWidthHeight;return t.axCorSag<=SLICE_TYPE.SAGITTAL&&x>=left&&x<=left+width&&y>=top&&y<=top+height})
      if(!tile){last=null;lastPlane=null;return}
      if(lastPlane!==Number(tile.axCorSag))last=null
      lastPlane=Number(tile.axCorSag)
      const mm=this.slices.screenXY2mm(x,y),point=Array.from(mm).slice(0,3) as Vec3;if(!point.every(Number.isFinite)||!this.voxelAt(point)){last=null;return}
      const spacing=this.anatomy?Math.min(...this.voxelAt(point)!.axes.map(a=>Math.hypot(...a))):1
      const steps=last?Math.min(1000,Math.max(1,Math.ceil(Math.hypot(...sub(point,last))/(spacing*.5)))):1
      const from=last??point;this.#targetPaint(Array.from({length:steps},(_,i)=>add(from,scale(sub(point,from),(i+1)/steps))));last=point
    }
    this.sliceCanvas.addEventListener('pointerdown',e=>{if(this.#targetPaint&&e.button===0){painting=true;last=null;this.sliceCanvas.setPointerCapture(e.pointerId);paint(e)}},true)
    this.sliceCanvas.addEventListener('pointermove',e=>{const rect=this.sliceCanvas.getBoundingClientRect(),x=(e.clientX-rect.left)*this.sliceCanvas.width/rect.width,y=(e.clientY-rect.top)*this.sliceCanvas.height/rect.height;const tile=this.slices.screenSlices.find(t=>{const [a,b,w,h]=t.leftTopWidthHeight;return x>=a&&x<=a+w&&y>=b&&y<=b+h&&t.axCorSag<=SLICE_TYPE.SAGITTAL});if(tile)this.#slicePlane=tile.axCorSag;paint(e)},true)
    this.sliceCanvas.addEventListener('pointerup',e=>{if(painting){paint(e);painting=false;last=null}},true)
    this.sliceCanvas.addEventListener('pointercancel',()=>{painting=false;last=null},true)
    this.setSliceLayout(this.#sliceLayout)
    this.slices.opts.multiplanarShowRender = SHOW_RENDER.NEVER
    this.render.setSliceType(SLICE_TYPE.RENDER)
    this.render.setRenderAzimuthElevation(120, 20)
    this.slices.onLocationChange = (raw: unknown) => {
      const data = raw as { mm?: number[] }
      if (data.mm && data.mm.length >= 3 && data.mm.slice(0, 3).every(Number.isFinite)) {
        this.crosshair = data.mm.slice(0, 3) as Vec3
        this.onCrosshair(this.crosshair)
      }
    }
    // Native clip drags must not rotate the MRI independently of surface/hardware cuts.
    this.render.onClipPlaneChange = () => this.#applyVolumeCut()
    this.#cutShader = this.render.setCustomMeshShader(clippedMeshShader, 'Brainana cardinal cutaway')
    this.#sectionShader = this.render.setCustomMeshShader(sectionMeshShader, 'Brainana MRI section')
    installAnatomyCompositing(this.render, () => [...this.#surfaces, ...this.#ctMeshes], () => worldClipPlane(this.cutaway))
    this.#applyCutShaders()
    this.#installDrag()
  }
  #resetPlacement(): void {
    this.setHeadpostSlide(null)
    this.setObjectDrag(null)
    this.intersections.update(false, [])
    this.#currentParts = []
    this.#placementCandidates=[]
    this.#placementParts=[]
    this.#placementSources=[]
    this.#indexedSurfaces=[]
    this.#placementPoint=null
    this.#setupOffset=[0,0,0]
    this.#placementSurfaceIndex=null
    this.#placementSelect=undefined
    this.#surfaceFitHandler=null
    this.#surfaceFitMiss=undefined
    this.#headpostPreview=null
    this.stereotaxPreview=undefined
    this.#placementRevision++
    if(this.renderCanvas.style)this.renderCanvas.style.cursor=''
  }
  clear(): void {
    this.#resetPlacement()
    this.#loadGeneration++
    this.#atlasGeneration++
    this.#frameAll=false
    this.render.position=[0,0,0]
    this.render.volScaleMultiplier=1
    this.#imageGeneration++
    this.#imageSignature = ''
    this.#ctMeshes = []
    this.#planningAssets = []
    this.#selectedSurfaceIds = undefined
    this.#imageCache.clear()
    this.#functionalVolumes.clear()
    this.#functionalScalars.clear()
    this.#surfaceColors.clear()
    for(const sampler of this.#samplerCache.values())disposeCTSurface(sampler)
    this.#samplerCache.clear()
    this.#surfacePointCache=null
    this.#imageDefaults.clear()
    this.#ctPreviewCache.clear()
    this.#preparedCT.clear()
    this.#planningCT.clear()
    this.#viewSampler = null
    this.#renderImages.clear()
    this.#renderAssets = []
    this.#shownCTMeshes.clear()
    this.#activeAtlasAsset = ''
    this.drawingEnabled = false
    this.dragEnabled = false
    this.#surfaces = []
    for (const nv of [this.slices, this.render]) {
      for (const m of [...nv.meshes]) nv.removeMesh(m)
      for (const v of [...nv.volumes]) nv.removeVolume(v)
      nv.drawScene()
    }
    this.#hardware.clear()
    this.#parts.clear()
    this.#displayMeshes = []
    this.#section = null
    Object.assign(this.cutaway, defaultCutaway())
    this.#surfaceAssets = []
    this.#geometryKey = ''
    this.#displayedRegions = []
    this.#atlasImage = null
    this.anatomy = null
    this.atlas = null
    this.atlasName = ''
    this.atlasLabels.clear()
    this.atlasRegions = []
    this.atlasHidden.clear()
    this.crosshair = [0, 0, 0]
  }
  #imageSignature = ''
  #imageGeneration = 0
  #loadGeneration = 0
  #atlasGeneration = 0
  #functionalVolumes = new Map<string, { key: string; image: NVImage }>()
  #functionalScalars = new Map<string, FunctionalData>()
  #surfaceColors = new Map<string, string>()
  #imageCache = new Map<string, NVImage>()
  #samplerCache = new Map<string, VolumeSampler>()
  #imageDefaults = new Map<
    string,
    NonNullable<Project['assets'][number]['imageDisplay']>
  >()
  #planningCT = new Set<string>()
  #ctPreviewCache = new Map<string, { key: string; sourceSha: string; geometry: ReturnType<typeof skullPreview>; mesh: NVMesh }>()
  #ctMeshes: NVMesh[] = []
  #shownCTMeshes = new Set<NVMesh>()
  #viewSampler: VolumeSampler | null = null
  #renderImages = new Map<string, NVImage>()
  #renderAssets: import('@brainana/planning-core/model.ts').Asset[] = []
  #surfaceOpacity(asset: Project['assets'][number]): number {
    if (isCorticalEnvelope(asset)) return this.#selectedSurfaceIds?.includes(asset.id) && this.display.anatomyOpacity > 0 ? .18 : 0
    if (asset.surfaceLayer === 'white' && !this.#planningAssets.find(a => a.id === asset.id)?.imageDisplay?.visible) return 0
    return asset.surfaceKind === 'skull' ? this.display.skullOpacity : this.display.anatomyOpacity
  }
  #volumeOpacity(asset: import('@brainana/planning-core/model.ts').Asset): number {
    const ct = asset.role === 'ct' || asset.modality === 'ct'
    const surface = this.#surfaceAssets.some(a => !isCorticalEnvelope(a) && (ct ? a.surfaceKind === 'skull' : a.surfaceKind !== 'skull'))
    return surface || ct && this.#shownCTMeshes.size > 0 ? 0 : ct ? this.display.skullOpacity : this.display.anatomyOpacity
  }
  #sectionWindow = ''
  #activeAtlasAsset = ''
  get viewedAnatomy(): VolumeSampler | null {
    return this.#viewSampler ?? this.anatomy
  }
  defaultsForImage(id: string) {
    const value = this.#imageDefaults.get(id)
    return value ? { ...value } : undefined
  }
  imageForAsset(id: string): NVImage | undefined {
    return this.#imageCache.get(id)
  }
  surfaceVertexCount(id: string): number {
    return (this.#surfaces[this.#surfaceAssets.findIndex(a => a.id === id)]?.pts.length ?? 0) / 3
  }
  async #paintFunctionalSurfaces(bundle: ProjectBundle, generation: number): Promise<void> {
    const project = bundle.project
    for (const [i, surface] of this.#surfaceAssets.entries()) {
      const maps = project.assets.filter(a => a.functionalSurfaceId === surface.id && a.imageDisplay?.visible)
      const key = JSON.stringify(maps.map(a => [a.id, a.imageDisplay]))
      if (key === (this.#surfaceColors.get(surface.id) ?? '[]')) continue
      const mesh = this.#surfaces[i]
      const base = anatomySurfaceColor()
      const rgba = maps.length ? new Uint8Array(4 * mesh.pts.length / 3) : base
      if (maps.length) for (let j = 0; j < rgba.length; j += 4) rgba.set(base, j)
      for (const asset of maps) {
        let data = this.#functionalScalars.get(asset.id)
        if (!data) {
          data = await functionalSurfaceData(bundle.bytes.get(asset.id)!, mesh.pts.length / 3)
          if (generation !== this.#imageGeneration) return
          this.#functionalScalars.set(asset.id, data)
        }
        const settings = asset.imageDisplay!
        const bins = functionalBins(data, settings)
        const lut = this.render.colormap(settings.colormap)
        for (let j = 0; j < bins.length; j++) {
          if (!bins[j]) continue
          for (let c = 0; c < 3; c++)
            rgba[4 * j + c] = Math.round(rgba[4 * j + c] * (1 - settings.opacity) + lut[4 * bins[j] + c] * settings.opacity)
        }
      }
      mesh.rgba255 = rgba
      const gl = this.render.gl
      const activeVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null
      gl.bindVertexArray(mesh.vao)
      try { mesh.updateMesh(gl) } finally { gl.bindVertexArray(activeVao) }
      this.#surfaceColors.set(surface.id, key)
    }
  }
  async syncImages(bundle: ProjectBundle): Promise<void> {
    const p = bundle.project
    this.#planningAssets = p.assets
    this.#selectedSurfaceIds = p.planningSurfaceIds
    this.#planningCT = new Set(p.assets.filter(a => a.imageDisplay?.skull?.useForPlanning).map(a => a.id))
    this.#surfaceAssets.forEach((asset, i) => {
      if (isCorticalEnvelope(asset) || asset.surfaceLayer === 'white') this.#surfaces[i].opacity = this.#surfaceOpacity(asset)
    })
    const signature = JSON.stringify([
      p.planningSurfaceIds,
      p.display.anatomyAssetId,
      p.display.anatomyOverlayIds,
      p.display.atlasAssetId,
      p.display.atlasVisible,
      p.assets.map((a) => [a.id, a.imageDisplay]),
    ])
    if (signature === this.#imageSignature) return
    this.#imageSignature = signature
    const generation = ++this.#imageGeneration
    const selectedId = p.display.anatomyAssetId ?? p.frame.referenceAssetId
    const activeAtlas =
      p.assets.find((a) => a.id === p.display.atlasAssetId && a.role === 'atlas') ??
      p.assets.find((a) => a.role === 'atlas')
    try {
      if (activeAtlas && this.#activeAtlasAsset !== activeAtlas.id) {
        await this.setAtlas(
          bundle.bytes.get(activeAtlas.id)!,
          activeAtlas.name,
          activeAtlas.atlasInfo?.tsv ? parseAtlasTsv(activeAtlas.atlasInfo.tsv) : [],
          activeAtlas.atlasInfo?.name ?? activeAtlas.name,
          ()=>generation===this.#imageGeneration,
        )
        if (generation !== this.#imageGeneration) return
        this.#activeAtlasAsset = activeAtlas.id
      }
      const volumes: NVImage[] = [],
        meshes: NVMesh[] = []
      const assets = p.assets.filter(
        (a) => ['anatomy', 'ct', 'overlay', 'atlas'].includes(a.role) && a.id !== activeAtlas?.id
        && !a.functionalSurfaceId && (a.role !== 'atlas' || a.imageDisplay?.visible)
        && !(a.modality === 'functional' && a.imageDisplay?.visible === false),
      )
      for (const asset of assets) {
        let image = this.#imageCache.get(asset.id)
        if (!image) {
          image = await NVImage.loadFromFile({
            file: new File([bytesView(bundle.bytes.get(asset.id)!)], asset.name),
            name: asset.name,
            colormap: asset.role === 'atlas' ? 'random' : asset.modality === 'functional' ? 'hot' : 'gray',
          })
          if (generation !== this.#imageGeneration) return
          this.#imageCache.set(asset.id, image)
          if (!asset.imageDisplay?.functional) this.#samplerCache.set(asset.id, new VolumeSampler(image))
          this.#imageDefaults.set(asset.id, {
            min: asset.role === 'ct' || asset.modality === 'ct' ? ctDefaults(image).min : image.cal_min ?? 0,
            max: asset.role === 'ct' || asset.modality === 'ct' ? ctDefaults(image).max : image.cal_max ?? 1,
            opacity: asset.role === 'atlas' ? 0.3 : asset.role === 'ct' || asset.modality === 'ct' ? 0.85 : 0.5,
            colormap: image.colormap,
            visible: asset.id === selectedId || asset.modality === 'functional',
          })
          if (asset.role === 'atlas') {
            const labels = asset.atlasInfo?.tsv ? parseAtlasTsv(asset.atlasInfo.tsv) : []
            const regions = indexAtlasRegions(
              this.#samplerCache.get(asset.id)!,
              new Map(labels.map((l) => [l.id, l])),
            )
            image.hdr!.intent_code = 1002
            image.setColormapLabel(buildLabelColortable(regions.map((r) => r.label)))
          }
          if (p.assets.some(a => a.mriSurface?.boundaryAssetId === asset.id)) {
            image.hdr!.intent_code = 1002
            image.setColormapLabel(buildLabelColortable([
              { id: 1, name: 'Detected MRI boundary', region: '', hemi: '', color: [...boundaryColors.detected] },
              { id: 2, name: 'Reconstructed MRI boundary', region: '', hemi: '', color: [...boundaryColors.reconstructed] },
            ]))
          }
        }
        const settings = asset.imageDisplay ?? this.#imageDefaults.get(asset.id)!
        if (settings.functional) {
          const key = JSON.stringify([settings.min, settings.max, settings.colormap, settings.functional])
          let entry = this.#functionalVolumes.get(asset.id)
          if (entry?.key !== key) {
            entry = { key, image: functionalLabelVolume(image, settings, this.slices) }
            this.#functionalVolumes.set(asset.id, entry)
          }
          entry.image.opacity = settings.opacity
          volumes.push(entry.image)
          continue
        }
        if (image.colormap !== settings.colormap) image.colormap = settings.colormap
        // NiiVue's colormap setter recalibrates intensity: apply the user's window last.
        image.cal_min = settings.min
        image.cal_max = settings.max
        image.opacity =
          asset.id === selectedId
            ? 1
            : asset.role === 'anatomy' || asset.role === 'ct' || asset.modality === 'mri'
              ? p.display.anatomyOverlayIds?.includes(asset.id)
                ? settings.opacity
                : 0
              : settings.visible
                ? settings.opacity
                : 0
        volumes.push(image)
        if (asset.imageDisplay?.skull && (asset.imageDisplay.skull.show !== false || asset.imageDisplay.skull.useForPlanning)) {
          const key = ctSurfaceKey(asset.imageDisplay.skull)
          let entry = this.#ctPreviewCache.get(asset.id)
          if (entry?.key !== key || entry.sourceSha !== asset.sha256) {
            this.#ctPreviewCache.delete(asset.id)
            const prepared = this.#preparedCT.get(asset.id)
            const geometry = prepared?.key === key ? prepared.geometry : await buildCTSurface(
              this.#samplerCache.get(asset.id)!,
              asset.imageDisplay.skull.threshold,
              asset.imageDisplay.skull.bounds,
              asset.imageDisplay.skull,
            )
            if (generation !== this.#imageGeneration) return
            this.#preparedCT.delete(asset.id)
            entry = {
              key,
              sourceSha: asset.sha256,
              geometry,
              mesh: new NVMesh(
                geometry.pts,
                geometry.tris,
                asset.name + ' skull preview',
                ctSurfaceColor(),
                settings.opacity,
                true,
                this.render.gl,
              ),
            }
            this.#ctPreviewCache.set(asset.id, entry)
          }
          entry.mesh.opacity = asset.imageDisplay.skull.show !== false ? this.display.skullOpacity : 0
          if (asset.imageDisplay.skull.show !== false) meshes.push(entry.mesh)
        }
      }
      if (generation !== this.#imageGeneration) return
      volumes.sort(
        (a, b) =>
          Number(b === this.#imageCache.get(selectedId)) - Number(a === this.#imageCache.get(selectedId)),
      )
      const ordered = [...volumes, ...(activeAtlas && this.#atlasImage ? [this.#atlasImage] : [])]
      if (this.slices.volumes.map((v) => v.id).join() !== ordered.map((v) => v.id).join()) {
        for (const v of [...this.slices.volumes]) this.slices.removeVolume(v)
        for (const v of ordered) this.slices.addVolume(v)
      }
      const cachedMeshes = [...this.#ctPreviewCache.values()].map((entry) => entry.mesh)
      for (const mesh of this.#ctMeshes) if (!cachedMeshes.includes(mesh)) this.render.removeMesh(mesh)
      for (const mesh of cachedMeshes) {
        if (!meshes.includes(mesh)) mesh.opacity = 0
        if (!this.#ctMeshes.includes(mesh)) this.render.addMesh(mesh)
      }
      this.#ctMeshes = cachedMeshes
      this.#shownCTMeshes = new Set(meshes)
      this.#updateIntersections()
      const selected = this.#imageCache.get(selectedId)
      if (selected) {
        this.#viewSampler = this.#samplerCache.get(selectedId)!
        const sectionWindow = JSON.stringify([selectedId, selected.cal_min, selected.cal_max])
        if (sectionWindow !== this.#sectionWindow) {
          this.#sectionWindow = sectionWindow
          this.setCutaway({}, true)
        }
        this.moveCrosshair(this.crosshair)
      }
      // 3D anatomy is independent of the slice underlay and its blend selection.
      this.#renderAssets = assets.filter(a => a.role === 'anatomy' || a.role === 'ct' || a.modality === 'mri')
      const renderVolumes = this.#renderAssets.map(asset => {
        const source = this.#imageCache.get(asset.id)!
        let rendered = this.#renderImages.get(asset.id)
        if (!rendered) {
          rendered = source.clone()
          this.#renderImages.set(asset.id, rendered)
        }
        if (rendered.colormap !== source.colormap) rendered.colormap = source.colormap
        rendered.cal_min = source.cal_min
        rendered.cal_max = source.cal_max
        rendered.opacity = this.#volumeOpacity(asset)
        return rendered
      })
      if (this.render.volumes.map(v => v.id).join() !== renderVolumes.map(v => v.id).join()) {
        for (const v of [...this.render.volumes]) this.render.removeVolume(v)
        for (const v of renderVolumes) this.render.addVolume(v)
      }
      const ids = new Set(p.assets.map(a => a.id))
      for (const cache of [this.#functionalVolumes, this.#functionalScalars, this.#imageCache])
        for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id)
      await this.#paintFunctionalSurfaces(bundle, generation)
      if (generation !== this.#imageGeneration) return
      this.setAtlasVisible(p.display.atlasVisible)
      this.slices.updateGLVolume()
      this.render.updateGLVolume()
      this.#applyCutShaders()
      this.render.drawScene()
    } catch (error) {
      if (generation === this.#imageGeneration) this.#imageSignature = ''
      throw error
    }
  }
  async load(bundle: ProjectBundle): Promise<void> {
    const generation=++this.#loadGeneration
    this.#imageGeneration++
    this.#atlasGeneration++
    const reference = bundle.project.assets.find((a) => a.id === bundle.project.frame.referenceAssetId)!
    const file = (id: string, name: string): File => new File([bytesView(bundle.bytes.get(id)!)], name)
    const image = await NVImage.loadFromFile({
      file: file(reference.id, reference.name),
      name: reference.name,
    })
    if(generation!==this.#loadGeneration)throw new DOMException('Project loading cancelled','AbortError')
    const sampler = new VolumeSampler(image)
    const meshes: NVMesh[] = []
    try {
      for (const a of bundle.project.assets.filter((a) => a.role === 'surface'))
        meshes.push(
          await NVMesh.loadFromFile({
            file: file(a.id, a.name),
            name: a.name,
            gl: this.render.gl,
            rgba255: isCorticalEnvelope(a) ? new Uint8Array([80, 205, 205, 255]) : anatomySurfaceColor(),
            opacity: isCorticalEnvelope(a) ? 0 : this.#surfaceOpacity(a),
          }),
        )
    } catch (error) {
      for (const m of meshes) m.unloadMesh(this.render.gl)
      throw error
    }
    if(generation!==this.#loadGeneration){for(const mesh of meshes)mesh.unloadMesh(this.render.gl);throw new DOMException('Project loading cancelled','AbortError')}
    this.#resetPlacement()
    this.#imageSignature = ''
    this.#imageGeneration++
    this.#imageCache.clear()
    this.#functionalVolumes.clear()
    this.#functionalScalars.clear()
    this.#surfaceColors.clear()
    for(const sampler of this.#samplerCache.values())disposeCTSurface(sampler)
    this.#samplerCache.clear()
    this.#surfacePointCache=null
    this.#imageDefaults.clear()
    this.#ctPreviewCache.clear()
    this.#preparedCT.clear()
    this.#planningCT.clear()
    this.#viewSampler = null
    this.#renderImages.clear()
    this.#renderAssets = []
    this.#shownCTMeshes.clear()
    this.#activeAtlasAsset = ''
    this.#ctMeshes = []
    this.#planningAssets = []
    this.#selectedSurfaceIds = undefined
    this.#surfaces = []
    for (const nv of [this.slices, this.render]) {
      for (const m of [...nv.meshes]) nv.removeMesh(m)
      for (const v of [...nv.volumes]) nv.removeVolume(v)
    }
    this.#hardware.clear()
    this.#parts.clear()
    this.#displayMeshes = []
    this.#geometryKey = ''
    this.#displayedRegions = []
    this.#section = null
    Object.assign(this.cutaway, defaultCutaway())
    this.#surfaces = meshes
    this.#surfaceAssets = bundle.project.assets.filter((a) => a.role === 'surface')
    this.anatomy = sampler
    this.atlas = null
    this.atlasLabels.clear()
    this.atlasRegions = []
    this.atlasHidden.clear()
    this.atlasName = ''
    this.#atlasImage = null
    this.#imageCache.set(reference.id, image)
    this.#samplerCache.set(reference.id, sampler)
    this.#imageDefaults.set(reference.id, {
      min: reference.modality === 'ct' ? ctDefaults(image).min : image.cal_min ?? 0,
      max: reference.modality === 'ct' ? ctDefaults(image).max : image.cal_max ?? 1,
      colormap: image.colormap,
      opacity: reference.modality === 'ct' ? 0.85 : 0.5,
      visible: true,
    })
    this.slices.addVolume(image)
    const volume = image.clone()
    volume.opacity = meshes.length ? 0 : this.display.anatomyOpacity
    this.render.addVolume(volume)
    for (const m of meshes) this.render.addMesh(m)
    this.moveCrosshair(Array.from(this.slices.frac2mm([0.5, 0.5, 0.5])).slice(0, 3) as Vec3)
    await this.syncImages(bundle)
    if(generation!==this.#loadGeneration)throw new DOMException('Project loading cancelled','AbortError')
    this.setCutaway({ axis: null })
    this.render.drawScene()
  }
  async setAtlas(bytes: Uint8Array, name: string, labels: AtlasLabel[], atlasName: string, current:()=>boolean=()=>true): Promise<boolean> {
    const generation=++this.#atlasGeneration
    const image = await NVImage.loadFromFile({
      file: new File([bytesView(bytes)], name),
      name,
      colormap: 'random',
      opacity: 0.3,
    })
    if(generation!==this.#atlasGeneration||!current())return false
    const sampler = new VolumeSampler(image)
    const regionLabels = new Map(labels.map((l) => [l.id, l]))
    const regions = indexAtlasRegions(sampler, regionLabels)
    if (!regions.length)
      throw new Error(
        "This atlas contains only background values (0), so there are no regions to display. Choose an atlas image that contains numbered regions.",
      )
    if (this.#atlasImage) this.slices.removeVolume(this.#atlasImage)
    this.#atlasImage = image
    this.atlas = sampler
    this.atlasName = atlasName
    this.atlasLabels = regionLabels
    this.atlasRegions = regions
    this.atlasOpacity = 0.3
    this.atlasOutline = false
    this.atlasIsolated = null
    this.atlasHidden.clear()
    image.hdr!.intent_code = 1002
    image.setColormapLabel(buildLabelColortable(this.atlasRegions.map((r) => r.label)))
    this.slices.opts.atlasOutline = 0
    this.slices.addVolume(image)
    return true
  }
  atlasReadout(p: Vec3): { name: string; label: string } | null {
    if (!this.atlas || !this.#atlasVisible) return null
    const value = this.atlas.sample(p, true)
    if (!Number.isFinite(value) || value === 0) return null
    const label = this.atlasLabels.get(Math.round(value))?.name ?? `Label ${value}`
    return { name: this.atlasName, label: label.replace(/_/g, ' ') }
  }
  setAtlasVisible(visible: boolean): void {
    const opacity = visible ? this.atlasOpacity : 0
    if (this.#atlasVisible === visible && (!this.#atlasImage || this.#atlasImage.opacity === opacity)) return
    this.#atlasVisible = visible
    if (this.#atlasImage) this.slices.setOpacity(this.slices.getVolumeIndexByID(this.#atlasImage.id), opacity)
  }
  setAtlasDisplay(patch: {
    opacity?: number
    outline?: boolean
    isolated?: number | null
    hidden?: number[]
  }): void {
    if (!this.#atlasImage) return
    if (patch.opacity !== undefined) this.atlasOpacity = Math.max(0, Math.min(1, patch.opacity))
    if (patch.outline !== undefined) this.atlasOutline = patch.outline
    if (patch.isolated !== undefined) this.atlasIsolated = patch.isolated
    if (patch.hidden !== undefined) this.atlasHidden = new Set(patch.hidden)
    const labels = this.atlasRegions.map((r) => r.label)
    this.#atlasImage.setColormapLabel(
      buildLabelColortable(labels, {
        hidden: new Set(
          labels
            .filter(
              (l) =>
                this.atlasHidden.has(l.id) || (this.atlasIsolated !== null && l.id !== this.atlasIsolated),
            )
            .map((l) => l.id),
        ),
      }),
    )
    this.#atlasImage.opacity = this.#atlasVisible ? this.atlasOpacity : 0
    this.slices.opts.atlasOutline = this.atlasOutline ? 1 : 0
    this.slices.updateGLVolume()
  }
  setAtlasLabels(labels: AtlasLabel[]): void {
    this.atlasLabels = new Map(labels.map((l) => [l.id, l]))
    this.atlasRegions = this.atlasRegions.map((r) => ({
      ...r,
      label: this.atlasLabels.get(r.label.id) ?? r.label,
    }))
    this.setAtlasDisplay({})
  }
  moveCrosshair(p: Vec3): void {
    this.slices.scene.crosshairPos = this.slices.mm2frac(p)
    this.slices.drawScene()
    this.crosshair = p.slice(0, 3) as Vec3
    this.onCrosshair(this.crosshair)
  }
  set3DDisplay(
    patch: Partial<Omit<SceneDisplay, 'layers'>> & { layers?: Partial<SceneDisplay['layers']> },
  ): void {
    for (const key of ['anatomyOpacity', 'skullOpacity', 'chamberOpacity', 'implantOpacity', 'stereotaxOpacity'] as const)
      if (patch[key] !== undefined && Number.isFinite(patch[key]))
        this.display[key] = Math.max(0, Math.min(1, patch[key]!))
    Object.assign(this.display.layers, patch.layers)
    if (patch.showIntersections !== undefined) {
      this.display.showIntersections = patch.showIntersections
      if (patch.showIntersections) this.#updateIntersections()
      else this.intersections.update(false, [])
    }
    if (patch.showOccludedGeometry !== undefined) {
      this.display.showOccludedGeometry = patch.showOccludedGeometry
      this.render.opts.meshXRay = patch.showOccludedGeometry ? 0.2 : 0
    }
    if (patch.enhanceElectrodes !== undefined) this.display.enhanceElectrodes = patch.enhanceElectrodes
    if (patch.anatomyOpacity !== undefined || patch.skullOpacity !== undefined) {
      this.#surfaces.forEach((mesh,i) => { mesh.opacity = this.#surfaceOpacity(this.#surfaceAssets[i]) })
      for(const mesh of this.#ctMeshes)mesh.opacity=this.#shownCTMeshes.has(mesh)?this.display.skullOpacity:0
      for (const asset of this.#renderAssets) {
        const image = this.#renderImages.get(asset.id)
        if (image) image.opacity = this.#volumeOpacity(asset)
      }
      this.render.updateGLVolume()
    }
    for (const { mesh, layer, opacity } of this.#displayMeshes)
      mesh.opacity = layerOpacity(this.display, layer, opacity)
    if (patch.stereotaxOpacity !== undefined || patch.layers?.stereotax !== undefined) {
      for (const mesh of this.#hardware.pickableMeshes(this.slices, 'stereotax:'))
        mesh.opacity = layerOpacity(this.display, 'stereotax', .65)
      this.slices.drawScene()
    }
    this.render.drawScene()
  }
  get cutawayBounds(): { min: Vec3; max: Vec3 } | null {
    return this.anatomy ? anatomyBounds(this.viewedAnatomy!) : null
  }
  setCutaway(patch: Partial<Cutaway>, forceSection = false): void {
    const previous = { ...this.cutaway }
    Object.assign(this.cutaway, patch)
    if (!Number.isFinite(this.cutaway.sectionOpacity)) this.cutaway.sectionOpacity = previous.sectionOpacity
    this.cutaway.sectionOpacity = Math.max(0, Math.min(1, this.cutaway.sectionOpacity))
    const cut = this.cutaway
    if (cut.axis !== null && this.anatomy) {
      const bounds = anatomyBounds(this.viewedAnatomy!)
      if (!Number.isFinite(cut.position)) cut.position = this.crosshair[cut.axis]
      cut.position = Math.max(bounds.min[cut.axis], Math.min(bounds.max[cut.axis], cut.position))
    } else cut.axis = null
    this.#applyVolumeCut()
    const replaceSection =
      forceSection ||
      previous.axis !== cut.axis ||
      previous.position !== cut.position ||
      previous.showSection !== cut.showSection
    if (replaceSection || (!this.#section && cut.showSection && cut.axis !== null)) {
      if (cut.axis !== null && cut.showSection && this.anatomy) {
        const section = anatomicalSection(this.viewedAnatomy!, cut)
        if (this.#section) {
          this.#section.pts = section.pts
          this.#section.tris = section.tris
          this.#section.rgba255 = section.rgba
          this.#section.updateMesh(this.render.gl)
        } else {
          this.#section = new NVMesh(
            section.pts,
            section.tris,
            'MRI anatomical cross-section',
            new Uint8Array([255, 255, 255, 255]),
            cut.sectionOpacity,
            true,
            this.render.gl,
          )
          // NVMesh reserves a zero alpha in its constructor for tractography.
          // Install per-vertex alpha after constructing an ordinary surface mesh.
          this.#section.rgba255 = section.rgba
          this.#section.updateMesh(this.render.gl)
          this.#section.meshShaderIndex = this.#sectionShader
          this.render.meshes.push(this.#section)
        }
      }
    }
    if (this.#section) {
      this.#section.opacity = cut.sectionOpacity
      this.#section.visible = cut.axis !== null && cut.showSection
    }
    this.#applyCutShaders()
    this.render.drawScene()
  }
  #applyVolumeCut(): void {
    const cut = this.cutaway
    if (cut.axis === null || !this.anatomy) {
      // Keep NiiVue's disabled-plane sentinel: volume refresh reads slot zero.
      this.render.scene.clipPlanes = [[0, 0, 0, 2]]
      this.render.scene.clipPlaneDepthAziElevs = [[2, 0, 0]]
      return
    }
    const dae = volumeClipPlane(this.viewedAnatomy!, cut),
      theta = ((dae[1] + 90) * Math.PI) / 180,
      phi = (-dae[2] * Math.PI) / 180
    // Set both representations without triggering an intermediate redraw.
    this.render.scene.clipPlaneDepthAziElevs = [dae]
    this.render.scene.clipPlanes = [
      [Math.cos(phi) * Math.cos(theta), Math.cos(phi) * Math.sin(theta), Math.sin(phi), dae[0]],
    ]
  }
  #applyCutShaders(): void {
    const active = this.cutaway.axis !== null
    for (const mesh of this.#surfaces) mesh.meshShaderIndex = active ? this.#cutShader : 0
    for (const mesh of this.#ctMeshes) mesh.meshShaderIndex = active ? this.#cutShader : 0
    for (const { mesh, layer } of this.#displayMeshes)
      mesh.meshShaderIndex =
        active && this.cutaway.clipHardware && layer !== 'targets' && layer !== 'avoidance' && layer !== 'stereotax'
          ? this.#cutShader
          : 0
    const shader = this.render.meshShaders[this.#cutShader]?.shader
    if (shader) {
      shader.use(this.render.gl)
      this.render.gl.uniform4fv(shader.uniforms.cutPlane, worldClipPlane(this.cutaway))
    }
  }
  update(p: Project, selectedElectrode: string | null, updateAvoidance = true): void {
    if (updateAvoidance) this.#displayedRegions = [...(p.avoidRegions??[])]
    p = { ...p, stereotax: this.stereotaxPreview ?? p.stereotax, avoidRegions: this.#displayedRegions }
    this.setAtlasVisible(p.display.atlasVisible)
    this.#setupOffset = p.display.setupOffsetMm ?? [0, 0, 0]
    const preview=this.#headpostPreview
    const key = JSON.stringify([
      preview ? [{...preview,mesh:undefined},geometryIdentity(preview.mesh)] : null,
      this.#placementRevision,
      this.#setupOffset,
      p.landmarks,
      avoidanceKey(p.avoidRegions??[]),
      p.surfaceOpenings?.map(({patch,...o})=>[o,geometryIdentity(patch)]),
      p.targets.map(({region,...t})=>[t,region?.kind==='voxels'?geometryIdentity(region):region]),
      p.stereotax,
      p.headposts?.map(({mesh,...h})=>[h,geometryIdentity(mesh)]),
      p.chambers,
      p.grids,
      p.electrodes,
      selectedElectrode,
      p.display.gridPreviewHoles,
      p.planning?.maxMiss,
      this.display.enhanceElectrodes,
    ])
    if (key === this.#geometryKey) return
    this.#geometryKey = key
    const bounds=this.anatomy?imageBounds(this.anatomy):null
    const parts=this.#parts.build(p,selectedElectrode,{
      colors:this.colors,enhanceElectrodes:this.display.enhanceElectrodes,surfaces:this.mountingSurface.surfaces,
      center:bounds?bounds[0].map((value,k)=>(value+bounds[1][k])/2) as Vec3:[0,0,0],
      placementPoint:this.#placementPoint,placementParts:this.#placementParts,headpostPreview:preview,
    })
    this.#currentParts = parts
    this.#displayMeshes=this.#hardware.update(this.render,parts,true,this.display)
    this.#hardware.update(this.slices,parts,false,this.display)
    this.#applyCutShaders()
    this.#updateIntersections()
    this.render.drawScene()
    this.slices.drawScene()
  }
  #installHeadpostSlide(): void {
    const canvas=this.renderCanvas
    let gesture: {
      pointer: number; update: (event: PointerEvent) => void;
      pose: Pose | null; restore: () => void; commit: (pose: Pose) => void;
    } | null=null
    let frame=0,last:PointerEvent|null=null
    const end=()=>{
      if(frame)cancelAnimationFrame(frame)
      frame=0;last=null
      const previous=gesture;gesture=null
      if(!previous)return
      previous.restore()
      if(canvas.hasPointerCapture(previous.pointer))canvas.releasePointerCapture(previous.pointer)
      canvas.style.cursor=this.#headpostSlide?'grab':''
    }
    this.#cancelHeadpostGesture=end
    canvas.addEventListener('pointerdown',event=>{
      const slide=this.#headpostSlide
      if(!slide||gesture||event.button!==0)return
      const mesh=this.#hardware.mesh(this.render,`headpost:${slide.post.id}:0`)
      if(!mesh||mesh.opacity<=0||!mesh.tris)return
      const rect=canvas.getBoundingClientRect()
      const viewport=[0,0,canvas.width,canvas.height]
      const matrix=this.render.calculateMvpMatrix(null,viewport,this.render.scene.renderAzimuth,this.render.scene.renderElevation)[0]
      const start:[number,number]=[event.clientX,event.clientY]
      const ray=surfaceRay(matrix,(start[0]-rect.left)/rect.width,(start[1]-rect.top)/rect.height)
      if(!ray)return
      const picked=raySurface({pts:mesh.pts,tris:mesh.tris},...ray)
      if(!picked||length(sub(picked,ray[0]))>slide.surface.distance(...ray)+.25)return
      event.preventDefault()
      event.stopImmediatePropagation()
      const base=this.render.calculateScreenPoint(slide.post.pose.origin,matrix,viewport)
      const offset:[number,number]=[start[0]-rect.left-base[0]/canvas.width*rect.width,start[1]-rect.top-base[1]/canvas.height*rect.height]
      const original=mesh.pts
      gesture={pointer:event.pointerId,pose:null,commit:slide.commit,
        restore:()=>{if(mesh.pts!==original){mesh.pts=original;mesh.updateMesh(this.render.gl);this.render.drawScene()}},
        update:move=>{
          if(!gesture||Math.hypot(move.clientX-start[0],move.clientY-start[1])<3)return
          const nextRay=surfaceRay(matrix,(move.clientX-rect.left-offset[0])/rect.width,(move.clientY-rect.top-offset[1])/rect.height)
          const hit=nextRay&&slide.surface.intersection(...nextRay)
          if(!hit)return
          const pose=fitHeadpostPose(slide.surface,hit,gesture.pose??slide.post.pose,slide.post.baseDiameter!/2)
          gesture.pose=pose
          mesh.pts=headpostGeometry({...slide.post,pose}).pts
          mesh.updateMesh(this.render.gl)
          this.render.drawScene()
        },
      }
      canvas.setPointerCapture(event.pointerId)
      canvas.style.cursor='grabbing'
    },true)
    canvas.addEventListener('pointermove',event=>{
      if(gesture?.pointer!==event.pointerId)return
      event.stopImmediatePropagation()
      event.preventDefault()
      last=event
      if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(last)gesture?.update(last)})
    },true)
    canvas.addEventListener('pointerup',event=>{
      const active=gesture
      if(active?.pointer!==event.pointerId)return
      event.stopImmediatePropagation()
      active.update(event)
      end()
      if(active.pose)active.commit(active.pose)
    },true)
    for(const eventName of ['pointercancel','lostpointercapture'])canvas.addEventListener(eventName,event=>{
      if(gesture?.pointer===(event as PointerEvent).pointerId)end()
    })
    // NiiVue still uses compatibility mouse/touch events to orbit.
    for(const eventName of ['mousedown','mousemove','touchstart','touchmove'])canvas.addEventListener(eventName,event=>{
      if(gesture)event.stopImmediatePropagation()
    },true)
  }
  #objectDrag?: (object: DraggableObject | null) => void
  setObjectDrag(prefix: string | null, drag?: Omit<DraggableObject, 'meshes'>): void {
    this.#objectDrag?.(prefix && drag ? { ...drag, meshes: () => {
      if (prefix !== 'anatomy:') return this.#hardware.pickable(this.render, prefix)
      return [...this.#surfaces, ...this.#shownCTMeshes].flatMap(mesh =>
        mesh.opacity > 0 && mesh.tris?.length ? [{ pts: mesh.pts, tris: mesh.tris }] : [])
    }, allowBackground: prefix === 'anatomy:' && ![...this.#surfaces, ...this.#shownCTMeshes].some(mesh => mesh.opacity > 0) } : null)
  }
  #installDrag(): void {
    this.#objectDrag = installObjectDrag(this.renderCanvas, this.render)
    this.#installHeadpostSlide()
    let clickStart: {x:number;y:number}|null=null
    this.renderCanvas.addEventListener('pointerdown',e=>{clickStart=e.button===0?{x:e.clientX,y:e.clientY}:null},true)
    this.renderCanvas.addEventListener('pointerup',e=>{
      const start=clickStart;clickStart=null
      if(!start||this.#headpostSlide||(!this.#placementSelect&&!this.#surfaceFitHandler)||this.dragEnabled||Math.hypot(e.clientX-start.x,e.clientY-start.y)>4)return
      const rect=this.renderCanvas.getBoundingClientRect(),nv=this.render
      const matrix=nv.calculateMvpMatrix(null,[0,0,this.renderCanvas.width,this.renderCanvas.height],nv.scene.renderAzimuth,nv.scene.renderElevation)[0]
      const ray=surfaceRay(matrix,(e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height)
      const normal: Vec3 = [0, 0, 0]
      const distance = ray ? this.#placementSurfaceIndex?.distance(...ray, Infinity, false, normal) : undefined
      const hit = ray && distance !== undefined && Number.isFinite(distance) ? add(ray[0], scale(ray[1], distance)) : null
      if(this.#surfaceFitHandler){
        if(hit)this.#surfaceFitHandler(hit,normal)
        else this.#surfaceFitMiss?.()
        return
      }
      if(hit){const candidate=nearestPlacement(this.#placementCandidates,hit,this.#placementSpacing);if(candidate)this.#placementSelect?.(candidate)}
    },true)
    let down: { world: Vec3; inverse: mat4; z: number; last: Vec3 } | null = null
    const unproject = (e: PointerEvent, inverse: mat4, z: number): Vec3 => {
      const rect = this.renderCanvas.getBoundingClientRect(),
        point = vec4.fromValues(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((e.clientY - rect.top) / rect.height) * 2,
          z,
          1,
        )
      vec4.transformMat4(point, point, inverse)
      return [point[0] / point[3], point[1] / point[3], point[2] / point[3]]
    }
    this.renderCanvas.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.dragEnabled || e.button !== 0) return
        e.stopImmediatePropagation()
        e.preventDefault()
        const nv = this.render,
          mvp = nv.calculateMvpMatrix(
            null,
            [0, 0, this.renderCanvas.width, this.renderCanvas.height],
            nv.scene.renderAzimuth,
            nv.scene.renderElevation,
          )[0]
        const inverse = mat4.invert(mat4.create(), mvp)
        if (!inverse) return
        // Camera-facing plane through the crosshair; dragging translates in physical millimetres.
        const center = nv.calculateScreenPoint(this.crosshair, mvp, [
          0,
          0,
          this.renderCanvas.width,
          this.renderCanvas.height,
        ])
        const world = unproject(e, inverse, center[2])
        down = { world, inverse, z: center[2], last: world }
        this.renderCanvas.setPointerCapture(e.pointerId)
      },
      true,
    )
    this.renderCanvas.addEventListener(
      'pointermove',
      (e) => {
        if (!down) return
        e.stopImmediatePropagation()
        e.preventDefault()
        const world = unproject(e, down.inverse, down.z)
        this.onDrag(sub(world, down.last), false)
        down.last = world
      },
      true,
    )
    const finish = (e: PointerEvent): void => {
      if (!down) return
      e.stopImmediatePropagation()
      down = null
      this.onDrag([0, 0, 0], true)
      if (this.renderCanvas.hasPointerCapture(e.pointerId))
        this.renderCanvas.releasePointerCapture(e.pointerId)
    }
    this.renderCanvas.addEventListener('pointerup', finish, true)
    this.renderCanvas.addEventListener('pointercancel', finish, true)
  }
}
