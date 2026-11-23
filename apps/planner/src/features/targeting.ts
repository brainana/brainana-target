import {placementFailurePanel} from '../ui/placementFeedback.ts'
import { targetsForElectrode } from '@brainana/planning-core/electrode-frame.ts'
import {directPlacementPanel} from './directPlacement.ts'
import { beginPlacementTask, cancelPlacementTask } from '../state/placementTasks.ts'
import {targetRegionApproach,inTargetRegion} from '@brainana/planning-core/target-region.ts'
import {mountingSummary} from '../render/mountGeometry.ts'
import {placementInputs} from '../state/placementPreview.ts'
import {withActivity} from '../ui/activity.ts'
import { placementCompute } from './placementCompute.ts'
import { errorDialog } from '../ui/controls.ts'
import { avoidanceChoices } from '../ui/avoidanceChoices.ts'
import { openingAvoidRegions, openingConstraint, currentOpening } from '@brainana/planning-core/surface-openings.ts'
import { setupReady } from '../hardware/setup.ts'
import { h } from '@brainana/ui/dom.ts'
import {
  activeAvoidRegions,
  clearance,
  softAvoidRegions,
  softConflicts,
  regionClearance,
  settings,
} from '@brainana/planning-core/optimization.ts'
import { maximumInsertion, minimumInsertion, gridCompatibility } from '@brainana/planning-core/hardware.ts'
import { length, sub, trajectory,gridHoleClearance } from '@brainana/planning-core/geometry.ts'
import { fitTarget } from '@brainana/planning-core/targeting.ts'
import type { Candidate, SearchResult, SearchOptions } from '@brainana/planning-core/optimization.ts'
import type { FeatureContext } from './contracts.ts'
import { button, note, readout, section, selectField, numberField } from '../ui/controls.ts'

const placementTabs=new WeakMap<FeatureContext['store'],{ projectId: string; method: 'automatic'|'manual' }>()
const manualLimits=new WeakMap<FeatureContext['store'],{maximum:number;preference?:SearchOptions['manualPreference']}>()
// Keep results across panel refreshes, but never offer candidates for changed geometry.
const searches = new WeakMap<
  FeatureContext['store'],
  { key: string; pending?: boolean; result?: SearchResult; error?: string; selected?: number; showMap?: boolean; options?:SearchOptions }
>()

const manualSearches:typeof searches=new WeakMap()

export function chamberWorkflow(ctx: FeatureContext): HTMLElement[] {
  const config = settings(ctx.project!)
  return [
    selectField(
      'Can this chamber move?',
      config.mode,
      [
        { value: 'new', label: 'Optimize chamber location and electrode' },
        { value: 'existing', label: 'Chamber is fixed in the subject — optimize electrode only' },
      ],
      (mode) => {
        ctx.edit((d) => {
          d.planning = { ...settings(d), mode: mode as 'new' | 'existing' }
        })
        ctx.refresh()
      },
    ),
    note(
      config.mode === 'existing'
        ? "Enter the implanted chamber’s measured position and angles in Chamber. The search keeps the chamber in place and chooses a guide hole and electrode insertion depth to reach the target."
        : "Find locations for the chamber and electrode you defined that can reach the selected target. The search uses electrode length and your areas to avoid. It first tries to meet Soft avoidance preferences, then favors a shorter insertion. You can optionally mark a preferred access location to favor placements near it. This is a preference, not a final chamber position.",
    ),
  ]
}

