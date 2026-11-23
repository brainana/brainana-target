import {assetDerivation} from './assetDerivation.ts'
import { ctCropFeedback } from './ctCropFeedback.ts'
import { isCorticalEnvelope } from '@brainana/planning-core/model.ts'
import { workerTask } from '../workers/task.ts'
import type { CorticalEnvelopeRequest } from '../workers/corticalEnvelope.ts'
import type { CorticalEnvelopeSave } from '../data/mriBoundaryAssets.ts'
import { withActivity } from './activity.ts'
import { geometryIdentity } from '../render/avoidanceKey.ts'
import {mriSurfaceEditor,type MRISurfaceSave} from './mriSurfaceEditor.ts'
import { measureCTOpening } from '../render/measureCTOpening.ts'
import { openingSurfaceKey } from '@brainana/planning-core/skull-surface.ts'
import { surfaceOpeningTools } from './surfaceOpenings.ts'
import { surfaceReview } from './surfaceReview.ts'
import { ctSurfaceKey } from '../render/ctSurfaceKey.ts'
import { ctDefaults } from '../render/ctDefaults.ts'
import { buildCTSurface,disposeCTSurface } from '../render/ctSurfaceBuilder.ts'
import { h } from '@brainana/ui/dom.ts'
import type { Project, Vec3, SurfaceBrushStroke, SurfaceOpening } from '@brainana/planning-core/model.ts'
import type { NiiVuePlanningScene } from '../render/scene.ts'
import { VolumeSampler, nativeSurfaceSpacing } from '../render/volume.ts'
import { imageBounds, type CTSurfaceOptions } from '../render/ctSkull.ts'
import type { MeshGeometry } from '../render/primitives.ts'
import { button, note, section, readout, selectField, numberField, sliceEditButtons } from './controls.ts'
import { surfacePreview } from './surfacePreview.ts'
import { floatingWindow } from './floatingWindow.ts'
interface CTDraft { slicePoint?: Vec3; smoothing?: CTSurfaceOptions['smoothing']; representation: 'outer' | 'smooth'; showThreshold: boolean; openingBaseline:string; edits:SurfaceBrushStroke[]; redo:SurfaceBrushStroke[]; openings:SurfaceOpening[]; brushMode:'navigate'|'erase'|'restore'; brushDiameter:number; center?: Vec3; componentSeed?: Vec3; baseline: string; threshold: number; bounds: [Vec3, Vec3]; spacingMm: number; components: 'all' | 'largest'; dirty: boolean }
/** Temporary live preview and saved planning geometry have separate ownership. */
export function planningSurfaceWorkspace(options: {
  project: () => Project | null
  scene: Pick<NiiVuePlanningScene, 'prepareCTPreview' | 'surfaceCandidates' | 'mountingSurface' | 'placementSurface' | 'imageForAsset' | 'defaultsForImage'> & Partial<Pick<NiiVuePlanningScene, 'ctSurfaceGeometry' | 'display'>>
  edit: (change: (p: Project) => void) => void
  bytes?: (id:string)=>Uint8Array|undefined
  saveEnvelope?: (value: CorticalEnvelopeSave) => Promise<void>
  saveMRI?: (value:MRISurfaceSave)=>Promise<void>
  importSkull: () => void
  importBrain: () => void
  addCT: () => void
  onFinalized?: (message:string)=>void
  crosshair?: () => Vec3
  moveCrosshair?: (point:Vec3) => void
}) {
  const drafts = new Map<string, CTDraft>(), preview = surfacePreview()
  let cachedCT: { signature: string; result: Awaited<ReturnType<typeof buildCTSurface>> } | null = null
  let controlsScrollTop = 0
  let finalizedNotice=''
  let projectId = '', source = '', generation = 0, lastKey = '', timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | null = null, latest: MeshGeometry | null = null
  let split=35
  let headerActions: HTMLElement[] = []
  let popup: ReturnType<typeof floatingWindow> | null = null, editorKey = ''
  const sourcesKey = () => JSON.stringify([options.project()?.assets.map(a => [a.id, a.sha256, a.imageDisplay?.skull]), options.scene.surfaceCandidates.map(c => [c.id, c.ready]), options.project()?.surfaceOpenings?.map(({patch,...opening})=>[opening,geometryIdentity(patch)])])
  const paint = (geometry: MeshGeometry | null, text: string) => { latest = geometry; preview.update(geometry, text) }
  let disposeCT:(()=>void)|undefined
  let disposeMRI:(()=>void)|undefined
  let disposeEnvelope: (() => void) | undefined
  const stop = () => { disposeEnvelope?.();disposeEnvelope=undefined;disposeMRI?.();disposeMRI=undefined;generation++; clearTimeout(timer); controller?.abort(); controller = null; lastKey = '' }
  const finish = (message:string) => {finalizedNotice=message;popup?.close();popup=null;options.onFinalized?.(message)}
  const editor = (): HTMLElement => {
    disposeEnvelope?.();disposeEnvelope=undefined;disposeMRI?.();disposeMRI=undefined;disposeCT?.();disposeCT=undefined
    const p = options.project()
    if (!p) { stop(); return note('Load an MRI or CT before preparing a planning surface.') }
    if (projectId !== p.id) { stop(); projectId = p.id; finalizedNotice=''; drafts.clear(); cachedCT=null; controlsScrollTop=0; preview.resetView(); source = ''; popup?.close(); preview.setOpenings([],null); paint(null, 'Choose a source to preview.') }
    const root = h('div', { class: 'surface-workspace' }), candidates = options.scene.surfaceCandidates, active = options.scene.mountingSurface
    const mris=p.assets.filter(a=>a.modality==='mri'||a.role==='anatomy'&&a.modality!=='ct')
    const cts = p.assets.filter(a => a.role === 'ct' || a.modality === 'ct'), skulls = candidates.filter(c => c.origin === 'mesh' && c.kind === 'skull'), brains = candidates.filter(c => c.origin === 'mesh' && c.kind === 'brain')
    const rawBrains = brains.filter(c => !p.assets.some(a => a.id === c.id && isCorticalEnvelope(a)))
    const readyBrains = rawBrains.filter(c => c.ready)
    const savedEnvelope = p.assets.find(a => a.corticalEnvelope)
    const envelopeIds = readyBrains.map(c => c.id)
    const groups = [...skulls.map(c => ({ value: c.id, label: `Skull mesh · ${c.name}`, ids: [c.id] })), ...cts.map(a => ({ value: a.id, label: `CT bone threshold · ${a.name}`, ids: [a.id] })), ...mris.map(a=>({value:`mri:${a.id}`,label:`MRI estimate · ${a.name}`,ids:[p.assets.find(surface=>surface.mriSurface?.sourceAssetId===a.id)?.id??a.id]})), ...(mris.length && envelopeIds.length && options.saveEnvelope ? [{ value: 'envelope', label: 'Cortical envelope · bridges brain folds', ids: savedEnvelope ? [savedEnvelope.id] : [] }] : []), ...(rawBrains.length ? [{ value: 'brain', label: 'Folded brain surface (approximate)', ids: rawBrains.map(c => c.id) }] : [])]
    if (!groups.some(g => g.value === source)) source = cts.length&&!active.assetIds.length ? cts[0].id : groups.find(g => g.ids.length === active.assetIds.length && g.ids.every(id => active.assetIds.includes(id)))?.value ?? groups[0]?.value ?? ''
    const rebuild = () => root.replaceWith(editor())
    root.append(section('Planning surface', [readout('Active source', active.assetIds.map(id => p.assets.find(a => a.id === id)?.name ?? id).join(', ') || 'None finalized'), note('Adjust the draft beside the preview, then choose Finalize surface to use it for placement.')]))
    const sourcePicker = selectField('Planning source', source, groups, v => {
      stop(); preview.resetView(); controlsScrollTop=0; source = v; preview.setOpenings([], null); paint(null, 'Preparing preview…'); rebuild()
    })
    sourcePicker.classList.add('surface-source-picker')
    const sourceControls = section('Other surface files', [button('Import aligned skull mesh…', options.importSkull), button('Import aligned brain mesh (approximation)…', options.importBrain), ...(!cts.length ? [button('Add aligned CT…', options.addCT)] : []), note('Choose CT bone threshold above for a CT scan. Choose MRI estimate for an MRI, then select a brain-mask or dark-band method.'), note("Imported surfaces must already line up with your images and use millimetres. The app does not align them for you. A brain surface can be used as an approximation, but it does not show the skull or its thickness.")])
    sourceControls.classList.add('surface-source-controls')
    let review: ReturnType<typeof surfaceReview> | null = null
    const group = groups.find(g => g.value === source), asset = cts.find(a => a.id === source), status = note(''), finalize = button('Finalize surface', () => {}, 'primary')
    finalize.disabled = true
    const reset=button('Reset draft',()=>{
      if(options.project()?.id!==p.id||!asset)return
      stop();drafts.delete(`${p.id}:${asset.id}`);preview.setOpenings([],null);paint(null,'Restoring saved settings…');rebuild()
    })
    reset.disabled=!asset||!options.scene.imageForAsset(asset.id)
    reset.title=asset?'Discard draft changes for this CT and restore its last finalized settings and opening markers, or starting defaults if none were saved.':'Imported meshes have no editable surface preparation settings.'
    preview.setSelectedOpening(null)
    headerActions=[...(groups.length ? [sourcePicker] : []),reset,finalize]
    popup?.actions.replaceChildren(...headerActions)
    preview.setCTDisplay(asset ? options.scene.display?.skullOpacity ?? .85 : null)
    const mri=mris.find(a=>`mri:${a.id}`===source)
    if (source === 'envelope') {
      const reference = mris.find(a => a.id === p.frame.referenceAssetId) ?? mris[0]
      const image = options.scene.imageForAsset(reference.id)
      let offsetMm = savedEnvelope?.corticalEnvelope?.offsetMm ?? 0
      let result: MeshGeometry | undefined, run: AbortController | undefined
      const resetOffset = () => { offsetMm = savedEnvelope?.corticalEnvelope?.offsetMm ?? 0; rebuild() }
      reset.disabled = false
      reset.title = 'Restore the last finalized envelope offset.'
      reset.addEventListener('click', resetOffset)
      if (image) {
        const volume = new VolumeSampler(image), bounds = imageBounds(volume, true)
        preview.setBounds(bounds)
        review = surfaceReview(volume, bounds, options.crosshair?.() ?? bounds[0].map((v, i) => (v + bounds[1][i]) / 2) as Vec3,
          point => options.moveCrosshair?.(point), undefined, 'MRI')
      } else preview.setBounds(null)
      const update = () => {
        run?.abort()
        const job = new AbortController()
        run = job
        finalize.disabled = true
        result = undefined
        status.textContent = 'Building the cortical envelope…'
        const request: CorticalEnvelopeRequest = { surfaces: readyBrains.map(c => c.geometry!), offsetMm }
        void withActivity('Building the cortical envelope…', () =>
          workerTask<CorticalEnvelopeRequest, MeshGeometry>(
            () => new Worker(new URL('../workers/corticalEnvelope.ts', import.meta.url), { type: 'module' }),
            request, { signal: job.signal },
          ),
        ).then(geometry => {
          if (job.signal.aborted || options.project()?.id !== p.id) return
          result = geometry
          paint(geometry, 'Cortical envelope preview · drag to rotate · scroll to zoom.')
          review?.update(geometry)
          finalize.disabled = false
          status.textContent = 'Check the envelope against the MRI slices before finalizing.'
        }).catch(error => {
          if (job.signal.aborted) return
          paint(null, 'Cortical envelope unavailable.')
          review?.update(null)
          status.textContent = error instanceof Error ? error.message : String(error)
        })
      }
      disposeEnvelope = () => run?.abort()
      finalize.addEventListener('click', () => {
        if (!result || finalize.disabled || options.project()?.id !== p.id) return
        finalize.disabled = true
        const geometry = result
        status.textContent = 'Saving the cortical envelope…'
        void options.saveEnvelope!({ geometry, sourceAssetIds: envelopeIds, offsetMm }).then(() =>
          finish('Surface finalized — cortical envelope. Active for approximate placement.'),
        ).catch(error => {
          status.textContent = error instanceof Error ? error.message : String(error)
          finalize.disabled = !result
        })
      })
      root.append(section('Cortical envelope', [
        note('Wraps the outer brain meshes with a convex surface that bridges folds and the gap between hemispheres. The envelope estimates a mounting boundary from the brain shape. It does not measure the skull or skull thickness.'),
        numberField('Outward offset (mm)', offsetMm, value => { offsetMm = value; update() }, { min: 0, max: 20, step: .5 }),
        ...readyBrains.map(candidate => readout('Brain mesh', candidate.name)),
      ]))
      update()
    } else if(mri){
      const image=options.scene.imageForAsset(mri.id)
      if(image&&options.saveMRI){
        const tool=mriSurfaceEditor({project:options.project,asset:mri,image,crosshair:options.crosshair,bytes:options.bytes??(()=>undefined),preview,finalize,reset,status,save:async value=>{await options.saveMRI!(value);finish(`${value.settings.method === 'brain-envelope' ? 'MRI cortical envelope' : ['dark-band','dark-band-head'].includes(value.settings.method)?'MRI dark-band boundary':'MRI boundary estimate'} finalized. Active for approximate placement; skull bone and thickness are not measured.`)},pick:point=>options.moveCrosshair?.(point)})
        disposeMRI=tool.dispose;review=tool.review;root.append(tool.controls)
      }else root.append(note('Waiting for MRI loading…'))
    } else if (asset) {
      root.append(...assetDerivation(asset))
      const image = options.scene.imageForAsset(asset.id)
      if (!image) root.append(note('Waiting for CT image loading…'))
      else {
        const native = nativeSurfaceSpacing(image)
        const volume = new VolumeSampler(image), fullBounds = imageBounds(volume, true), saved = asset.imageDisplay?.skull
        disposeCT=()=>disposeCTSurface(volume)
        preview.setBounds(fullBounds)
        const key = `${p.id}:${asset.id}`, baseline = JSON.stringify([asset.sha256, saved]), savedOpenings=(p.surfaceOpenings??[]).filter(o=>o.assetId===asset.id), openingBaseline=JSON.stringify(savedOpenings)
        let draft = drafts.get(key)
        if (!draft || draft.baseline !== baseline) { draft = { smoothing: saved ? structuredClone(saved.smoothing) : { iterations: 30, maximumDisplacementMm: .5 }, representation: saved?.representation === 'outer' ? 'outer' : 'smooth', showThreshold: true, openingBaseline, edits: structuredClone(saved?.edits ?? []), redo: [], openings: structuredClone((p.surfaceOpenings??[]).filter(o=>o.assetId===asset.id)), brushMode:'navigate', brushDiameter:4, center: saved?.center ? [...saved.center] : undefined, componentSeed: saved?.componentSeed ? [...saved.componentSeed] : undefined, baseline, threshold: saved?.threshold ?? ctDefaults(image).min, bounds: structuredClone(saved?.bounds ?? fullBounds), spacingMm: saved?.spacingMm ?? (saved ? 2 : 0.5), components: saved?.components ?? (saved ? 'all' : 'largest'), dirty: false }; drafts.set(key, draft) }
        const d = draft
        const samplingGrid = note('')
        const describeSampling = () => {
          const dims = d.bounds[0].map((lo, k) => Math.max(0, Math.ceil((d.bounds[1][k] - lo) / d.spacingMm)))
          samplingGrid.textContent = `${dims.join(' × ')} samples · ${dims.reduce((a, b) => a*b, 1).toLocaleString()} total. The selected spacing is used for extraction.`
        }
        describeSampling()
        if(d.openingBaseline!==openingBaseline){
          const previous=new Map((JSON.parse(d.openingBaseline) as SurfaceOpening[]).map(o=>[o.id,o])),external=new Map(savedOpenings.map(o=>[o.id,o]))
          d.openings=d.openings.filter(o=>!previous.has(o.id)||external.has(o.id))
          for(const o of savedOpenings)if(JSON.stringify(previous.get(o.id))!==JSON.stringify(o)){const index=d.openings.findIndex(item=>item.id===o.id);if(index>=0)d.openings[index]=structuredClone(o);else d.openings.push(structuredClone(o))}
          d.openingBaseline=openingBaseline
        }
        let readyResult:Awaited<ReturnType<typeof buildCTSurface>>|null=null
        let configKey:string|null=null, readyGeometry:MeshGeometry|null=null, openingTools:ReturnType<typeof surfaceOpeningTools>|null=null
        const annotations=()=>{preview.setOpenings(d.openings,configKey);review?.refresh();openingTools?.refresh()}
        review = surfaceReview(volume,fullBounds,d.slicePoint ?? options.crosshair?.() ?? d.center ?? fullBounds[0].map((v,k)=>(v+fullBounds[1][k])/2) as Vec3,point=>{d.slicePoint=[...point];options.moveCrosshair?.(point)}, {state:()=>({mode:d.brushMode,diameter:d.brushDiameter,thicknessMm:d.spacingMm,strokes:d.edits,threshold:d.showThreshold?d.threshold:undefined,openings:d.openings,key:configKey??'',selectedOpening:openingTools?.selected()??null}),onSelectOpening:id=>openingTools?.select(id),onStroke:stroke=>{if(d.edits.length>=2000||d.edits.reduce((n,s)=>n+s.points.length,0)+stroke.points.length>50000){status.textContent='Correction budget reached. Undo or reset corrections before adding more.';return};d.edits.push(stroke);d.redo=[];schedule();brushHistory()}})
        review.update(null)
        const settings = (): CTSurfaceOptions & { threshold: number; bounds: [Vec3, Vec3] } => ({ representation: d.representation, smoothing: structuredClone(d.smoothing), edits: structuredClone(d.edits), center: d.center ? [...d.center] : undefined, componentSeed: d.componentSeed ? [...d.componentSeed] : undefined, threshold: d.threshold, bounds: structuredClone(d.bounds), spacingMm: d.spacingMm, components: d.components })
        const signature = () => JSON.stringify([p.id, asset.id, asset.sha256, settings()])
        const reusable = (snapshot: string, input: ReturnType<typeof settings>) => cachedCT?.signature === snapshot ? cachedCT.result : options.scene.ctSurfaceGeometry?.(asset.id, ctSurfaceKey(input), asset.sha256) ?? null
        const current = (token: number, snapshot: string) => token === generation && signature() === snapshot && options.project()?.id === p.id && options.project()?.assets.some(a => a.id === asset.id && a.sha256 === asset.sha256)
        const update = async (final: boolean) => {
          controller?.abort(); controller = new AbortController(); const signal = controller.signal, token = ++generation, snapshot = signature(), input = settings()
          const baseline = JSON.stringify([options.project()?.planningSurfaceIds, options.project()?.assets.find(a=>a.id===asset.id)?.imageDisplay?.skull])
          finalize.disabled = true; status.textContent = final ? 'Finalizing CT surface…' : 'Updating CT surface…'
          try {
            const result = reusable(snapshot, input) ?? (final && lastKey === snapshot && readyResult ? readyResult : await buildCTSurface(volume, input.threshold, input.bounds, input, signal))
            if (!current(token, snapshot) || baseline !== JSON.stringify([options.project()?.planningSurfaceIds, options.project()?.assets.find(a=>a.id===asset.id)?.imageDisplay?.skull])) return
            const r = result.report, outer=r.outer
            const report = outer ? `Center RAS: ${outer?.center.map(v=>v.toFixed(2)).join(' · ')} mm. Outer skull: ${outer ? (outer.coverage*100).toFixed(1)+'% angular coverage' : ''}. ${r.removedVoxels.toLocaleString()} segmentation samples removed. ${outer?.missingRays ?? 0} unsupported directions (${outer?.croppedRays ?? 0} at crop edges); ${outer?.discontinuousFaces ?? 0} discontinuous faces omitted. Gaps are excluded from mounting support.`
              : `Thresholded bone mesh · ${(result.tris.length / 3).toLocaleString()} triangles. ${r.removedVoxels.toLocaleString()} samples removed by bone-piece selection.`
            paint(result, final ? `Final mesh · ${(result.tris.length / 3).toLocaleString()} triangles. Drag to rotate · scroll to zoom.` : `${d.representation === 'outer' ? 'Outer skull projection' : 'Thresholded CT bone'} draft · ${Number(input.spacingMm?.toFixed(4))} mm sampling. Drag to rotate · scroll to zoom.`)
            cachedCT={signature:snapshot,result};readyResult=result;readyGeometry=result;configKey=openingSurfaceKey({...input,center:outer?.center??input.center})
            review?.update(result);annotations()
            lastKey = snapshot; status.textContent = [report, ctCropFeedback(r.boundaryFaces, input.bounds, fullBounds)].filter(Boolean).join(' '); finalize.disabled = false
            if (final) {
              const next = { ...input, center: outer?.center ?? input.center, show: true, useForPlanning: true }
              options.scene.prepareCTPreview(asset.id, ctSurfaceKey(next), result)
              d.baseline = JSON.stringify([asset.sha256, next]); d.openingBaseline=JSON.stringify(d.openings); d.dirty = false
              options.edit(project => { project.surfaceOpenings=[...(project.surfaceOpenings??[]).filter(o=>o.assetId!==asset.id),...structuredClone(d.openings)]; project.planningSurfaceIds = [asset.id]; for (const a of project.assets) if (a.imageDisplay?.skull) a.imageDisplay.skull.useForPlanning = false; const a = project.assets.find(a => a.id === asset.id)!; a.imageDisplay ??= { min: ctDefaults(image).min, max: ctDefaults(image).max, opacity: .85, colormap: 'cool', visible: true }; a.imageDisplay.skull = next })
              const stale=d.openings.filter(o=>o.reviewed&&o.avoid&&o.surfaceKey!==configKey).length
              status.textContent = `Finalized and selected for planning. ${stale ? `${stale} previous opening exclusion(s) are inactive until re-reviewed for this surface. ` : ''}${report}`
              finish(`Surface finalized — ${asset.name}. ${stale?`${stale} stale opening priorities need review.`:'Active for placement.'}`)
            }
          } catch (error) { if (token !== generation || signal.aborted) return; lastKey = ''; readyResult=null;readyGeometry=null;configKey=null;review?.update(null);annotations(); paint(null, 'Invalid draft — adjust the controls. The saved surface is unchanged.'); status.textContent = `Surface update failed: ${String(error).replace(/^(Error: )+/, '').replace(/[.\s]+$/, '')}. The saved surface is unchanged.`; finalize.disabled = true }
        }
        const schedule = () => { d.dirty = true; describeSampling(); readyResult=null;readyGeometry=null;configKey=null;annotations(); stop(); finalize.disabled = true; status.textContent = 'Updating after you finish adjusting…'; timer = setTimeout(() => { void update(false) }, 300) }
        const slider = (label: string, value: number, min: number, max: number, step: number, change: (n: number) => void) => {
          const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(label === 'Bone threshold' ? 'any' : step), value: String(value), ariaLabel: label }), exact = h('input', { type: 'number', min: String(min), max: String(max), step: String(label === 'Bone threshold' ? 'any' : step), value: String(value), ariaLabel: `${label} value` })
          const changed = (control: HTMLInputElement) => { if (!Number.isFinite(control.valueAsNumber) || !control.checkValidity()) { control.reportValidity(); return }; input.value = exact.value = control.value; change(control.valueAsNumber); schedule() }
          input.addEventListener('input', () => changed(input)); exact.addEventListener('change', () => changed(exact))
          return h('label', { class: 'image-slider' }, [h('span', {}, [label]), input, exact])
        }
        const undoBrush=button('Undo brush stroke',()=>{const stroke=d.edits.pop();if(stroke){d.redo.push(stroke);schedule();brushHistory()}})
        const redoBrush=button('Redo brush stroke',()=>{const stroke=d.redo.pop();if(stroke){d.edits.push(stroke);schedule();brushHistory()}})
        const brushHistory=()=>{undoBrush.disabled=!d.edits.length;redoBrush.disabled=!d.redo.length}
        brushHistory()
        const brush=section('Edit the skull model',[
          sliceEditButtons(()=>d.brushMode,mode=>{d.brushMode=mode;review?.refresh()}),
          h('label',{class:'image-slider'},[h('span',{},['Brush diameter (mm)']),h('input',{type:'range',min:'.5',max:'30',step:'.5',value:String(d.brushDiameter),ariaLabel:'Brush diameter (mm)',oninput:(event:Event)=>{d.brushDiameter=Number((event.target as HTMLInputElement).value);brushSize.textContent=`${d.brushDiameter.toFixed(1)} mm`}}),note('')]),
          h('div',{class:'button-row'},[undoBrush,redoBrush,button('Reset brush corrections',()=>{d.redo=[...d.edits].reverse();d.edits=[];schedule();brushHistory()})]),
          note("Brush over a CT slice to remove unwanted parts of the skull model or restore bone removed by the current settings. Red shows removal; green shows restoration. The original CT is unchanged. The preview updates after each stroke. Choose Finalize surface to use your changes for placement."),
        ])
        const brushSize=note(`${d.brushDiameter.toFixed(1)} mm`);brush.append(brushSize)
        openingTools=surfaceOpeningTools({assetId:asset.id,sha256:asset.sha256,frameId:p.frame.id,bounds:()=>d.bounds,spacing:()=>d.spacingMm,key:()=>configKey,geometry:()=>readyGeometry,measure:candidate=>measureCTOpening(candidate,point=>volume.sample(point),d.threshold,native,Math.max(...image.hdr!.pixDims.slice(1,4))),items:()=>d.openings,onSelection:id=>{preview.setSelectedOpening(id);review?.refresh()},setItems:items=>{d.openings=items;annotations()},crosshair:()=>options.crosshair?.()??d.center??fullBounds[0].map((v,k)=>(v+fullBounds[1][k])/2) as Vec3,locate:point=>{options.moveCrosshair?.(point);review?.locate(point)}})
        preview.setInteraction({rimTolerance:()=>Math.max(3,(openingTools?.manualRadius()??1)+2*d.spacingMm),select:id=>openingTools?.select(id),add:(point,candidate)=>{const measured=candidate?measureCTOpening(candidate,p=>volume.sample(p),d.threshold,native,Math.max(...image.hdr!.pixDims.slice(1,4))):null;openingTools?.addAt(point,measured??undefined)},locate:point=>{options.moveCrosshair?.(point);review?.locate(point)}})
        const thresholdOverlay = h('input', { type: 'checkbox', checked: d.showThreshold, ariaLabel: 'Highlight voxels above bone threshold' })
        thresholdOverlay.addEventListener('change', () => { d.showThreshold = thresholdOverlay.checked; review?.refresh() })
        const fields = [
          selectField('CT surface method', d.representation, [
            { value: 'smooth', label: 'Thresholded bone mesh' },
            { value: 'outer', label: 'Outer skull projection' },
          ], value => { d.representation = value as 'smooth' | 'outer'; schedule(); rebuild() }),
          note(d.representation === 'outer'
            ? 'Projects the outside of the selected bone toward a point inside the skull. Large changes between neighboring directions can produce spikes. Compare with Thresholded bone mesh to inspect the bone directly.'
            : 'Builds a smoothed mesh directly around the selected CT bone. Both the outer and inner bone walls are shown. Adjust Bone threshold until the cyan outlines follow the bright skull in the slices. The preview uses the same skull color and transparency as the main 3D viewer.'),
          slider('Bone threshold', d.threshold, Math.min(ctDefaults(image).lo, d.threshold), Math.max(ctDefaults(image).hi, d.threshold), 1, v => { d.threshold = v }),
          h('label', {}, [thresholdOverlay, ' Highlight voxels above bone threshold']),
          note('Yellow marks every voxel above the cutoff. Cyan outlines show the resulting surface after bone-piece selection and brush edits. Raise the threshold if yellow includes scalp or other unwanted tissue. CT values may use a different scale after preprocessing.'),
          note("Build a model of the outside of the skull so the app can check where a chamber could sit. Bone threshold sets the lowest CT brightness counted as bone. Crop keeps the selected part of the scan. Openings and cut edges stay open."),
          readout('Selected skull bone', d.componentSeed ? `Selected at ${d.componentSeed.map(v=>v.toFixed(2)).join(' · ')} mm RAS` : 'Largest connected piece of bone (automatic)'),
          ...(options.crosshair ? [button('Select skull at crosshair',()=>{d.componentSeed=[...options.crosshair!()];schedule();rebuild()}), ...(d.representation === 'outer' ? [button('Set inner reference from crosshair',()=>{d.center=[...options.crosshair!()];schedule();rebuild()})] : [])] : []),
          ...(d.representation === 'outer' ? d.center ? d.center.map((v,k)=>numberField(`Inside-skull reference ${['R','A','S'][k]} (mm)`,v,n=>{d.center![k]=n;schedule()},{min:fullBounds[0][k],max:fullBounds[1][k]})) : [note("The app chooses a point inside the skull to help find its outer surface. If the preview looks wrong, click inside the brain in a CT slice, then choose Set inner reference from crosshair. This point is not an electrode target.")] : []),
          button('Reset automatic skull selection',()=>{delete d.componentSeed;delete d.center;d.components='largest';schedule();rebuild()}),
          selectField('Surface detail (sample spacing)', String(d.spacingMm), Array.from(new Set([0.1, 0.2, 0.25, 0.5, 1, 2, 4, native, d.spacingMm])).filter(v=>v>=.05 && v<=20).sort((a,b)=>a-b).map(v=>({value:String(v),label:`${Number(v.toFixed(4))} mm${v===native?' · native voxel spacing':v<native?' · finer sampling':''}`})), v => { d.spacingMm = Number(v); schedule() }), samplingGrid, selectField('Separate pieces of bone', d.components, [{ value: 'largest', label: 'Keep the main connected piece' }, { value: 'all', label: 'Keep every piece' }], v => { d.components = v as 'all' | 'largest'; delete d.componentSeed; schedule(); rebuild() })]
        const cropFields: HTMLElement[] = []
        for (let axis=0;axis<3;axis++) for(let side=0;side<2;side++) cropFields.push(slider(`${['R','A','S'][axis]} crop ${side?'maximum':'minimum'} (mm)`,d.bounds[side][axis],fullBounds[0][axis],fullBounds[1][axis],.1,v=>{d.bounds[side][axis]=v}))
        cropFields.push(button('Reset crop', () => { d.bounds = structuredClone(fullBounds); schedule(); rebuild() }), note("Check that the cyan outlines follow the outside of the skull in all three CT slices. If the scanner bed is included, crop it out. If the skull is missed, click bright skull bone and choose Select skull at crosshair. Check deep inward curves and the underside of the skull especially carefully: this method may miss them. Sampling starts at 0.5 mm. Finer sampling processes more voxels and triangles. Progress appears in the lower-right status area. Finalize surface saves the model shown in the preview."))
        const smoothing = section('Smooth the skull surface', [
          slider('Smoothing passes', d.smoothing?.iterations ?? 12, 0, Math.max(100, d.smoothing?.iterations ?? 12), 2, value => { d.smoothing = { iterations: value, maximumDisplacementMm: d.smoothing?.maximumDisplacementMm ?? d.spacingMm * .5 } }),
          slider('Maximum smoothing movement (mm)', d.smoothing?.maximumDisplacementMm ?? d.spacingMm * .5, 0, Math.max(2, d.smoothing?.maximumDisplacementMm ?? 0), .05, value => { d.smoothing = { iterations: d.smoothing?.iterations ?? 12, maximumDisplacementMm: value } }),
          note('More passes soften small bumps along the thresholded bone. Maximum movement limits how far the surface can move from its original position, in millimetres. Set passes to 0 to turn smoothing off. Openings and cut edges remain open. Review the cyan outlines before finalizing; smoothing changes the surface used for placement.'),
        ])
        root.append(section('CT preparation · live', fields), smoothing, section('Crop the scan', cropFields), brush, openingTools.element)
        finalize.addEventListener('click', () => { if (finalize.disabled) return; clearTimeout(timer); void update(true) })
        if (reusable(signature(), settings())) { clearTimeout(timer); void update(false) } else if (lastKey !== signature()) { clearTimeout(timer); timer = setTimeout(() => { void update(false) }, 300) } else {finalize.disabled = !latest;readyGeometry=latest;if(latest){configKey=openingSurfaceKey({...settings(),center:saved?.center??d.center});review?.update(latest);annotations()}}
      }
    } else if (group) {
      preview.setInteraction(null)
      preview.setBounds(null)
      if (group.value === 'brain') root.append(section('Brain surface files', [
        ...rawBrains.map(candidate => h('p', { class: 'asset' }, [candidate.name])),
        note('In the demo these are the left and right outer cortical surfaces. They show the shape of the brain and can serve as a rough placement boundary.'),
      ]))
      const selected = group.ids.map(id => candidates.find(c => c.id === id))
      const geometry = selected.every(c => c?.ready) ? selected.map(c => c!.geometry!) : []
      const meshKey = JSON.stringify(group.ids.map(id=>[id,p.assets.find(a=>a.id===id)?.sha256]))
      if (geometry.length && lastKey !== meshKey) {
        lastKey = meshKey
        const pts: number[] = [], tris: number[] = []
        for (const g of geometry) { const base = pts.length/3; for (let i=0;i<g.pts.length;i++) pts.push(g.pts[i]); for (let i=0;i<g.tris.length;i++) tris.push(g.tris[i]+base) }
        paint({pts:new Float32Array(pts),tris:new Uint32Array(tris)},'Imported mesh draft · drag to rotate · scroll to zoom.')
      }
      finalize.disabled = !geometry.length
      if (!geometry.length) status.textContent = selected.some(c=>c?.overlapsImage===false) ? 'The mesh does not overlap the reference image bounds. Check alignment and units.' : 'Mesh geometry is unavailable or failed structural checks.'
      finalize.addEventListener('click', () => { if (options.project()?.id !== p.id || !group.ids.every(id => options.scene.surfaceCandidates.some(c => c.id===id&&c.ready))) return; options.edit(project=>{project.planningSurfaceIds=[...group.ids];for(const a of project.assets)if(a.imageDisplay?.skull)a.imageDisplay.skull.useForPlanning=false});status.textContent='Surface selected for planning.';finish(`Surface finalized — ${group.ids.map(id=>p.assets.find(a=>a.id===id)?.name??id).join(', ')}. Active for placement.`) })
      root.append(note("Check that the imported surface lines up with the images. The app can check the file structure, but it cannot tell whether the surface represents the correct anatomy or is correctly aligned."))
    }
    root.append(sourceControls)
    if (group) {
      const visual=h('div',{class:'surface-visual-panes'},[preview.element])
      if(review){
        const divider=h('div',{class:'surface-view-divider',role:'separator',tabIndex:0,ariaLabel:'Resize surface and image slice views'})
        divider.setAttribute('aria-orientation','vertical')
        divider.setAttribute('aria-valuemin','20');divider.setAttribute('aria-valuemax','80')
        divider.title='Drag to resize. Arrow keys adjust; double-click resets.'
        const resize=(value:number)=>{split=Math.max(20,Math.min(80,value));visual.style.setProperty('--surface-slices',`${split}fr`);visual.style.setProperty('--surface-model',`${100-split}fr`);divider.setAttribute('aria-valuenow',String(Math.round(split)))}
        let pointer:number|null=null
        divider.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer=e.pointerId;divider.setPointerCapture(e.pointerId);e.preventDefault()})
        divider.addEventListener('pointermove',e=>{if(pointer!==e.pointerId)return;const r=visual.getBoundingClientRect();if(r.width>0)resize(100*(e.clientX-r.left)/r.width)})
        for(const type of ['pointerup','pointercancel','lostpointercapture'])divider.addEventListener(type,()=>{pointer=null})
        divider.addEventListener('dblclick',()=>resize(35))
        divider.addEventListener('keydown',e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();resize(split+(e.key==='ArrowRight'?3:-3))})
        resize(split);visual.replaceChildren(review.element,divider,preview.element)
      }else visual.style.gridTemplateColumns='minmax(0,1fr)'
      const previewSection = section('Live surface preview', [visual,h('div',{class:'surface-preview-footer'},[preview.message,status])])
      previewSection.classList.add('surface-preview-section')
      root.append(previewSection)
    }

    const controls = h('div', { class: 'surface-editor-controls' })
    const children = Array.from(root.children)
    for (const child of children.slice(0, group ? -1 : undefined)) controls.append(child)
    root.insertBefore(controls, root.children[0])
    return root
  }
  const open = () => {
    if (popup?.root.isConnected) { popup.activate(); return }
    const contents = editor()
    popup = floatingWindow('Planning surface editor', 'Planning surface editor', () => {
      controlsScrollTop = popup?.content.querySelector('.surface-editor-controls')?.scrollTop ?? 0
      stop(); disposeCT?.(); disposeCT=undefined
      // Retain one CPU geometry for reopening; release this window's GPU and DOM resources.
      preview.release(); latest=null; lastKey=''; headerActions=[]
      popup?.actions.replaceChildren(); popup?.content.replaceChildren(); popup=null
    })
    popup.root.classList.add('surface-editor-window')
    popup.content.append(contents)
    const controls = contents.querySelector('.surface-editor-controls')
    if (controls) controls.scrollTop = controlsScrollTop
    popup.actions.replaceChildren(...headerActions)
    editorKey = sourcesKey()
  }
  const synchronize = () => {
    const p=options.project()
    if (popup?.root.isConnected && p?.assets.some(a => a.id === source && (a.modality === 'ct' || a.role === 'ct'))) preview.setCTDisplay(options.scene.display?.skullOpacity ?? .85)
    if (!p || projectId && projectId !== p.id) { stop(); popup?.close(); popup = null; cachedCT=null; drafts.clear(); preview.resetView() }
    if (p&&popup?.root.isConnected && editorKey !== sourcesKey()) {
      stop(); popup.content.replaceChildren(editor()); editorKey = sourcesKey()
    }
  }
  const panel = (): HTMLElement => {
    synchronize()
    const p=options.project()
    if (!p) return note('Load an MRI or CT before preparing a planning surface.')
    const active = options.scene.mountingSurface
    const disable=button('Stop using surface for placement',()=>{options.edit(project=>{project.planningSurfaceIds=[];for(const a of project.assets)if(a.imageDisplay?.skull)a.imageDisplay.skull.useForPlanning=false})})
    disable.disabled=!active.assetIds.length
    return section('Planning surface', [
      readout('Active source', active.assetIds.map(id => p.assets.find(a => a.id === id)?.name ?? id).join(', ') || 'None finalized'),
      note("Open the editor to choose a CT skull surface, a cortical envelope, an MRI boundary estimate, or an aligned mesh. Adjust it beside the live preview, then finalize the boundary used for placement."),
      ...(finalizedNotice?[h('p',{class:'surface-finalized-notice',role:'status'},[finalizedNotice])]:[]),
      button('Open surface editor…', open, 'primary'),
      note('Closing the editor keeps the last finalized surface active. Draft edits are not used for placement until finalized.'),
      disable,
      note("Stop using turns off this surface for placement calculations. It does not delete the saved surface."),
    ])
  }
  return { panel, cancel: () => {
    synchronize()
    if (!options.project() || projectId && options.project()?.id !== projectId) { stop(); popup?.close(); popup = null }
    else if (!popup?.root.isConnected) stop()
  } }
}
