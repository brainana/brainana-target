import {bytesView} from '../data/buffers.ts'
import { NVImage } from '@niivue/niivue'
import { h } from '@brainana/ui/dom.ts'
import type { Asset, Project, Vec3 } from '@brainana/planning-core/model.ts'
import { VolumeSampler, nativeSurfaceSpacing } from '../render/volume.ts'
import { imageBounds } from '../render/ctSkull.ts'
import { buildMRISurface, disposeMRISurface } from '../render/mriSurfaceBuilder.ts'
import { darkBandCutoff } from '../render/mriDarkBand.ts'
import type { MRISurfaceSettings } from '../render/mriSurface.ts'
import type { MeshGeometry } from '../render/primitives.ts'
import type { BoundaryVoxels } from '../render/boundaryVoxels.ts'
import { surfaceReview } from './surfaceReview.ts'
import { button, chooseFile, note, selectField, section, sliceEditButtons } from './controls.ts'
import { withActivity } from './activity.ts'
export interface MRISurfaceSave { geometry: MeshGeometry; boundary: BoundaryVoxels; settings: MRISurfaceSettings; mask?: { name: string; bytes: Uint8Array; assetId?: string } }
interface EditorOptions {
  project: () => Project | null; asset: Asset; image: NVImage
  bytes: (id: string) => Uint8Array | undefined
  preview: { setBounds: (b: [Vec3, Vec3]) => void; update: (g: MeshGeometry | null, text: string, reconstructed?: Uint8Array) => void }
  finalize: HTMLButtonElement; reset: HTMLButtonElement; status: HTMLElement
  save: (value: MRISurfaceSave) => Promise<void>
  pick: (point: Vec3) => void; crosshair?: () => Vec3
}
/** MRI-only controls. All preparation remains a draft until Finalize succeeds. */
export function mriSurfaceEditor(options: EditorOptions) {
  const project = options.project()!, sourceId = project.id, asset = options.asset
  const volume = new VolumeSampler(options.image), fullBounds = imageBounds(volume, true)
  const low = options.image.global_min ?? options.image.cal_min ?? 0
  const high = Math.max(low + .001, options.image.global_max ?? options.image.cal_max ?? 1)
  const previous = project.assets.find(a => a.mriSurface?.sourceAssetId === asset.id)?.mriSurface
  const newCompletion = () => ({ enabled: true, maximumGapMm: 8, smoothness: .5 })
  const defaults: MRISurfaceSettings = { sourceAssetId: asset.id, method: 'dark-band-head', darkBand: { maximumIntensity: low + (high - low) * .15, searchMm: 15, minimumWidthMm: .5, maximumWidthMm: 8, minimumScalpMm: 1, completion: newCompletion() }, offsetMm: 0, threshold: low+(high-low)*.25, spacingMm: 0.5, largest: true, fillHoles: true, smooth: true, bounds: fullBounds, edits: [] }
  const settings = structuredClone(previous ?? defaults)
  const bandSettings = () => settings.darkBand ??= { maximumIntensity: low + (high - low) * .15, searchMm: 15, minimumWidthMm: .5, maximumWidthMm: 8, minimumScalpMm: 1 }
  let mask: { name: string; bytes: Uint8Array; assetId?: string; volume: VolumeSampler } | undefined
  let mesh: Awaited<ReturnType<typeof buildMRISurface>> | null = null, controller: AbortController | null = null, timer: ReturnType<typeof setTimeout> | undefined
  const display = { fillVoxels: true, highlightReconstruction: true, opacity: .55 }
  let caption = ''
  let generation = 0, disposed = false, mode: 'navigate' | 'erase' | 'restore' = 'navigate', diameter = 4
  const controls = h('div',{class:'mri-surface-controls'}), message = options.status
  let estimatedBrain=structuredClone(settings.brainEstimate)
  let maskKind:'brain'|'head'=previous?.method==='head-erode'?'head':'brain', previewBrain=false
  const needsMask=()=>['dark-band','brain-envelope','brain-dilate','head-erode'].includes(settings.method)
  const hasBrain=()=>!!estimatedBrain||!!mask&&maskKind==='brain'
  const current = () => !disposed && options.project()?.id === sourceId && options.project()?.assets.some(a => a.id === asset.id && a.sha256 === asset.sha256)
  options.preview.setBounds(fullBounds)
  const review = surfaceReview(volume, fullBounds, fullBounds[0].map((v, k) => (v + fullBounds[1][k]) / 2) as Vec3, options.pick, {
    state: () => ({ mode, diameter, thicknessMm: settings.spacingMm, strokes: settings.edits ?? [], openings: [], key: 'MRI' }),
    onStroke: stroke => {
      settings.edits ??= []
      if (settings.edits.length >= 2000 || settings.edits.reduce((n, s) => n + s.points.length, 0) + stroke.points.length > 50000) { message.textContent = 'Correction limit reached. Undo or clear corrections before adding more.'; return }
      settings.edits.push(stroke); schedule()
    },
  }, 'MRI')
  const displayChanged = () => {
    review.setDisplay(display)
    if (mesh) options.preview.update(mesh, caption, display.highlightReconstruction ? mesh.reconstructedFaces : undefined)
  }
  review.setDisplay(display)
  const disabled = () => { options.finalize.disabled = true; mesh = null; controller?.abort(); generation++ }
  const update = async () => {
    clearTimeout(timer); disabled()
    if ((needsMask()&&!mask&&!settings.brainEstimate)||previewBrain&&!hasBrain()) {
      message.textContent = 'Choose a brain region first, or use the direct MRI method that needs no mask.'
      options.preview.update(null, 'Waiting for MRI mask.'); review.update(null); return
    }
    const token = generation; controller = new AbortController(); message.textContent = 'Updating MRI surface estimate…'
    try {
      const requested=structuredClone(settings)
      if(previewBrain){if(estimatedBrain)requested.brainEstimate=structuredClone(estimatedBrain);requested.threshold=.5;requested.method='brain-dilate';requested.offsetMm=0;requested.edits=[];requested.fillHoles=false}
      const useMRI = !!requested.brainEstimate||requested.method === 'head-threshold' || requested.method === 'dark-band'||requested.method==='dark-band-head'
      const result = await buildMRISurface(useMRI ? volume : mask!.volume, requested, controller.signal, requested.method === 'dark-band'&&!requested.brainEstimate ? mask!.volume : undefined, { dims: volume.dims, matrix: volume.worldToVoxel })
      if (!current() || generation !== token) return
      mesh = previewBrain?null:result; review.update(result, previewBrain ? undefined : result.boundary, result.reconstructedFaces)
      const band = result.report.darkBand
      caption = `${previewBrain?'Brain region only — not the planning surface':band ? 'Estimated skull/scalp boundary' : settings.method === 'brain-envelope' ? 'Cortical envelope' : 'MRI boundary estimate'} · ${settings.spacingMm.toFixed(3)} mm detail · drag to rotate · scroll to zoom.`
      options.preview.update(result, caption, display.highlightReconstruction ? result.reconstructedFaces : undefined)
      message.textContent = previewBrain ? 'Brain-region preview. Check that only brain tissue is outlined. Raise the cutoff if it spreads into scalp; lower it if brain is missing. Choose Show surface estimate when ready. Finalize is unavailable while reviewing the brain region.' : band
        ? `One estimated boundary beneath scalp: ${(100 * band.detected / band.directions).toFixed(1)}% detected; ${(100 * band.reconstructed / band.directions).toFixed(1)}% reconstructed across ${band.bridgedGaps} gaps. Unresolved gaps, crop edges and erased areas stay open. Cyan slice voxels follow detected areas; amber voxels and amber 3D patches show reconstruction. The voxel overlay is a thin boundary layer, not a skull-thickness measurement.`
        : settings.method === 'brain-envelope' ? 'Amber contours show the outer envelope around the brain region. Review its fit against the MRI before finalizing.'
        : `${(result.tris.length / 3).toLocaleString()} triangles. ${result.report.croppedFaces.toLocaleString()} crop-boundary faces excluded. Check the cyan contours against MRI slices. This method can retain internal tissue boundaries; use Follow dark band beneath scalp to select a single scalp-side boundary.`
      options.finalize.disabled = previewBrain
    } catch (error) {
      if (!current() || generation !== token) return
      mesh = null; options.preview.update(null, 'MRI estimate needs adjustment.'); review.update(null)
      message.textContent = `MRI surface update failed: ${String(error)}`
    }
  }
  function schedule() { disabled(); clearTimeout(timer); message.textContent = 'MRI settings changed · preparing update…'; timer = setTimeout(() => { void update() }, 250) }
  const range = (label: string, value: number, min: number, max: number, step: number, change: (v: number) => void, rebuild = true) => {
    const input = h('input', { type: 'range', ariaLabel: label, min: String(min), max: String(max), step: String(step), value: String(value) })
    const exact = h('input', { type: 'number', ariaLabel: `${label} exact value`, min: String(min), max: String(max), step: String(step), value: String(value) })
    const apply = (v: number) => { if (!Number.isFinite(v) || v < min || v > max) return; input.value = exact.value = String(v); change(v); if (rebuild) schedule() }
    input.addEventListener('input', () => apply(input.valueAsNumber)); exact.addEventListener('change', () => apply(exact.valueAsNumber))
    return h('label', { class: 'image-slider' }, [h('span', {}, [label]), input, exact])
  }
  const automaticCutoff = () => {
    if (!mask) return
    const cutoff = darkBandCutoff(volume, mask.volume, fullBounds, settings.threshold)
    if (cutoff !== undefined) bandSettings().maximumIntensity = Math.max(low, Math.min(high, cutoff))
  }
  const load = async (file: { name: string; bytes: Uint8Array; assetId?: string },kind:'brain'|'head'='brain') => {
    disabled(); const token = generation
    await withActivity('Loading aligned MRI mask…', async () => {
      const image = await NVImage.loadFromFile({ file: new File([bytesView(file.bytes)], file.name), name: file.name })
      const sampler = new VolumeSampler(image), bounds = imageBounds(sampler, true)
      if (!current() || generation !== token) return
      if (bounds[0].some((v, k) => v >= fullBounds[1][k] || bounds[1][k] <= fullBounds[0][k])) throw Error('The mask does not overlap this MRI. Use an already aligned mask in millimetres.')
      disposeMRISurface(volume); if (mask) disposeMRISurface(mask.volume)
      mask = { ...file, volume: sampler }; maskKind=kind;settings.maskAssetId = file.assetId;delete settings.brainEstimate;estimatedBrain=undefined;mode='navigate'
      if(!file.assetId){settings.method=kind==='brain'?'dark-band':'head-erode';settings.threshold=.5;settings.offsetMm=0;previewBrain=kind==='brain'}
      if (settings.method === 'dark-band' && (!file.assetId || previous?.method !== 'dark-band')) automaticCutoff()
      drawControls(); schedule()
    })
  }
  const demoMask = project.assets.find(a => a.role === 'mask' && a.sourcePath === 'nmt2sym/tpl-NMT2Sym_res-05_brainmask.nii.gz')
  const drawControls = () => {
    const dark = settings.method === 'dark-band'||settings.method==='dark-band-head', direct=settings.method==='dark-band-head', head=settings.method==='head-threshold', envelope=settings.method==='brain-envelope'
    const chooseMethod=(value:string)=>{
      const wasMRI=['head-threshold','dark-band-head'].includes(settings.method)
      settings.method=value as typeof settings.method;previewBrain=false;mode='navigate'
      if(['head-threshold','dark-band-head'].includes(value)){delete settings.brainEstimate;settings.threshold=wasMRI?settings.threshold:low+(high-low)*.25}
      else{settings.threshold=.5;if(estimatedBrain)settings.brainEstimate=structuredClone(estimatedBrain)}
      settings.offsetMm=0;settings.edits=[]
      if(value==='dark-band'){bandSettings();automaticCutoff()}
      drawControls();schedule()
    }
    const check = (label: string, key: 'largest' | 'fillHoles' | 'smooth') => {
      const input = h('input', { type: 'checkbox', checked: settings[key], ariaLabel: label })
      input.addEventListener('change', () => { settings[key] = input.checked; schedule() })
      return h('label', {}, [input, label])
    }
    const chooseMask=(kind:'brain'|'head')=>chooseFile('.nii,.nii.gz,.mgz',async file=>load({name:file.name,bytes:new Uint8Array(await file.arrayBuffer())},kind),error=>{message.textContent=String(error)})
    const brainFields:HTMLElement[]=[note('A brain region is optional. Use MRI directly below, or load/estimate a brain-only region to guide the skull search.'),
      note(estimatedBrain?'Brain source: estimated from MRI brightness and a selected point.':mask?`${maskKind==='brain'?'Brain-only':'Whole-head'} mask: ${mask.name}`:'No brain mask loaded. Direct MRI estimation is available.'),
      h('div',{class:'button-row'},[button('Load brain mask…',()=>chooseMask('brain')),button('Estimate brain region from MRI',()=>{
        if(mask){disposeMRISurface(mask.volume);mask=undefined};disposeMRISurface(volume);delete settings.maskAssetId
        estimatedBrain=settings.brainEstimate={threshold:low+(high-low)*.25,seed:[...(options.crosshair?.()??fullBounds[0].map((v,k)=>(v+fullBounds[1][k])/2) as Vec3)]}
        maskKind='brain';settings.method='dark-band';settings.threshold=.5;settings.offsetMm=0;settings.edits=[];previewBrain=true;mode='navigate';drawControls();schedule()
      })])]
    if (demoMask && mask?.assetId !== demoMask.id) brainFields.push(button('Use NMT template brain mask', () => {
      const bytes = options.bytes(demoMask.id)
      if (!bytes) return
      settings.method = 'dark-band'
      settings.threshold = .5
      settings.offsetMm = 0
      previewBrain = true
      void load({ name: demoMask.name, bytes, assetId: demoMask.id }).catch(error => { message.textContent = String(error) })
    }))
    if(estimatedBrain){
      brainFields.push(note('Click bright brain tissue in a slice, then set the starting point. The estimate includes connected tissue above the cutoff; it can leak into scalp where tissues touch. Review before using it.'),
        range('Brain tissue brightness cutoff',estimatedBrain.threshold,low,high,(high-low)/1000,value=>{estimatedBrain!.threshold=value;if(settings.brainEstimate)settings.brainEstimate.threshold=value}),
        button('Set brain starting point at crosshair',()=>{if(options.crosshair){estimatedBrain!.seed=[...options.crosshair()];if(settings.brainEstimate)settings.brainEstimate.seed=[...options.crosshair()];schedule();drawControls()}}))
    }
    if(hasBrain()){
      brainFields.push(button(previewBrain?'Show surface estimate':'Review brain region',()=>{previewBrain=!previewBrain;mode='navigate';if(!previewBrain&&!['dark-band','brain-envelope','brain-dilate'].includes(settings.method)){settings.method='dark-band';settings.threshold=.5;settings.offsetMm=0;if(estimatedBrain)settings.brainEstimate=structuredClone(estimatedBrain)}drawControls();schedule()}))
    }
    const methods=[{value:'dark-band-head',label:'MRI only · dark band beneath scalp'},
      ...(hasBrain()?[{value:'dark-band',label:'Brain region + MRI · dark band beneath scalp'},{value:'brain-dilate',label:'Brain region only · expand outward'},{value:'brain-envelope',label:'Brain region only · cortical envelope'}]:[]),
      ...(mask&&maskKind==='head'?[{value:'head-erode',label:'Whole-head mask · shrink inward'}]:[]),
      {value:'head-threshold',label:'MRI only · head tissue outlines (all boundaries)'}]
    const methodFields:HTMLElement[]=[selectField('Estimate surface from',settings.method,methods,chooseMethod),
      note(direct?'No mask required. Start at the outside of the head, find the bright scalp, then follow the dark band just beneath it. Only the scalp-side edge of that band becomes the surface; the outer skin and brain outlines are excluded.':settings.method==='dark-band'?'Uses the brain region above as the inner limit, then MRI brightness to find the dark band beneath scalp.':head?'Shows tissue above the brightness cutoff, including skin and internal boundaries. To isolate the band beneath scalp, choose MRI only · dark band beneath scalp.':envelope?'Wraps the brain region with a convex boundary that bridges folds. Use the offset only when you have a reason to model extra clearance.':settings.method==='brain-dilate'?'Uses only the brain region above. The outward distance is an approximation; it does not detect skull tissue.':'Uses only a loaded whole-head mask. Shrinking it inward is an approximation; check the result against the MRI.'),
      button('Load whole-head mask instead…',()=>chooseMask('head'))]
    if(dark){
      const band=bandSettings()
      if(direct)methodFields.push(range('Head tissue brightness cutoff',settings.threshold,low,high,(high-low)/1000,value=>{settings.threshold=value}))
      methodFields.push(range('Dark band maximum brightness',band.maximumIntensity,low,high,(high-low)/1000,value=>{band.maximumIntensity=value}),
        ...(mask&&maskKind==='brain'&&!direct?[button('Estimate dark cutoff from brain mask',()=>{automaticCutoff();drawControls();schedule()})]:[]),
        range(direct?'Search depth beneath outer scalp (mm)':'Search outward from brain (mm)',band.searchMm,2,50,.5,value=>{band.searchMm=value}),
        range('Minimum dark-band width (mm)',band.minimumWidthMm,.05,20,.05,value=>{band.minimumWidthMm=value}),
        range('Maximum dark-band width (mm)',band.maximumWidthMm,.05,50,.1,value=>{band.maximumWidthMm=value}),
        range('Minimum bright scalp layer (mm)',band.minimumScalpMm,.05,10,.05,value=>{band.minimumScalpMm=value}),
        range('Boundary inset into dark band (mm)',settings.offsetMm,0,10,.1,value=>{settings.offsetMm=value}),
        note('Inset 0 follows the edge just beneath scalp. Increase it to move into the dark band. Gap reconstruction below can bridge missed detections along the surrounding curve.'),
        h('div',{class:'button-row'},[button('Set head centre at crosshair',()=>{if(options.crosshair){band.center=[...options.crosshair()];schedule()}}),button('Use automatic head centre',()=>{delete band.center;schedule()})]))
      if(!direct&&mask)methodFields.push(range('Brain-mask foreground cutoff',settings.threshold,0,255,.1,value=>{settings.threshold=value}))
    }else{
      methodFields.push(range(head?'Head tissue brightness cutoff':'Mask foreground cutoff',settings.threshold,head?low:0,head?high:255,head?(high-low)/1000:.1,value=>{settings.threshold=value}))
      if(!head)methodFields.push(range(envelope?'Outward offset (mm)':settings.method==='brain-dilate'?'Expand brain region outward (mm)':'Shrink head mask inward (mm)',settings.offsetMm,0,envelope?20:30,.1,value=>{settings.offsetMm=value}))
    }
    const detailFields:HTMLElement[]=[range('Surface sample spacing (mm)',settings.spacingMm,Math.min(.1, settings.spacingMm),Math.max(4,nativeSurfaceSpacing(options.image)),.01,value=>{settings.spacingMm=value}),...(!envelope ? [check('Smooth the resulting surface','smooth')] : []), note('Sampling starts at 0.5 mm. Finer spacing can need a tighter crop and cannot recover detail absent from the scan.')]
    if(!dark)detailFields.push(check('Keep largest connected part','largest'),check('Fill enclosed mask cavities','fillHoles'))
    for(const [k,label]of (['R','A','S']as const).entries())detailFields.push(
      range(`${label} crop minimum (mm)`,settings.bounds[0][k],fullBounds[0][k],fullBounds[1][k],.1,value=>{settings.bounds[0][k]=Math.min(value,settings.bounds[1][k]-.1)}),
      range(`${label} crop maximum (mm)`,settings.bounds[1][k],fullBounds[0][k],fullBounds[1][k],.1,value=>{settings.bounds[1][k]=Math.max(value,settings.bounds[0][k]+.1)}))
    const completionFields: HTMLElement[] = []
    if (dark) {
      const completion = bandSettings().completion ??= newCompletion()
      const enabled = h('input', { type: 'checkbox', ariaLabel: 'Bridge gaps along surface', checked: completion.enabled })
      enabled.addEventListener('change', () => { completion.enabled = enabled.checked; schedule() })
      completionFields.push(h('label', {}, [enabled, 'Bridge gaps along surface']),
        range('Maximum gap span (mm)', completion.maximumGapMm, .5, 40, .5, value => { completion.maximumGapMm = value }),
        range('Reconstruction smoothness', completion.smoothness, 0, 1, .05, value => { completion.smoothness = value }),
        note('Fits the surrounding curve across small missed sections. The gap limit measures the whole opening, not just its distance to an edge. Larger gaps, crop edges and manual erasures remain open. Review amber patches before finalizing.'))
    }
    for (const [label, key] of [['Show boundary voxels in slices', 'fillVoxels'], ['Highlight reconstructed areas', 'highlightReconstruction']] as const) {
      const input = h('input', { type: 'checkbox', ariaLabel: label, checked: display[key] })
      input.addEventListener('change', () => { display[key] = input.checked; displayChanged() })
      completionFields.push(h('label', {}, [input, label]))
    }
    completionFields.push(range('Boundary voxel opacity', display.opacity, .1, 1, .05, value => { display.opacity = value; displayChanged() }, false),
      note('The slice fill occupies only voxels touched by the estimated surface. Finalize saves this aligned label image with the surface: 1 = detected, 2 = reconstructed. MRI intensities remain unchanged.'))
    controls.replaceChildren(section('1. Brain region (optional)',brainFields),section('2. Estimate planning surface',methodFields),section('3. Reconstruct and display boundary', completionFields),section('4. Crop and surface detail',detailFields),section('5. Edit MRI boundary',envelope?[note('To change the envelope, adjust the underlying brain region or its outward offset.')]:previewBrain?[note('Return to the surface estimate before editing its boundary.')]:[
      sliceEditButtons(()=>mode,value=>{mode=value;review.refresh()}),
      range('Correction brush diameter (mm)',diameter,.5,40,.5,value=>{diameter=value;review.refresh()},false),
      note('Erase removes detected or reconstructed boundary. Add back undoes erasure; reconstruction still follows the gap limit above. Click the active tool again to stop editing. The source MRI and mask are unchanged.'),
      h('div',{class:'button-row'},[button('Undo MRI boundary correction',()=>{settings.edits?.pop();schedule()}),button('Clear MRI boundary corrections',()=>{settings.edits=[];schedule()})])]))
  }
  options.reset.disabled = false; options.reset.title = 'Discard MRI preparation edits and restore the last finalized settings.'
  const reset = () => { previewBrain=false;mode='navigate';delete settings.brainEstimate;delete settings.maskAssetId;delete settings.darkBand;Object.assign(settings, structuredClone(previous ?? defaults)); settings.edits = structuredClone(previous?.edits ?? []);estimatedBrain=structuredClone(settings.brainEstimate);if(mask){disposeMRISurface(mask.volume);mask=undefined};const saved=previous?.maskAssetId&&project.assets.find(a=>a.id===previous.maskAssetId),data=saved&&options.bytes(saved.id);if(saved&&data){void load({name:saved.name,bytes:data,assetId:saved.id},previous?.method==='head-erode'?'head':'brain').catch(error=>{message.textContent=String(error)})}else{drawControls();schedule()} }
  options.reset.addEventListener('click', reset)
  const finalize = () => {
    if (!mesh || !current()) return
    const geometry = mesh, boundary = mesh.boundary, snapshot = structuredClone(settings); options.finalize.disabled = true
    void withActivity('Finalizing MRI surface estimate…', () => options.save({ geometry, boundary, settings: snapshot, mask: needsMask()&&!settings.brainEstimate && mask ? { name: mask.name, bytes: mask.bytes, assetId: mask.assetId } : undefined })).catch(error => { if (current()) { message.textContent = `Could not finalize: ${String(error)}`; options.finalize.disabled = previewBrain } })
  }
  options.finalize.addEventListener('click', finalize)
  drawControls()
  if (previous?.maskAssetId) {
    const asset = project.assets.find(a => a.id === previous.maskAssetId), bytes = asset && options.bytes(asset.id)
    if (asset && bytes) void load({ name: asset.name, bytes, assetId: asset.id },previous.method==='head-erode'?'head':'brain').catch(error => { message.textContent = String(error) })
  } else schedule()
  return { controls, review, dispose: () => { disposed = true; clearTimeout(timer); controller?.abort(); disposeMRISurface(volume); if (mask) disposeMRISurface(mask.volume); options.finalize.removeEventListener('click', finalize); options.reset.removeEventListener('click', reset) } }
}