export function targetingPanel(ctx: FeatureContext, includeWorkflow = true): HTMLElement {
  const p = ctx.project!
  const e = p.electrodes.find((x) => x.id === ctx.selectedElectrode) ?? p.electrodes[0]
  if (!e) return section('Define hardware first', [note('No chamber or electrode has been defined. Enter chamber dimensions in Chamber, then configure the electrode before finding a placement.')])
  if(e.direct)return directPlacementPanel(ctx)
  const allowed = targetsForElectrode(p, e)
  const target = allowed.find(x => x.id === e.targetId) ?? (allowed.length === 1 ? allowed[0] : undefined)
  const g = p.grids.find((x) => x.id === e.gridId)!
  const c = p.chambers.find((x) => x.id === g.chamberId)!
  const config = settings(p)
  const preference=placementTabs.get(ctx.store)
  const tab=preference?.projectId===p.id?preference.method:'manual',cache=tab==='manual'?manualSearches:searches
  const surface = ctx.scene.placementSurface
  const searchOptions = { surface: surface ?? undefined, supportSurfaces: ctx.scene.mountingSurface?.surfaces, supportSource: ctx.scene.mountingSurface?.source, supportAssetIds: ctx.scene.mountingSurface?.assetIds, expand: true }
  const results = h('div', { ariaLive: 'polite' })
  results.dataset.placementResults = `${p.id}:${e.id}`
  const key = JSON.stringify([placementInputs(p),e.id,target?.id])
  if (cache.get(ctx.store)?.key !== key) cache.delete(ctx.store)
  const apply = (candidate:Candidate):void => {
    ctx.scene.setSurfaceFitHandler?.(null)
    const original=ctx.store.project!,task=beginPlacementTask(ctx.store,original)
    void placementCompute(original,e.id,target!.id,cache.get(ctx.store)?.options??searchOptions,candidate,task.signal).then(value=>{
      if(!task.current(ctx.store.project))return
      const applied=value as typeof original
      ctx.edit(d=>{d.chambers=applied.chambers;d.grids=applied.grids;d.electrodes=applied.electrodes})
    }).catch(error=>{if(error?.name!=='AbortError'&&task.current(ctx.store.project))errorDialog(error)}).finally(task.finish)
  }
  const preview = (candidate: Candidate, index: number, blocked=false): void => {
    const saved=cache.get(ctx.store);if(saved)saved.selected=index
    const project = ctx.store.project!
    const chamber = project.chambers.find((x) => x.id === c.id)!
    const electrode = project.electrodes.find((x) => x.id === e.id)!
    if (config.mode === 'new') delete chamber.baseFit
    if(candidate.baseFit)chamber.baseFit=structuredClone(candidate.baseFit)
    if(candidate.gridConfiguration)Object.assign(project.grids.find(x=>x.id===g.id)!,candidate.gridConfiguration)
    chamber.pose = structuredClone(candidate.pose)
    delete chamber.placementState
    electrode.hole = [...candidate.hole]
    electrode.depth = candidate.depth
    electrode.targetId = target!.id
    for (const fit of candidate.linkedFits ?? []) {
      const linked = project.electrodes.find(item => item.id === fit.id)
      if (linked) { linked.hole = [...fit.hole]; linked.depth = fit.depth }
    }
    ctx.scene.setPlacementSelection?.(candidate.surfaceCenter??null)
    ctx.previewPlacement(
      project,
      `${blocked?'BLOCKED · inspection only':config.mode==='new'?'Selected surface location':'Selected trajectory'} · target miss ${candidate.miss.toFixed(2)} mm · clearance ${Number.isFinite(candidate.clearance) ? candidate.clearance.toFixed(2) + ' mm' : 'unrestricted'}${candidate.softViolations?.length?` · ${candidate.softViolations.length} soft conflict(s)`:''}`,
      blocked?undefined:() => apply(candidate),
    )
  }
  const renderResults = (): void => {
    const saved = cache.get(ctx.store)
    if (!saved || !target) return
    if(saved.pending){results.replaceChildren(note('Computing placement… results will appear here.'),button('Cancel placement calculation',()=>{cancelPlacementTask(ctx.store);cache.set(ctx.store,{key,error:'Placement calculation cancelled.'});ctx.refresh()}));return}
    if (saved.error) {
      results.replaceChildren(note(saved.error))
      return
    }
    const result = saved.result!
    if(config.mode==='new')ctx.scene.setPlacementMap?.(saved.showMap===false?[]:result.candidates,config.searchStep,candidate=>{preview(candidate,result.candidates.indexOf(candidate));renderResults()})
    const selectedIndex=saved.selected??0
    results.replaceChildren(
      ...(result.candidates[selectedIndex]?.baseFit?[note(mountingSummary({...c,baseFit:result.candidates[selectedIndex].baseFit}))]:[]),
      ...(saved.options?.accessPoint?[readout('Chosen skull point (R / A / S)',saved.options.accessPoint.map(v=>v.toFixed(2)).join(' · ')),note('These results fit the location you clicked. The chamber width and electrode dimensions are unchanged. Any new grid angle and fitted wall lengths are shown below and are saved only when you apply a result.')]:[]),
      ...(result.candidates.length&&config.mode==='new'?[button(saved.showMap===false?'Show feasible-center overlay':'Hide feasible-center overlay',()=>{saved.showMap=saved.showMap===false;renderResults();ctx.refresh()})]:[]),
      note(
        result.candidates.length
          ? config.mode==='new' ? "Click a colored area on the 3D surface to preview a nearby tested chamber location. The app adjusts the chamber angle and bottom edge for that location. Use the legend to identify possible locations and any nearby openings or Soft avoidance conflicts. The color map shows tested locations; it does not guarantee that every point between them will work. Drag to rotate the view. Choose Place chamber here to keep the previewed placement." : 'Choose an electrode trajectory through the fixed chamber, review it, then apply it.'
          : `No tested placement meets the current requirements${config.mode === 'existing' ? ' through this fixed chamber' : ''}. The chamber has not moved.`,
      ),
      ...((result.candidates[0]?.softViolations?.length??0)>0?[note("The search found possible placements, but each conflicts with at least one Soft avoidance preference. Review the listed conflicts before choosing one. Hard avoidance requirements are still met.")]:[]),
      note(
        `${result.tested} candidates tested · ${result.candidates.length} meet requirements. Not usable because of: ${result.rejectedDepth} depth, ${result.rejectedMiss} target miss, ${result.rejectedFootprint} device width, ${result.rejectedWall} grid/chamber wall, ${result.rejectedSupport} insufficient surface support, ${result.rejectedAvoidance} avoidance, ${result.rejectedOtherElectrodes} other electrodes.`,
      ),
      ...(!result.candidates.length?[placementFailurePanel(ctx,e,result,saved.options)]:[]),
      ...(!result.candidates.length&&result.manualConflict?[section('Chosen location overlaps hard avoidance',[note('This supported fit can be inspected, but cannot be applied. Choose another skull point or explicitly revise the avoidance drawing or priority if it is incorrect. Hard constraints have not been relaxed.'),...result.manualConflict.conflicts.map(conflict=>readout(conflict.name,`${conflict.clearance.toFixed(2)} mm clearance · requires ${config.margin.toFixed(2)} mm`)),button('Inspect blocked fit',()=>preview(result.manualConflict!.candidate,-1,true))])]:[]),
      ...(result.candidates.length
        ? [result.candidates[Math.min(selectedIndex,result.candidates.length-1)]]
            .map((candidate) =>
              section(config.mode==='new'?'Selected surface location':'Selected trajectory', [button('Preview selected fit',()=>preview(candidate,selectedIndex)),
                ...(config.mode==='existing'||saved.options?.accessPoint?[selectField(saved.options?.accessPoint?'Fit at chosen location':'Trajectory',String(selectedIndex),result.candidates.map((_,i)=>({value:String(i),label:saved.options?.accessPoint?`Fit ${i+1} · grid ${(result.candidates[i].gridConfiguration?.tiltAngle??0).toFixed(1)}° · depth ${result.candidates[i].depth.toFixed(1)} mm`:`Trajectory ${i+1}`})),v=>{const i=Number(v);preview(result.candidates[i],i);renderResults()})]:[]),
                readout('Chamber top centre (R / A / S)', candidate.pose.origin.map((x) => x.toFixed(2)).join(' · ')),
                ...(config.mode==='new'?[readout('Skull openings near chamber base',candidate.openingOverlap?'Yes — review opening priorities':'None identified'),readout('Ranking preference',config.seed?'Near your preferred access location':'Short insertion after soft preferences'),readout('Chamber angles X / Y / Z',candidate.pose.angles.map(v=>v.toFixed(1)+'°').join(' · '))]:[]),
                readout(
                  gridCompatibility(e).available ? 'Hole / depth' : 'Reference offset / depth',
                  `(${candidate.hole.join(', ')}) · ${candidate.depth.toFixed(2)} mm`,
                ),
                ...(candidate.baseFit?[readout('Fitted wall length range',`${Math.min(...candidate.baseFit.innerDepths,...candidate.baseFit.outerDepths).toFixed(2)}–${Math.max(...candidate.baseFit.innerDepths,...candidate.baseFit.outerDepths).toFixed(2)} mm`),readout('Extra rim clearance from surface detail',`${(candidate.baseFit.maxAdditionalGap??0).toFixed(2)} mm maximum`)]:[]),
                ...(candidate.gridConfiguration?[readout('Grid tilt / direction',`${candidate.gridConfiguration.tiltAngle}° / ${candidate.gridConfiguration.tiltAzimuth}°`)]:[]),
                readout('Target miss', `${candidate.miss.toFixed(2)} mm`),
                readout(
                  'Avoidance clearance',
                  Number.isFinite(candidate.clearance)
                    ? `${candidate.clearance.toFixed(2)} mm`
                    : 'No regions marked',
                ),
                ...(config.mode === 'new' && config.seed
                  ? [readout('Distance from preferred access location', `${candidate.displacement.toFixed(2)} mm`)]
                  : []),
                ...((candidate.softViolations?.length??0)>0?[note(`Soft constraints not met: ${candidate.softViolations!.map(r=>`${r.name} (${r.clearance.toFixed(2)} mm clearance)`).join(', ')}. Hard constraints remain satisfied.`)]:softAvoidRegions(p).length?[note('All soft avoidance preferences satisfied.')]:[]),
                button(
                  config.mode==='new'?'Place chamber here':'Apply electrode trajectory',
                  () => apply(candidate),
                  'primary',
                ),
              ]),
            )
        : [
            note(
              activeAvoidRegions(p).some(
                (r) =>
                  !target.region&&regionClearance(target.point, target.point, e.diameter, r) + config.maxMiss <
                  config.margin - 1e-8,
              )
                ? 'The target itself is inside an exclusion or its clearance margin. Every tip within the allowed target miss is blocked. Check the target and painted exclusions; changing the chamber origin cannot resolve this.'
                : "No tested placement meets all the current requirements. Check electrode length, chamber dimensions and areas to avoid. A smaller search step tests more locations and may find options this search missed. This result does not prove that every possible placement is blocked.",
            ),
          ]),
    )
  }
  renderResults()
  const selectionStatus = note(ctx.scene.surfaceFitActive ? 'Click the intended center of the chamber on the active 3D planning surface.' : '')
  selectionStatus.setAttribute('role', 'status')
  selectionStatus.dataset.placementSelectionStatus = results.dataset.placementResults
  const selectionMessage = (message: string) => {
    const active = Array.from(document.querySelectorAll?.<HTMLElement>('[data-placement-selection-status]') ?? [])
      .find(element => element.dataset.placementSelectionStatus === results.dataset.placementResults)
    selectionStatus.textContent = message
    if (active && active !== selectionStatus) active.textContent = message
  }
  const search = async (accessPoint?:import('@brainana/planning-core/model.ts').Vec3): Promise<void> => {
    if (!target) return
    const task=beginPlacementTask(ctx.store,ctx.store.project!)
    const pending={key,pending:true};cache.set(ctx.store,pending);renderResults()
    if (accessPoint) {
      if (!results.isConnected) ctx.refresh()
      selectionMessage('Checking the selected point, chamber rim and target reach…')
    }
    try {
      if (config.mode === 'new' && !surface)
        throw new Error(
          'Load an anatomical surface before searching for a new chamber. MRI intensity alone does not define a reliable mounting surface. Existing-chamber planning remains available.',
        )
      const original=ctx.store.project!
      searchButton.disabled=true
      manualButton.disabled=true
      const options:SearchOptions={...searchOptions,...(accessPoint?{accessPoint,maximumLocalGridTilt:localMaxTilt,manualPreference:manualLimit.preference??'grid'}:{})}
      const result = await placementCompute(original, e.id, target.id, options,undefined,task.signal) as SearchResult
      if(!task.current(ctx.store.project))return
      cache.set(ctx.store, { key, result, options })
      renderResults()
      if (result.candidates.length) preview(result.candidates[0], 0)
      else if(result.manualConflict){ctx.scene.setPlacementMap?.([],config.searchStep);preview(result.manualConflict.candidate,-1,true)}
      else {ctx.scene.setPlacementMap?.([],config.searchStep);ctx.previewPlacement(null)}
    } catch (error) {
      if(!task.current(ctx.store.project))return
      ctx.scene.setPlacementMap?.([],config.searchStep)
      ctx.previewPlacement(null)
      cache.set(ctx.store, { key, error: error instanceof Error ? error.message : String(error) })
    }
    finally { const current=task.current(ctx.store.project);task.finish();if(cache.get(ctx.store)===pending){cache.set(ctx.store,{key,error:'Placement calculation cancelled. Run Compute again.'})}if(current||task.signal.aborted){searchButton.disabled=false;ctx.refresh()} }
    renderResults()
    if (!task.signal.aborted && cache.get(ctx.store)?.key === key) {
      const current = Array.from(document.querySelectorAll?.<HTMLElement>('[data-placement-results]') ?? [])
        .find(element => element.dataset.placementResults === results.dataset.placementResults) ?? results
      current.firstElementChild?.scrollIntoView?.({ block: 'nearest' })
    }
  }
  const setting = (key: 'searchRadius' | 'searchStep' | 'maxMiss' | 'margin', value: number): void => {
    ctx.edit((d) => {
      d.planning = { ...settings(d), [key]: value }
    })
  }
  const missingHardware = c.placementState === 'unplaced' && (!e.hardware || !setupReady(e))
  const missingPose = config.mode === 'existing' && c.placementState === 'unplaced'
  const missingSurface = config.mode === 'new' && !surface
  const searchButton = button('Compute placement candidates', () => {void search()}, 'primary')
  searchButton.dataset.guidePlacementAction = 'true'
  searchButton.disabled = missingHardware || missingSurface || missingPose || !target || !!cache.get(ctx.store)?.pending
  searchButton.title = missingHardware ? 'Configure and apply the actual electrode hardware in Electrode before searching.' : missingPose ? "Enter the implanted chamber’s measured position and angles in Chamber (or the measured-position controls below), then accept those measurements." : missingSurface ? 'Open Planning surface to import an aligned mesh or build, inspect and select a CT-derived surface.' : !target ? 'Select a planning target first.' : ''
  const manualLimit=manualLimits.get(ctx.store)??{maximum:30};manualLimits.set(ctx.store,manualLimit)
  let localMaxTilt=manualLimit.maximum
  const activeManualButton = () => Array.from(document.querySelectorAll?.<HTMLButtonElement>('[data-placement-manual-button]') ?? [])
    .find(element => element.dataset.placementManualButton === results.dataset.placementResults)
  const setManualState = (picking: boolean) => {
    const text = picking ? 'Click skull in 3D · cancel selection' : 'Choose skull location to fit'
    manualButton.textContent = text
    const active = activeManualButton()
    if (active) active.textContent = text
  }
  const manualButton = button('Choose skull location to fit', () => {
    if (ctx.scene.surfaceFitActive) {
      ctx.scene.setSurfaceFitHandler?.(null)
      setManualState(false)
      selectionMessage('Location selection cancelled.')
      return
    }
    selectionMessage('Preparing the planning surface for picking…')
    manualButton.disabled = true
    const baseline = placementInputs(p)
    void withActivity('Preparing surface location selection…', () => {
      const current = ctx.store.project
      if (!activeManualButton() || !current || placementInputs(current) !== baseline) return
      ctx.scene.setSurfaceFitHandler?.(point => {
        ctx.scene.setSurfaceFitHandler?.(null)
        setManualState(false)
        void search(point)
      }, () => {
        selectionMessage('That click missed the active planning surface. Click the visible surface in 3D, or use Fit to bring it into view.')
      })
      setManualState(true)
      selectionMessage('Click the intended center of the chamber on the active 3D planning surface.')
    }).catch(error => {
      ctx.scene.setSurfaceFitHandler?.(null)
      selectionMessage(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (cache.get(ctx.store)?.pending) return
      manualButton.disabled = false
      const active = activeManualButton()
      if (active && ctx.scene.surfaceFitActive) active.disabled = false
    })
  })
  if (ctx.scene.surfaceFitActive) manualButton.textContent = 'Click skull in 3D · cancel selection'
  manualButton.dataset.placementManualButton = results.dataset.placementResults
  manualButton.dataset.guidePlacementAction = 'true'
  manualButton.disabled=searchButton.disabled||config.mode!=='new'
  const avoidance = h('select' , { multiple: true, size: Math.min(4, (p.avoidRegions?.length ?? 0) + 1), ariaLabel: 'Select avoidance areas' }, [h('option', { value: 'all', selected: config.avoidRegionIds === undefined }, ['All marked areas (including new areas)']), ...(p.avoidRegions ?? []).map(r => h('option', { value: r.id, selected: !!config.avoidRegionIds?.includes(r.id) }, [r.name]))])
  avoidance.addEventListener('change', () => ctx.edit(d => {
    const selected = Array.from(avoidance.selectedOptions).map(option => option.value)
    d.planning = { ...settings(d) }
    if (selected.includes('all')) delete d.planning.avoidRegionIds
    else d.planning.avoidRegionIds = selected
  }))
  const gap = clearance(p, c, g, e)
  return section('Choose hardware and constraints', [
    ...(config.mode==='new'?[h('div',{role:'tablist',ariaLabel:'Placement method',class:'placement-tabs'},(['manual','automatic'] as const).map(value=>{const b=button(value==='automatic'?'B · Automatic':'A · Manual',()=>{ctx.scene.setSurfaceFitHandler?.(null);cancelPlacementTask(ctx.store);placementTabs.set(ctx.store,{projectId:p.id,method:value});ctx.scene.setPlacementMap?.([],config.searchStep);ctx.previewPlacement(null);ctx.refresh();document.querySelector<HTMLButtonElement>('.placement-tabs [aria-selected="true"]')?.focus()});b.setAttribute('role','tab');b.setAttribute('aria-selected',String(tab===value));b.setAttribute('aria-controls',`placement-${value}`);b.tabIndex=tab===value?0:-1;b.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();ctx.scene.setSurfaceFitHandler?.(null);cancelPlacementTask(ctx.store);placementTabs.set(ctx.store,{projectId:p.id,method:event.key==='Home'?'manual':event.key==='End'?'automatic':tab==='automatic'?'manual':'automatic'});ctx.scene.setPlacementMap?.([],config.searchStep);ctx.previewPlacement(null);ctx.refresh();document.querySelector<HTMLButtonElement>('.placement-tabs [aria-selected="true"]')?.focus()}});return b}))]:[]),
    selectField('Choose chamber', c.id, p.chambers.filter(chamber => p.electrodes.some(device => p.grids.some(grid => grid.id === device.gridId && grid.chamberId === chamber.id))).map(chamber => ({ value: chamber.id, label: chamber.name })), id => {
      const device = p.electrodes.find(item => p.grids.some(grid => grid.id === item.gridId && grid.chamberId === id))
      if (device) ctx.selectElectrode(device.id)
    }),
    selectField('Choose electrode', e.id, p.electrodes.filter(device => device.gridId === g.id).map(electrode => ({ value: electrode.id, label: electrode.hardware ? electrode.name : `${electrode.name} — hardware not defined` })), ctx.selectElectrode),
    selectField(
      'Select target',
      target?.id ?? '',
      [...(allowed.length === 1 ? [] : [{ value: '', label: 'Choose a target…' }]), ...allowed.map((t) => ({ value: t.id, label: t.name }))],
      (id) => {
        ctx.edit((d) => {
          d.electrodes.find((x) => x.id === e.id)!.targetId = id || null
        })
        ctx.refresh()
      },
    ),
    ...(!target ? [note('Choose a target to enable placement. In Targets you can assign points to chambers and electrodes.')] : []),
    h('label', { class: 'field' }, [h('span', {}, ['Select avoidance areas']), avoidance]),
    readout('Headpost avoidance',p.headposts?.length?`${p.headposts.filter(h=>h.avoid).length} of ${p.headposts.length} included as conservative occupied-space envelopes`:'No headpost defined'),
    button(p.headposts?.length?'Review headposts and their avoidance settings':'Define an existing or planned headpost…',()=>document.querySelector<HTMLButtonElement>('button[data-feature="headposts"]')?.click()),
    ...(config.mode==='existing'&&gridCompatibility(e).available&&g.enabled!==false?[section('Optional angled-grid design search',[
      selectField('Grid orientation during search',g.angleSearch?'search':'fixed',[{value:'fixed',label:'Keep the defined physical grid angle'},{value:'search',label:'Search alternative angled grid designs'}],value=>ctx.edit(d=>{const grid=d.grids.find(x=>x.id===g.id)!;if(value==='fixed')delete grid.angleSearch;else{grid.angleSearch={maximum:15,step:5,azimuthStep:30};if(!(grid.minimumThickness??0))grid.minimumThickness=2}})),
      ...(g.angleSearch?([['Maximum grid tilt (°)','maximum',0,89],['Tilt sampling step (°)','step',1,30],['Tilt-direction sampling step (°)','azimuthStep',5,180]] as const).map(([label,key,min,max])=>numberField(label,g.angleSearch![key],value=>ctx.edit(d=>{d.grids.find(x=>x.id===g.id)!.angleSearch![key]=value}),{min,max,step:1})):[]),
      note(`This grid is shared by ${p.electrodes.filter(device=>device.gridId===g.id).length} electrode(s). Changing the grid angle changes the path of every linked electrode, so review each target. Use this search only when choosing or designing a different physical grid. It cannot change the angle of a grid already installed. The chamber stays in place while different grid angles and holes are tested. Applying a result saves that grid angle.`),
    ])]:[]),
    ...((p.surfaceOpenings??[]).length ? [h('details',{open:true},[
      h('summary',{},['Skull openings — avoidance priorities']),
      note(`${openingAvoidRegions(p).length} hard · ${openingAvoidRegions(p,'soft').length} soft. Hard constraints reject placement; soft preferences rank candidates and report any unavoidable conflict. Ignoring a marker does not create bone support across a real hole.`),
      h('div',{class:'button-row'},avoidanceChoices.map(choice=>button(`All ${choice.value}`,()=>ctx.edit(d=>{for(const o of d.surfaceOpenings??[])if(currentOpening(d,o)){o.constraint=choice.value as typeof o.constraint;o.avoid=choice.value!=='ignore';o.reviewed=true}})))),
      h('div',{class:'opening-priority-list'},(p.surfaceOpenings??[]).map(o=>{
        const field=selectField(o.name,openingConstraint(o),avoidanceChoices,value=>ctx.edit(d=>{const marker=d.surfaceOpenings!.find(x=>x.id===o.id)!;marker.constraint=value as typeof marker.constraint;marker.avoid=value!=='ignore';marker.reviewed=true}))
        field.querySelector('select')!.disabled=!currentOpening(p,o)
        return field
      })),
    ])] : []),
    note("All drawn areas are used by default. Hold Command on Mac or Ctrl on Windows to select several entries. If you select none, drawn areas are left out of this calculation. Skull openings have separate priority settings above. Hiding an area in 3D does not remove it from the calculation."),
    readout('Active avoidance constraints', `${activeAvoidRegions(p).length} hard · ${softAvoidRegions(p).length} soft`),
    ...(includeWorkflow ? [h('details', {}, [h('summary', {}, ['Access options — optional']), ...chamberWorkflow(ctx)])] : []),
    ...(missingHardware ? [note('Configure and apply the actual electrode in Electrode before finding a placement. The placeholder shaft is not a confirmed hardware specification.')] : []),
    ...(missingPose ? [note("The chamber dimensions are saved, but its position and angles have not been set. If it is already implanted, enter and accept those measurements in Chamber. Otherwise choose Optimize chamber location and electrode.")] : []),
    ...(config.mode === 'new'
      ? [h('details', {}, [h('summary', {}, ['Optional access preference and sampling']),
          button('Prefer access near crosshair (optional)', () =>
            ctx.edit((d) => {
              d.planning = { ...settings(d), seed: [...ctx.crosshair()] }
            }),
          ),
          readout(
            'Preferred access location RAS',
            config.seed
              ? config.seed.map((x) => x.toFixed(2)).join(' · ')
              : 'Automatic — based on target and surface',
          ),
          button('Use automatic access preference', () => ctx.edit(d => { d.planning = { ...settings(d), seed: null } })),
          numberField('Search step (mm)', config.searchStep, (v) => setting('searchStep', v), {
            min: 0.5,
            max: 10,
          }),
        ])]
      : []),
    ...(target?.region?[note('The tip must enter the valid target region. The point-target miss tolerance does not enlarge it.')]:[numberField('Allowed target miss (mm)', config.maxMiss, (v) => setting('maxMiss', v), {
      min: 0,
      max: 10,
    })]),
    numberField('Avoidance margin (mm)', config.margin, (v) => setting('margin', v), { min: 0, max: 20 }),
    readout(
      'Current shaft clearance',
      c.placementState === 'unplaced' ? 'Not placed' : Number.isFinite(gap)
        ? `${gap.toFixed(2)} mm · ${gap < config.margin - 1e-8 ? 'below margin' : 'meets margin'}`
        : 'No regions marked',
    ),
    ...(c.placementState!=='unplaced'&&softConflicts(p,c,g,e,config.mode==='new').length?[note(`Current placement conflicts with soft preferences: ${softConflicts(p,c,g,e,config.mode==='new').map(r=>r.name).join(', ')}.`)]:[]),
    readout('Planning electrode', e.name),
    ...(target
      ? [
          note(
            config.mode === 'new'
              ? "Aim from current origin changes the chamber angle but keeps its position. To find another location, compute placement candidates and review the previews."
              : gridCompatibility(e).available
                ? 'The search compares grid holes while keeping the chamber fixed.'
                : "The search adjusts insertion depth for the whole array. It does not move individual array electrodes into different guide holes or check an unmodelled holder.",
          ),
          readout(
            c.placementState === 'unplaced' ? 'Placement status' : 'Tip-to-target error',
            c.placementState === 'unplaced' ? 'Not placed — compute or enter a position' : target.region?(inTargetRegion(target,trajectory(c,g,e).tip)?'Inside valid target region':'Outside valid target region'):`${length(sub(trajectory(c, g, e).tip, target.point)).toFixed(2)} mm`,
          ),
          readout(
            'Allowed insertion range',
            `${minimumInsertion(e).toFixed(2)}–${maximumInsertion(e).toFixed(2)} mm`,
          ),
          readout(
            'Target depth at current hole',
            `${targetRegionApproach(c, g, e.hole, target, e).depth.toFixed(2)} mm`,
          ),
          ...(config.mode === 'new' && maximumInsertion(e) < c.height + 1
            ? [
                note(
                  `This needle has only ${maximumInsertion(e).toFixed(2)} mm usable reach, less than the ${c.height.toFixed(2)} mm chamber height plus 1 mm surface separation. It cannot reach an internal target through this chamber in the exterior-placement model. Use a longer actual shaft, a compatible shorter chamber, or a surface implantation workflow.`,
                ),
              ]
            : []),
          ...(c.placementState !== 'unplaced' ? [button(
            gridCompatibility(e).available
              ? 'Fit hole and depth to target'
              : 'Fit selected needle depth to target',
            () => ctx.edit((d) => fitTarget(d, e.id, target.id)),
          )] : []),
          ...(config.mode === 'new' && c.placementState !== 'unplaced'
            ? [button('Aim from current origin', () => ctx.edit((d) => fitTarget(d, e.id, target.id, true)))]
            : []),
          ...(missingSurface ? [
            section('Planning surface required', [
              note("Choose the surface the chamber will sit on. Import an already aligned skull surface, build one from CT, or use a brain surface as an approximation. Open Planning surface to prepare and finalize it."),
              button('Set up planning surface…', ctx.actions.preparePlanningSurface ?? ctx.actions.manageImages),
            ]),
          ] : []),
          section('Placement readiness', [
            readout('Chamber', c.name),
            readout('Electrode', missingHardware ? 'Configure and Apply hardware first' : e.name),
            readout('Target', target.name + (!e.targetId && allowed.length === 1 ? ' — selected automatically (only target)' : '')),
            readout('Current grid / wall path',c.placementState==='unplaced'?'Not placed':gridHoleClearance(c,g,e,e.hole,e.depth)<-1e-8?'Blocked — Compute will search other holes':'Clear'),
            readout('Planning surface', config.mode === 'existing' ? 'Fixed chamber measurements: surface not required' : missingSurface ? 'Missing — prepare a surface from your images first' : 'Ready'),
            ...(missingHardware ? [button('Open Electrode to configure hardware', () => document.querySelector<HTMLButtonElement>('button[data-feature="electrodes"]')?.click())] : []),

            ...(missingPose ? [note("Enter and accept the chamber’s measured position and angles in Chamber, or let the app find a new chamber location.")] : []),
          ]),
          ...(tab==='automatic'||config.mode==='existing'?[h('section',{role:'tabpanel',id:'placement-automatic',ariaLabel:'Automatic placement'},[searchButton])]:[]),
          ...(config.mode==='new'&&tab==='manual'?[h('section',{role:'tabpanel',id:'placement-manual',ariaLabel:'Manual placement'},[h('h3',{},['Choose a skull location']),
            note('Click a location to test it. If a fit is available, Place chamber here applies the preview. Choose a skull location even if it is blank on the map. The app tests chamber angles, fits the lower edge, and tries grid tilts up to the limit below to reach your target. Chamber diameter, electrode length and avoidance requirements stay unchanged. A nonzero limit can design a different physical grid; it does not tilt an already installed grid. Preview and apply a result before it is saved.'),
            ...(gridCompatibility(e).available&&g.enabled!==false?[numberField('Maximum alternative grid tilt (°)',localMaxTilt,value=>{localMaxTilt=value;manualLimit.maximum=value},{min:0,max:60,step:1})]:[note('This device has no compatible guide grid. Click-to-fit adjusts the chamber orientation and lower edge, keeping the device geometry unchanged.')]),
            selectField('Prefer placement with',manualLimit.preference??'grid',[{value:'grid',label:'Smallest grid tilt'},{value:'vertical',label:'Chamber closest to vertical (image superior)'},{value:'surface',label:'Chamber closest to skull surface normal'}],value=>{manualLimit.preference=value as SearchOptions['manualPreference']}),
            manualButton, selectionStatus,
            note('Blank skull areas are not classified as impossible. They may be untested, outside the sampled map coverage, or rejected by a fit check. Click there to test the location directly. Set the grid limit to 0 to retain your defined grid angle.'),
          ])]:[]),
          results,
          button('Locate target', () => ctx.scene.moveCrosshair(target.point)),
        ]
      : []),
    note(
      "After computing, review a preview and apply the placement you want. The app chooses starting directions from the target and surface. A preferred access location is optional. An implanted chamber stays at its measured position. The search tests many locations but cannot guarantee the single best possible placement.",
    ),
    note(
      surface
        ? "For a new placement, the app keeps the chamber body outside the planning surface and checks the bottom edge against it. It also checks the chamber against your marked areas to avoid. Review the fitted edge and any reported gaps."
        : 'No anatomical surface is loaded. New-chamber search requires a surface to keep the chamber outside the anatomy.',
    ),
    note(
      "Manual changes update target distance and clearance but do not automatically adjust the placement. Moving a chamber moves all its linked electrodes, so the search checks each shaft against your marked areas. It uses the finalized surface to fit the chamber edge. It does not check unmarked tissue or collisions between electrodes.",
    ),
  ])
}
