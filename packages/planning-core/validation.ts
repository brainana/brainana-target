import {validateCalibration} from './calibrationValidation.ts'
import { basePlatePresets, armStageLimits, adaptorTravel } from './stereotaxSetup.ts'
import { speciesLabels } from './model.ts'
import { biteBarFields, compatibleBiteAdaptors, compatibleEarBars, customFrameFields, frameDimensions, editableFrame, manipulatorPresets, singleRail, singleRailFields, stereotaxPresets } from './stereotax.ts'
import {headpostDimensionProblem,headpostReferences} from './headposts.ts'
import {electrodeAssembly} from './electrode-frame.ts'
import { MAX_ELECTRODE_LENGTH_MM } from './model.ts'
import type { Project } from './model.ts'
import {
  minimumInsertion,
  maximumInsertion,
  shankOffsets,
  siteSpan,
  gridCompatibility,
  shaftDiameter,
  hardwareFitsBore,
} from './hardware.ts'
import { gridHoles, holeLocal } from './geometry.ts'
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid project: ${message}`)
}
function object(v: unknown): asserts v is Record<string, unknown> {
  check(v !== null && typeof v === 'object' && !Array.isArray(v), 'expected an object')
}
function string(v: unknown): asserts v is string {
  check(typeof v === 'string' && v.length > 0 && v.length <= 4096, 'expected a nonempty string')
}
function number(v: unknown, min = -10000, max = 10000): asserts v is number {
  check(typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max, 'number outside supported range')
}
function vector(v: unknown, size = 3): asserts v is number[] {
  check(Array.isArray(v) && v.length === size, 'invalid vector')
  v.forEach((n) => number(n))
}
function nullableString(v: unknown): void {
  if (v !== null) string(v)
}
function color(v: unknown): void {
  check(typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v), 'invalid color')
}
const validSurfacePatches=new WeakSet<object>(),validOpeningPatches=new WeakSet<object>()
function validatePatch(input:unknown,opening:boolean):void {
 object(input)
 const immutable=Object.isFrozen(input)&&Object.isFrozen(input.pts)&&Object.isFrozen(input.tris),cache=opening?validOpeningPatches:validSurfacePatches
 if(immutable&&cache.has(input))return
 check(Array.isArray(input.pts)&&Array.isArray(input.tris)&&input.pts.length%3===0&&input.tris.length%3===0&&input.tris.length<=(opening?30000:600000),'invalid surface patch')
 if(opening)check(input.pts.length<=60000,'invalid opening patch points')
 const pts=input.pts as unknown[],tris=input.tris as unknown[]
 check(pts.every(v=>typeof v==='number'&&Number.isFinite(v)&&(!opening||Math.abs(v)<=100000))&&tris.every(v=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<pts.length/3),'invalid surface patch coordinates')
 if(immutable)cache.add(input)
}
function validateCorrections(strokes:unknown):void {
 check(Array.isArray(strokes)&&strokes.length<=2000,'too many surface correction strokes')
 let points=0
 for(const stroke of strokes){object(stroke);check(['erase','restore'].includes(String(stroke.mode)),'invalid surface brush mode');check([0,1,2].includes(stroke.normal as number),'invalid surface brush plane');number(stroke.radius,.05,50);number(stroke.thicknessMm,.01,20);check(Array.isArray(stroke.points)&&stroke.points.length>0,'empty surface brush stroke');points+=stroke.points.length;for(const p of stroke.points)vector(p)}
 check(points<=50000,'too many surface correction points')
}
/** Validate at file/DB boundaries, including referential integrity and actual grid membership. */
export function validateProject(input: unknown, copy = true): Project {
  object(input)
  check(input.schemaVersion === 1 || input.schemaVersion === 2, 'unsupported schema version')
  check(input.planningIntent === undefined || ['chamber','electrode','combined','headpost','headpost-chamber','headpost-combined','direct','headpost-direct'].includes(input.planningIntent as string), 'unsupported planning task')
  string(input.id)
  string(input.name)
  string(input.createdAt)
  string(input.updatedAt)
  check(
    Number.isFinite(Date.parse(input.createdAt)) && Number.isFinite(Date.parse(input.updatedAt)),
    'invalid timestamps',
  )
  object(input.frame)
  string(input.frame.id)
  string(input.frame.referenceAssetId)
  check(input.frame.convention === 'RAS' && input.frame.units === 'mm', 'unsupported coordinate convention')
  object(input.provenance)
  check(['brainana', 'standalone'].includes(String(input.provenance.kind)), 'invalid provenance')
  for (const key of ['subject', 'scan', 'sourceRoot']) nullableString(input.provenance[key])
  const ids = new Set<string>()
  for (const key of ['assets', 'targets', 'chambers', 'grids', 'electrodes', 'avoidRegions', 'surfaceOpenings']) {
    if (['avoidRegions','surfaceOpenings'].includes(key) && input[key] === undefined) continue
    check(Array.isArray(input[key]) && input[key].length <= (key==='surfaceOpenings'?2000:1000), `invalid ${key}`)
    for (const item of input[key]) {
      object(item)
      string(item.id)
      check(!ids.has(item.id), 'duplicate object id')
      ids.add(item.id)
      string(item.name)
    }
  }
  object(input.display)
  check(typeof input.display.atlasVisible === 'boolean', 'invalid atlas visibility')
  const p = input as unknown as Project
  if (p.display.setupOffsetMm !== undefined) vector(p.display.setupOffsetMm)
  if (p.landmarks !== undefined) {
    check(Array.isArray(p.landmarks) && p.landmarks.length <= 1000, 'invalid landmarks')
    for (const mark of p.landmarks) {
      object(mark); string(mark.id); string(mark.name); vector(mark.point)
      check(mark.frameId === p.frame.id && !ids.has(mark.id), 'invalid landmark frame or duplicate ID')
      ids.add(mark.id)
    }
  }
  if(p.measurements!==undefined){
    check(Array.isArray(p.measurements),'invalid measurement list')
    const point=(reference:unknown)=>{
      object(reference)
      check(['point','landmark','target','chamber-center','grid-origin','headpost-base','electrode-entry','electrode-tip','frame-zero','ear-left','ear-right','ear-midpoint','arm-tip','tool-tip'].includes(String(reference.kind)),'unknown measurement reference')
      if(reference.kind==='point'){string(reference.name);vector(reference.point)}
      else if(!['frame-zero','ear-left','ear-right','ear-midpoint'].includes(String(reference.kind)))string(reference.id)
    }
    for(const measurement of p.measurements){
      object(measurement);string(measurement.id);string(measurement.name)
      check(!ids.has(measurement.id),'duplicate measurement ID');ids.add(measurement.id)
      point(measurement.from);point(measurement.to);object(measurement.axes)
      check(['image','frame','chamber','grid','arm'].includes(String(measurement.axes.kind)),'unknown measurement axes')
      if(measurement.axes.kind!=='image'&&measurement.axes.kind!=='frame')string(measurement.axes.id)
      check(typeof measurement.visible==='boolean','invalid ruler visibility');color(measurement.color)
    }
  }
  for (const a of p.assets) {
    if(a.derivation!==undefined){
      object(a.derivation);string(a.derivation.description)
      check(Array.isArray(a.derivation.references),'invalid asset derivation references')
      for(const reference of a.derivation.references){
        object(reference);string(reference.label);string(reference.url)
        let url:URL;try{url=new URL(reference.url)}catch{throw new Error('Invalid project: invalid derivation reference URL')}
        check(url.protocol==='https:'||url.protocol==='http:','invalid derivation reference URL protocol')
      }
    }
    if (a.surfaceKind !== undefined)
      check(
        a.role === 'surface' && (a.surfaceKind === 'brain' || a.surfaceKind === 'skull'),
        'invalid surface type',
      )

    if (a.modality !== undefined)
      check(['mri', 'ct', 'functional'].includes(a.modality), 'invalid image modality')
    check(['anatomy', 'surface', 'atlas', 'ct', 'overlay','mask'].includes(a.role), 'unknown asset role')
    if (a.functionalSurfaceId !== undefined)
      check(a.role === 'overlay' && a.modality === 'functional' && p.assets.some(surface =>
        surface.id === a.functionalSurfaceId && surface.role === 'surface'), 'missing matching surface for functional map')
    if (a.surfaceLayer !== undefined)
      check(a.role === 'surface' && a.surfaceLayer === 'white', 'invalid surface layer')
    if (a.corticalEnvelope !== undefined) {
      const envelope = a.corticalEnvelope
      object(envelope)
      check(a.role === 'surface' && a.surfaceKind === 'brain' && !a.mriSurface, 'cortical envelope must be a brain-derived surface')
      check(Array.isArray(envelope.sourceAssetIds) && envelope.sourceAssetIds.length > 0 &&
        new Set(envelope.sourceAssetIds).size === envelope.sourceAssetIds.length &&
        envelope.sourceAssetIds.every(id => p.assets.some(source => source.id === id && source.role === 'surface'
          && source.surfaceKind !== 'skull' && !source.corticalEnvelope)), 'missing cortical envelope input surfaces')
      number(envelope.offsetMm, 0, 20)
    }
    if(a.mriSurface){
      const m=a.mriSurface;object(m);if(m.edits!==undefined)validateCorrections(m.edits);check(a.role==='surface'&&a.surfaceKind===(m.method==='brain-envelope'?'brain':'skull'),'MRI estimate requires surface asset')
      check(p.assets.some(source=>source.id===m.sourceAssetId&&(source.modality==='mri'||source.role==='anatomy'&&source.modality!=='ct')),'missing MRI surface source')
      if(m.maskAssetId!==undefined)check(p.assets.some(mask=>mask.id===m.maskAssetId&&mask.role==='mask'),'missing MRI input mask')
      if(m.boundaryAssetId!==undefined)check(p.assets.some(image=>image.id===m.boundaryAssetId&&image.role==='overlay'),'missing MRI boundary voxel image')
      check(['brain-envelope','brain-dilate','head-erode','head-threshold','dark-band','dark-band-head'].includes(m.method),'unknown MRI surface method')
      if(m.brainEstimate){object(m.brainEstimate);number(m.brainEstimate.threshold,-1e30,1e30);vector(m.brainEstimate.seed);check(['dark-band','brain-dilate','brain-envelope'].includes(m.method),'Brain-region estimate requires a brain-based method')}
      if(['brain-envelope','brain-dilate','head-erode','dark-band'].includes(m.method))check(!!m.maskAssetId||!!m.brainEstimate,'MRI method requires a mask')
      if(m.method==='dark-band'||m.method==='dark-band-head')check(!!m.darkBand,'missing dark-band settings')
      if(m.darkBand){const b=m.darkBand;object(b);number(b.maximumIntensity,-1e30,1e30);number(b.searchMm,2,50);number(b.minimumWidthMm,.05,50);number(b.maximumWidthMm,b.minimumWidthMm,50);number(b.minimumScalpMm,.05,b.searchMm);if(b.center!==undefined)vector(b.center)}
      if(m.darkBand?.completion){const c=m.darkBand.completion;object(c);check(typeof c.enabled==='boolean','invalid MRI gap reconstruction option');number(c.maximumGapMm,.5,40);number(c.smoothness,0,1)}
      number(m.offsetMm,0,m.method==='brain-envelope'?20:30);number(m.threshold,-1e30,1e30);number(m.spacingMm,.05,20)
      check(typeof m.largest==='boolean'&&typeof m.fillHoles==='boolean'&&typeof m.smooth==='boolean','invalid MRI cleanup options')
      check(Array.isArray(m.bounds)&&m.bounds.length===2,'invalid MRI crop');m.bounds.forEach(b=>vector(b));check(m.bounds[1].every((v,k)=>v>m.bounds[0][k]),'invalid MRI crop extent')
    }
    if (a.imageDisplay !== undefined) {
      object(a.imageDisplay)
      const display = a.imageDisplay
      number(display.min, -1e30, 1e30)
      number(display.max, -1e30, 1e30)
      check(display.max > display.min, 'Display maximum must exceed minimum')
      check(
        Number.isFinite(display.opacity) && display.opacity >= 0 && display.opacity <= 1,
        'invalid image opacity',
      )
      check(typeof display.visible === 'boolean', 'invalid image visibility')
      string(display.colormap)
      if (display.functional !== undefined) {
        const frames = display.functional
        object(frames)
        check(a.modality === 'functional' && Number.isInteger(frames.valueFrame), 'invalid functional value frame')
        number(frames.valueFrame, 0, 100000)
        if (frames.thresholdFrame !== undefined) {
          check(Number.isInteger(frames.thresholdFrame), 'invalid functional threshold frame')
          number(frames.thresholdFrame, 0, 100000)
        }
        if (frames.cutoff !== undefined) number(frames.cutoff, -1e30, 1e30)
        if (frames.includeZero !== undefined) check(typeof frames.includeZero === 'boolean', 'invalid zero-value display option')
      }
      if (display.skull) {
        if (display.skull.useForPlanning !== undefined)
          check(typeof display.skull.useForPlanning === 'boolean', 'invalid CT planning surface selection')
        if (display.skull.opacity !== undefined) number(display.skull.opacity, 0, 1)
        if (display.skull.show !== undefined)
          check(typeof display.skull.show === 'boolean', 'invalid skull preview visibility')
        if(display.skull.edits!==undefined)validateCorrections(display.skull.edits)
        if (display.skull.smoothing !== undefined) {
          const smoothing = display.skull.smoothing
          check(!!smoothing && Number.isSafeInteger(smoothing.iterations) && smoothing.iterations >= 0, 'invalid CT smoothing passes')
          check(Number.isFinite(smoothing.maximumDisplacementMm) && smoothing.maximumDisplacementMm >= 0, 'invalid CT smoothing movement')
        }
        if (display.skull.representation !== undefined) check(['voxel', 'isosurface', 'smooth', 'outer'].includes(display.skull.representation), 'invalid CT surface representation')
        if (display.skull.center !== undefined) vector(display.skull.center)
        if (display.skull.componentSeed !== undefined) vector(display.skull.componentSeed)
        if (display.skull.spacingMm !== undefined) check(Number.isFinite(display.skull.spacingMm) && display.skull.spacingMm >= 0.05 && display.skull.spacingMm <= 20, 'invalid CT surface spacing')
        if (display.skull.components !== undefined) check(['all', 'largest'].includes(display.skull.components), 'invalid CT component selection')
        number(display.skull.threshold, -1e30, 1e30)
        check(a.role === 'ct' || a.modality === 'ct', 'Skull preview requires CT')
        check(Array.isArray(display.skull.bounds) && display.skull.bounds.length === 2, 'invalid CT crop')
        for (const point of display.skull.bounds) vector(point)
        check(
          display.skull.bounds[0].every((v, i) => v < display.skull!.bounds[1][i]),
          'CT crop minimum must be below maximum',
        )
      }
    }
    check(a.frameId === p.frame.id, 'asset frame mismatch')
    check(/^[a-f0-9]{64}$/.test(a.sha256), 'invalid asset hash')
    nullableString(a.sourcePath)
    if (a.atlasInfo !== undefined) {
      object(a.atlasInfo)
      string(a.atlasInfo.name)
      check(a.atlasInfo.tsv === null || typeof a.atlasInfo.tsv === 'string', 'invalid atlas table')
    }
  }
  check(
    p.assets.some((a) => a.id === p.frame.referenceAssetId && a.role === 'anatomy'),
    'missing reference anatomy',
  )
  check(p.assets.filter((a) => a.role === 'anatomy').length === 1, 'expected one reference anatomy')
  if (p.display.anatomyOverlayIds !== undefined) {
    check(Array.isArray(p.display.anatomyOverlayIds), 'invalid anatomical overlays')
    for (const id of p.display.anatomyOverlayIds)
      check(
        p.assets.some(
          (a) => a.id === id && (a.role === 'anatomy' || a.role === 'ct' || a.modality === 'mri'),
        ),
        'missing anatomical overlay',
      )
  }
  if (p.display.anatomyAssetId !== undefined)
    check(
      p.assets.some(
        (a) =>
          a.id === p.display.anatomyAssetId &&
          (a.role === 'anatomy' || a.role === 'ct' || a.modality === 'mri'),
      ),
      'missing anatomical viewing image',
    )
  if (p.display.atlasAssetId !== undefined)
    check(
      p.assets.some((a) => a.id === p.display.atlasAssetId && a.role === 'atlas'),
      'missing active atlas',
    )
  for (const t of p.targets) {
    if (t.displayRadiusMm !== undefined) check(Number.isFinite(t.displayRadiusMm) && t.displayRadiusMm >= 0 && t.displayRadiusMm <= 20, 'target display radius must be between 0 and 20 mm')
    vector(t.point)
    check(t.frameId === p.frame.id, 'target frame mismatch')
    color(t.color)
    if (t.atlas !== null) {
      object(t.atlas)
      string(t.atlas.name)
      string(t.atlas.label)
    }
  }
  if(p.surfaceOpenings!==undefined){
    check(Array.isArray(p.surfaceOpenings)&&p.surfaceOpenings.length<=2000,'invalid surface opening list')
    const ids=new Set<string>()
    for(const o of p.surfaceOpenings){
      object(o);if(o.constraint!==undefined)check(['hard','soft','ignore'].includes(o.constraint),'invalid opening constraint');if(o.normal!==undefined){vector(o.normal);check(Math.hypot(...o.normal)>.5,'invalid opening normal')}
      if(o.patch!==undefined)validatePatch(o.patch,true)
      object(o);string(o.id);string(o.name);check(!ids.has(o.id),'duplicate surface opening');ids.add(o.id)
      check(!(p.avoidRegions??[]).some(r=>r.id===o.id),'opening and avoidance identifiers collide')
      check(o.frameId===p.frame.id,'surface opening frame mismatch');check(p.assets.some(a=>a.id===o.assetId&&(a.role==='ct'||a.modality==='ct')),'missing opening CT source')
      check(/^[a-f0-9]{64}$/.test(o.assetSha256),'invalid opening source hash');string(o.surfaceKey);vector(o.center);number(o.radius,.05,50)
      if(o.measurement!==undefined){const m=o.measurement;object(m);for(const value of [m.diameter,m.minimumWidth,m.maximumWidth])number(value,.001,200);number(m.resolutionMm,.001,100);check(m.minimumWidth<=m.maximumWidth,'invalid opening widths');check(['ct','mesh'].includes(m.source),'invalid opening measurement source')}
      check(['detected','manual'].includes(o.origin),'invalid opening origin');check(typeof o.reviewed==='boolean'&&typeof o.avoid==='boolean','invalid opening review')
    }
  }
  for (const region of p.avoidRegions ?? []) {
    if(region.constraint!==undefined)check(['hard','soft','ignore'].includes(region.constraint),'invalid avoidance constraint')
    vector(region.center)
    if(region.surfacePatch){
      check(region.drawingMode==='surface','surface patch requires surface mode')
      validatePatch(region.surfacePatch,false)
    }
    if(region.drawingMode!==undefined)check(['volume','surface'].includes(region.drawingMode),'invalid drawing mode')
    if(region.stamps!==undefined){check(Array.isArray(region.stamps)&&region.stamps.length<=16000,'too many fill stamps');region.stamps.forEach(p=>vector(p))}
    if (region.points !== undefined) {
      check(
        Array.isArray(region.points) && region.points.length > 0 && region.points.length <= 1024,
        'invalid brush stroke',
      )
      region.points.forEach((p) => vector(p))
    }
    number(region.radius, 0.1, 100)
    check(region.frameId === p.frame.id, 'avoidance region frame mismatch')
  }
  if (p.planningSurfaceIds !== undefined) {
    check(Array.isArray(p.planningSurfaceIds) && new Set(p.planningSurfaceIds).size === p.planningSurfaceIds.length, 'invalid planning surface selection')
    check(p.planningSurfaceIds.every(id => p.assets.some(a => a.id === id && (a.role === 'surface' || a.role === 'ct' || a.modality === 'ct'))), 'missing planning surface asset')
  }
  if (p.planning !== undefined) {
    object(p.planning)
    check(p.planning.mode === 'new' || p.planning.mode === 'existing', 'invalid planning mode')
    if (p.planning.avoidRegionIds !== undefined) check(Array.isArray(p.planning.avoidRegionIds) && p.planning.avoidRegionIds.every(id => typeof id === 'string' && (p.avoidRegions ?? []).some(r => r.id === id)), 'invalid selected avoidance areas')
    if (p.planning.seed !== null) vector(p.planning.seed)
    number(p.planning.searchRadius, 0, 50)
    number(p.planning.searchStep, 0.5, 10)
    number(p.planning.maxMiss, 0, 10)
    number(p.planning.margin, 0, 20)
  }
  if (input.species !== undefined) check(typeof input.species === 'string' && Object.hasOwn(speciesLabels, input.species), 'unknown species')
  if (input.stereotax !== undefined) {
    const rig = input.stereotax
    object(rig)
    check(rig.preset === 'custom' || typeof rig.preset === 'string' && Object.hasOwn(stereotaxPresets, rig.preset), 'unknown stereotaxic frame')
    if (rig.preset === 'custom' || rig.dimensions !== undefined && editableFrame(p.stereotax!.preset)) {
      object(rig.dimensions)
      for (const [, key, min, max] of customFrameFields) number(rig.dimensions[key], min, max)
      check(Number(rig.dimensions.posteriorMm) <= Number(rig.dimensions.lengthMm), 'rail length behind the ear bars exceeds total rail length')
      check(Number(rig.dimensions.widthMm) < Number(rig.dimensions.spacingMm), 'rails overlap at this spacing')
    }
    if(rig.showDetails!==undefined)check(typeof rig.showDetails==='boolean','invalid stereotax detail visibility')
    if(rig.basePlate!==undefined){
      const plate=rig.basePlate;object(plate)
      check(plate.preset==='custom'||typeof plate.preset==='string'&&Object.hasOwn(basePlatePresets,plate.preset),'unknown stereotax base plate')
      check(typeof plate.show==='boolean','invalid base plate visibility')
      for(const key of ['widthMm','lengthMm','thicknessMm','earHeightMm'])check(typeof plate[key]==='number'&&Number.isFinite(plate[key])&&Number(plate[key])>0,'invalid base plate dimension')
      check(typeof plate.posteriorMm==='number'&&Number.isFinite(plate.posteriorMm),'invalid base plate ear-axis position')
    }
    if(rig.earTipCenterMm!==undefined)number(rig.earTipCenterMm,-500,500)
    if(rig.earBlockOffsets!==undefined){
      object(rig.earBlockOffsets)
      for(const side of ['left','right']){object(rig.earBlockOffsets[side]);number(rig.earBlockOffsets[side].apMm,-500,500);number(rig.earBlockOffsets[side].heightMm,-200,200)}
    }
    const dimensions = frameDimensions(p.stereotax!)
    object(rig.pose)
    vector(rig.pose.origin)
    vector(rig.pose.angles)
    number(rig.railDropMm, -200, 200)
    for (const [, key, min, max] of singleRailFields) {
      if (rig[key] !== undefined) number(rig[key], min, max)
    }
    const maxEarSpacing = singleRail(p.stereotax!.preset) ? Number(rig.earSupportSpanMm ?? dimensions.spacingMm) : dimensions.spacingMm - dimensions.widthMm
    number(rig.earTipSpacingMm, 0, maxEarSpacing - (singleRail(p.stereotax!.preset) ? .1 : 0))
    check(Math.abs(Number(rig.earTipCenterMm??0))+Number(rig.earTipSpacingMm)/2<=maxEarSpacing/2,'ear tips extend beyond the support blocks')
    if (rig.showEarBars !== undefined) check(typeof rig.showEarBars === 'boolean', 'invalid ear-bar visibility')
    if (rig.earBarId !== undefined)
      check(compatibleEarBars(p.stereotax!.preset).some(bar => bar.id === rig.earBarId), 'ear bars do not match this frame')
    if (rig.biteBar !== undefined) {
      const bite = rig.biteBar
      object(bite)
      check(compatibleBiteAdaptors(p.stereotax!.preset).some(adaptor => adaptor.id === bite.adaptorId), 'bite-bar adaptor does not match this frame')
      for (const [, key, min, max] of biteBarFields) number(bite[key], min, max)
      if(bite.apOffsetMm!==undefined){const range=adaptorTravel(String(bite.adaptorId))?.ap??1000;number(bite.apOffsetMm,-range/2,range/2)}
    }
    check(Array.isArray(rig.arms) && rig.arms.length <= 4, 'use up to four stereotaxic arms')
    const armIds=new Set<string>()
    for (const arm of rig.arms) {
      object(arm)
      if(arm.id!==undefined){string(arm.id);check(!armIds.has(arm.id),'duplicate arm ID');armIds.add(arm.id)}
      check(arm.side === 'left' || arm.side === 'right', 'invalid stereotaxic arm rail')
      number(arm.apMm, -dimensions.posteriorMm, dimensions.lengthMm - dimensions.posteriorMm)
      number(arm.heightMm, 1, 200)
      number(arm.reachMm, 0, 200)
      if (arm.model !== undefined) check(typeof arm.model === 'string' && Object.hasOwn(manipulatorPresets, arm.model), 'unknown manipulator model')
      if(arm.stageTravelMm!==undefined){vector(arm.stageTravelMm);check(arm.stageTravelMm.every(value=>Number(value)>=0),'invalid custom stage travel')}
      const limits=armStageLimits(arm as unknown as import('./model.ts').StereotaxArm)
      for(const [i,key] of ['stageXmm','stageYmm','stageZmm'].entries())if(arm[key]!==undefined){number(arm[key],-1000,1000);if(arm.model)check(Math.abs(Number(arm[key]))<=limits[i]/2,'manipulator stage exceeds published travel')}
      for(const key of ['toolTiltXDeg','toolTiltYDeg'])if(arm[key]!==undefined)number(arm[key],-90,90)
      if(arm.holderLengthMm!==undefined)number(arm.holderLengthMm,0,1000)
      if(arm.holderDiameterMm!==undefined)number(arm.holderDiameterMm,.1,200)

      if (arm.postWidthMm !== undefined) number(arm.postWidthMm, 1, 200)
      if (arm.linkWidthMm !== undefined) number(arm.linkWidthMm, 1, 200)
      if (arm.azimuthDeg !== undefined) number(arm.azimuthDeg, -180, 180)
      if (arm.elevationDeg !== undefined) number(arm.elevationDeg, -90, 90)
    }
  }
  if(p.headposts!==undefined){
    check(Array.isArray(p.headposts)&&p.headposts.length<=20,'invalid headpost list')
    const ids=new Set<string>()
    for(const post of p.headposts){
      check(typeof post.id==='string'&&!ids.has(post.id),'invalid / duplicate headpost identifier');ids.add(post.id)
      check(typeof post.name==='string'&&!!post.name.trim()&&post.frameId===p.frame.id,'invalid headpost name / frame')
      vector(post.pose.origin);vector(post.pose.angles)
      check(typeof post.avoid==='boolean'&&typeof post.existing==='boolean'&&headpostReferences.some(ref=>ref.id===post.reference),'invalid headpost settings')
      const dimensionProblem = headpostDimensionProblem(post)
      check(!dimensionProblem, dimensionProblem ?? '')
      if(post.mesh){validatePatch(post.mesh,false);check(post.mesh.pts.length>0&&post.mesh.tris.length>0&&post.mesh.pts.length<=1800000,'invalid / oversized headpost model')}
      if(post.sourceName!==undefined)check(typeof post.sourceName==='string','invalid headpost source name')
    }
  }
  for(const t of p.targets)if(t.region){
    check(t.region.kind==='sphere'||t.region.kind==='voxels','invalid target region')
    if(t.region.kind==='sphere')number(t.region.radiusMm,.01,100)
    else{
      check(Array.isArray(t.region.centers)&&t.region.centers.length>0&&t.region.centers.length<=10000,'Select 1–10,000 target voxels')
      for(const point of t.region.centers)vector(point)
      check(Array.isArray(t.region.axes)&&t.region.axes.length===3,'invalid target voxel axes');for(const axis of t.region.axes)vector(axis)
      const [a,b,c]=t.region.axes,det=a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);check(Number.isFinite(det)&&Math.abs(det)>1e-9,'singular target voxel basis')
    }
  }
  if(p.display.gridPreviewHoles){check(Array.isArray(p.display.gridPreviewHoles)&&p.display.gridPreviewHoles.length<=1000,'too many grid comparison paths');for(const path of p.display.gridPreviewHoles){check(typeof path.electrodeId==='string','invalid comparison electrode');check(Array.isArray(path.hole)&&path.hole.length===2&&path.hole.every(n=>Number.isInteger(n)&&Math.abs(n)<=15),'invalid comparison hole')}}
  check(new Set(p.grids.map(g => g.chamberId)).size === p.grids.length, 'use one grid per chamber')
  for (const c of p.chambers) {
    if (c.targetIds !== undefined)
      check(Array.isArray(c.targetIds) && new Set(c.targetIds).size === c.targetIds.length &&
        c.targetIds.every(id => p.targets.some(t => t.id === id)), 'missing or duplicate chamber target')
    check(c.mounting===undefined||['custom','cut','pedestal','acrylic'].includes(c.mounting),'invalid chamber mounting option')
    check(c.placementState === undefined || c.placementState === 'unplaced', 'invalid chamber placement state')
    check(c.frameId === p.frame.id, 'chamber frame mismatch')
    object(c.pose)
    vector(c.pose.origin)
    vector(c.pose.angles)
    number(c.innerRadius, 0.5, 100)
    number(c.wallThickness, 0.1, 20)
    number(c.height, 0.5, 100)
    if (c.minimumWallHeight !== undefined) number(c.minimumWallHeight, 0.5, 20)
    if (c.baseFit) {
      object(c.baseFit)
      check(
        Array.isArray(c.baseFit.innerDepths) &&
          Array.isArray(c.baseFit.outerDepths) &&
          Array.isArray(c.baseFit.assetIds),
        'invalid rim profile arrays',
      )
      check(c.baseFit.source === 'brain' || c.baseFit.source === 'skull', 'invalid fit source')
      number(c.baseFit.gap, 0, 10)
      if(c.baseFit.maxAdditionalGap!==undefined)number(c.baseFit.maxAdditionalGap,0,150)
      check(c.baseFit.innerDepths.length === 64 && c.baseFit.outerDepths.length === 64, 'invalid rim profile')
      for (const depth of [...c.baseFit.innerDepths, ...c.baseFit.outerDepths])
        number(depth, c.minimumWallHeight ?? 2, 150)
      check(
        c.baseFit.assetIds.length > 0 &&
          c.baseFit.assetIds.every((id) => p.assets.some((a) => a.id === id && (a.role === 'surface' || ((a.role === 'ct' || a.modality === 'ct') && !!a.imageDisplay?.skull)))),
        'missing fit surface',
      )
    }
  }
  for (const g of p.grids) {
    if(g.seating!==undefined)check(g.seating==='flush'||g.seating==='manual','invalid grid seating mode')
    if (g.enabled !== undefined) check(typeof g.enabled === 'boolean', 'invalid guide-grid enable flag')
    check(
      p.chambers.some((c) => c.id === g.chamberId),
      'missing chamber',
    )
    number(g.spacing, 0.1, 20)
    number(g.count, 1, 31)
    check(Number.isInteger(g.count) && g.count % 2 === 1, 'grid count must be odd')
    number(g.rotation, -360, 360)
    if(g.tiltAngle!==undefined)number(g.tiltAngle,0,89)
    if(g.tiltAzimuth!==undefined)number(g.tiltAzimuth,-360,360)
    if(g.holeDiameter!==undefined)number(g.holeDiameter,.05,10)
    if(g.minimumThickness!==undefined)number(g.minimumThickness,0,50)
    if(g.seatHeight!==undefined)number(g.seatHeight,-100,100)
    if(g.tiltAngle)check((g.minimumThickness??0)>=.1,'Specify at least 0.1 mm thin-edge thickness for an angled grid')
    if(g.angleSearch){object(g.angleSearch);number(g.angleSearch.maximum,0,89);number(g.angleSearch.step,1,30);number(g.angleSearch.azimuthStep,5,180)}
  }
  for (const e of p.electrodes) {
    const assembly = electrodeAssembly(p,e)
    check(assembly, 'missing grid or chamber')
    const {grid:g,chamber:c}=assembly
    vector(e.hole, 2)
    if(e.direct){object(e.direct);object(e.direct.pose);vector(e.direct.pose.origin);vector(e.direct.pose.angles);check(e.gridId===''&&e.hole.every(v=>v===0),'Direct entry must not use a grid hole');if(e.direct.unplaced!==undefined)check(typeof e.direct.unplaced==='boolean','invalid direct placement flag');if(e.direct.preferredEntry!==undefined)vector(e.direct.preferredEntry)}
    if(e.connector){const c=e.connector;object(c);string(c.presetId);object(c.pose);vector(c.pose.origin);vector(c.pose.angles);check(c.shape==='box'||c.shape==='cylinder','invalid connector shape');number(c.width,.1,200);number(c.depth,.1,200);number(c.height,.1,200);if(c.neckDiameter!==undefined)number(c.neckDiameter,.1,c.width);if(c.baseThickness!==undefined)number(c.baseThickness,.01,c.height);if(c.unplaced!==undefined)check(typeof c.unplaced==='boolean','invalid connector placement');check(Array.isArray(c.sources)&&c.sources.every(s=>typeof s==='string'&&s.startsWith('https://')),'invalid connector references')}
    check(
      gridHoles(c, g).some((h) => h[0] === e.hole[0] && h[1] === e.hole[1]),
      'electrode hole outside grid',
    )
    if (e.hardware !== undefined) {
      const h = e.hardware
      object(h)
      for (const key of ['presetId', 'manufacturer', 'model', 'checkedAt', 'notes'] as const) string(h[key])
      check(Number.isFinite(Date.parse(h.checkedAt)), 'invalid catalog date')
      check(Array.isArray(h.sources) && h.sources.length <= 10, 'invalid hardware sources')
      for (const url of h.sources)
        check(typeof url === 'string' && /^https:\/\//.test(url), 'invalid hardware source URL')
      check(typeof h.modified === 'boolean', 'invalid modified flag')
      if (h.configuration !== undefined) {
        object(h.configuration)
        check(Object.keys(h.configuration).length <= 50, 'too many manufacturer selections')
        for (const [key, value] of Object.entries(h.configuration)) {
          string(key)
          if (typeof value === 'number') number(value, -10000, 100000)
          else string(value)
        }
      }
      if (h.sitePositions !== undefined) {
        check(
          Array.isArray(h.sitePositions) && h.sitePositions.length === e.contactCount,
          'site layout must match site count',
        )
        for (const position of h.sitePositions) {
          vector(position)
          check(position[2] >= 0, 'site distance from tip cannot be negative')
          check(
            h.shape === 'blade'
              ? Math.abs(position[0]) <= h.width / 2 + 1e-8 && Math.abs(position[1]) <= h.thickness / 2 + 1e-8
              : Math.hypot(position[0], position[1]) <= e.diameter / 2 + 1e-8,
            'site lies outside shaft',
          )
        }
      }
      check(h.shape === 'round' || h.shape === 'blade', 'invalid shank shape')
      if (h.reservedLength !== undefined) number(h.reservedLength, 0, MAX_ELECTRODE_LENGTH_MM)
      number(h.width, 0.001, 10)
      number(h.thickness, 0.001, 10)
      number(h.rows, 1, 16)
      number(h.columns, 1, 16)
      check(
        Number.isInteger(h.rows) && Number.isInteger(h.columns) && h.rows * h.columns <= 256,
        'invalid shank layout',
      )
      number(h.pitchX, 0.001, 20)
      number(h.pitchY, 0.001, 20)
      number(h.rotation, -360, 360)
      number(h.selectedShank, 0, h.rows * h.columns - 1)
      check(Number.isInteger(h.selectedShank), 'invalid reference shank')
      check(
        Array.isArray(h.shankLengths) &&
          (h.shankLengths.length === 0 || h.shankLengths.length === h.rows * h.columns),
        'invalid shank lengths',
      )
      h.shankLengths.forEach((v) => number(v, 0.5, MAX_ELECTRODE_LENGTH_MM))
      number(h.siteColumns, 1, 16)
      check(Number.isInteger(h.siteColumns), 'invalid site columns')
      number(h.sitePitchX, 0.001, 10)
      number(h.tipOffset, 0, 20)
      number(h.recordingChannels, 1, 65536)
      check(Number.isInteger(h.recordingChannels), 'invalid channel count')
      check(h.rows * h.columns * e.contactCount <= 65536, 'too many sites')
      const width = h.shape === 'blade' ? h.width : e.diameter
      const thickness = h.shape === 'blade' ? h.thickness : e.diameter
      check(h.columns === 1 || h.pitchX >= width, 'shaft pitch X is smaller than shaft width')
      check(h.rows === 1 || h.pitchY >= thickness, 'shaft pitch Y is smaller than shaft thickness')
      check(
        (h.siteColumns - 1) * h.sitePitchX + e.contactLength <= width + 1e-8,
        'site columns extend beyond shaft width',
      )
    }
    number(e.depth, 0, MAX_ELECTRODE_LENGTH_MM)
    if (e.length !== undefined) number(e.length, 0.5, MAX_ELECTRODE_LENGTH_MM)
    check(e.depth <= maximumInsertion(e), 'insertion depth exceeds electrode length')
    number(e.diameter, 0.001, 10)
    if (e.guideTube) {
      object(e.guideTube)
      check(
        gridCompatibility(e).available,
        'A coaxial guide tube supports a single shaft, not a multi-shank or fixed-footprint array.',
      )
      number(e.guideTube.innerDiameter, 0.001, 20)
      number(e.guideTube.outerDiameter, 0.002, 30)
      number(e.guideTube.length, 0.5, MAX_ELECTRODE_LENGTH_MM)
      number(e.guideTube.tipDepth, 0, MAX_ELECTRODE_LENGTH_MM)
      check(
        e.guideTube.innerDiameter >= shaftDiameter(e) - 1e-8,
        'Guide-tube inner diameter is smaller than the probe cross-section.',
      )
      check(
        e.guideTube.outerDiameter > e.guideTube.innerDiameter,
        'Guide-tube outer diameter must exceed its inner diameter.',
      )
      check(
        !!g.tiltAngle || hardwareFitsBore(e, holeLocal(g, e.hole,c), c.innerRadius),
        'The guide tube does not fit the chamber bore at this position. Use a more central hole, a smaller tube, or a larger bore.',
      )
    }
    check(
      e.hardware?.presetId !== 'custom-tungsten' || e.contactCount === 1,
      'A single tungsten microelectrode has one recording contact. Use a custom linear probe for multiple contacts.',
    )
    number(e.contactCount, 1, 8192)
    check(Number.isInteger(e.contactCount), 'contact count must be integer')
    number(e.contactSpacing, 0.001, 20)
    number(e.contactLength, 0.001, 20)
    check(e.contactLength <= e.contactSpacing, 'overlapping contacts')
    check(minimumInsertion(e) <= e.depth + 1e-8, 'contacts exceed inserted shaft')
    if (e.hardware)
      for (let i = 0; i < shankOffsets(e).length; i++)
        check(
          siteSpan(e) <=
            (e.hardware.shankLengths[i] ?? e.length ?? 150) + (e.hardware.reservedLength ?? 0) + 1e-8,
          'contacts exceed physical shaft',
        )
    color(e.color)
    nullableString(e.targetId)
    check(e.targetId === null || p.targets.some((t) => t.id === e.targetId), 'missing target')
  }
  validateCalibration(p)
  return copy ? structuredClone(p) : p
}
