import {placementFailurePanel} from '../ui/placementFeedback.ts'
import type {FeatureContext} from './contracts.ts'
import type {Candidate,SearchResult,SearchOptions} from '@brainana/planning-core/optimization.ts'
import type {Vec3} from '@brainana/planning-core/model.ts'
import {settings} from '@brainana/planning-core/optimization.ts'
import {floatingArray} from '@brainana/planning-core/direct-placement.ts'
import {setupReady} from '../hardware/setup.ts'
import {placementInputs} from '../state/placementPreview.ts'
import {beginPlacementTask,cancelPlacementTask} from '../state/placementTasks.ts'
import {placementCompute} from './placementCompute.ts'
import {h} from '@brainana/ui/dom.ts'
import {section,note,button,selectField,readout,numberField,errorDialog} from '../ui/controls.ts'
interface State{key:string;projectId:string;tab:'automatic'|'manual';pending?:ReturnType<typeof beginPlacementTask>;selected?:number;result?:SearchResult;error?:string;options?:SearchOptions}
const states=new WeakMap<object,State>()
export function directPlacementPanel(ctx:FeatureContext):HTMLElement{
 const p=ctx.project!,e=p.electrodes.find(e=>e.id===ctx.selectedElectrode)??p.electrodes[0],key=JSON.stringify([placementInputs(p),e.id])
 let state=states.get(ctx.store)
 if(!state||state.key!==key){state={key,projectId:p.id,tab:state?.projectId===p.id?state.tab:'manual'};states.set(ctx.store,state)}
 const saved=state,target=p.targets.find(t=>t.id===e.targetId)??(p.targets.length===1?p.targets[0]:undefined),result=h('div',{ariaLive:'polite'})
 const options:SearchOptions={surface:ctx.scene.placementSurface??undefined}
 const apply=(candidate:Candidate)=>{const project=ctx.store.project!,task=beginPlacementTask(ctx.store,project);void placementCompute(project,e.id,target!.id,saved.options??options,candidate,task.signal).then(value=>{if(task.current(ctx.store.project))ctx.edit(d=>{d.electrodes=(value as typeof project).electrodes})}).catch(error=>{if(task.current(ctx.store.project))errorDialog(error)}).finally(task.finish)}
 const preview=(candidate:Candidate)=>{
  const project=ctx.store.project!,device=project.electrodes.find(x=>x.id===e.id)!
  device.direct!.pose=structuredClone(candidate.pose);device.direct!.unplaced=false;device.direct!.preferredEntry=candidate.surfaceCenter;device.depth=candidate.depth;device.targetId=target!.id
  ctx.previewPlacement(project,`Electrode entry preview · ${candidate.depth.toFixed(2)} mm insertion${candidate.softViolations?.length?` · ${candidate.softViolations.length} soft conflict(s)`:''}`,()=>apply(candidate))
 }
 const draw=()=>{
  result.replaceChildren()
  if(saved.pending){result.append(note('Computing electrode entry…'),button('Cancel calculation',()=>{cancelPlacementTask(ctx.store);delete saved.pending;saved.error='Calculation cancelled.';ctx.refresh()}));return}
  if(saved.error){result.append(note(saved.error));return}
  if(!saved.result)return
  const r=saved.result
  result.append(note(`${r.tested} entry locations tested · ${r.candidates.length} usable · ${r.rejectedDepth} outside electrode reach · ${r.rejectedAvoidance} blocked by hard avoidance.`))
  if(!r.candidates.length){result.append(placementFailurePanel(ctx,e,r,saved.options));return}
  result.append(selectField('Preview entry',String(saved.selected??0),r.candidates.map((c,i)=>({value:String(i),label:`Entry ${i+1} · ${c.depth.toFixed(2)} mm · ${c.softViolations?.length??0} soft conflicts`})),value=>{saved.selected=Number(value);preview(r.candidates[saved.selected]);details(r.candidates[saved.selected])}))
  const info=h('div');result.append(info)
  function details(c:Candidate){info.replaceChildren(readout('Skull entry R / A / S',c.surfaceCenter!.map(v=>v.toFixed(2)).join(' · ')),readout('Electrode reference R / A / S',c.pose.origin.map(v=>v.toFixed(2)).join(' · ')),...(c.softViolations??[]).map(v=>note(`Soft conflict: ${v.name} · ${v.clearance.toFixed(2)} mm clearance`)),button('Preview electrode here',()=>preview(c)),button('Place electrode here',()=>apply(c),'primary'))}
  details(r.candidates[saved.selected??0])
 }
 const search=async(entry?:Vec3)=>{
  if(!target)return
  const original=ctx.store.project!,task=beginPlacementTask(ctx.store,original)
  saved.pending=task;delete saved.selected;delete saved.error;delete saved.result;ctx.previewPlacement(null);draw()
  try{saved.options={...options,...(entry?{accessPoint:entry}:{})};const value=await placementCompute(original,e.id,target.id,saved.options,undefined,task.signal) as SearchResult;if(!task.current(ctx.store.project))return;saved.result=value;if(value.candidates.length)preview(value.candidates[0]);else ctx.previewPlacement(null)}
  catch(error){if(task.current(ctx.store.project))saved.error=error instanceof Error?error.message:String(error)}
  finally{const current=task.current(ctx.store.project);task.finish();if(saved.pending===task){delete saved.pending;if(current||task.signal.aborted)ctx.refresh()}}
 }
 const avoidance=h('select',{multiple:true,size:Math.min(4,(p.avoidRegions?.length??0)+1),ariaLabel:'Select avoidance areas'},[h('option',{value:'all',selected:settings(p).avoidRegionIds===undefined},['All marked areas']),...(p.avoidRegions??[]).map(r=>h('option',{value:r.id,selected:!!settings(p).avoidRegionIds?.includes(r.id)},[r.name]))]);avoidance.addEventListener('change',()=>ctx.edit(d=>{const ids=Array.from(avoidance.selectedOptions).map(o=>o.value);d.planning={...settings(d)};if(ids.includes('all'))delete d.planning.avoidRegionIds;else d.planning.avoidRegionIds=ids}))
 const ready=!!target&&!!e.hardware&&setupReady(e)
 const automatic=button('Compute electrode entries',()=>{void search()},'primary');automatic.disabled=!ready||!ctx.scene.placementSurface||!!saved.pending
 const manual=button(ctx.scene.surfaceFitActive?'Stop choosing skull entry':'Choose entry on 3D skull',()=>{if(ctx.scene.surfaceFitActive)ctx.scene.setSurfaceFitHandler?.(null);else ctx.scene.setSurfaceFitHandler?.(point=>{void search(point)});ctx.refresh()},'primary');manual.disabled=!ready||!ctx.scene.placementSurface||!!saved.pending
 automatic.dataset.guidePlacementAction='true'
 manual.dataset.guidePlacementAction='true'
 const crosshair=button('Fit entry at crosshair',()=>{void search(ctx.crosshair())});crosshair.disabled=!ready||!!saved.pending
 draw()
 return h('div',{},[section('Electrode without a chamber',[
  selectField('Choose electrode',e.id,p.electrodes.map(e=>({value:e.id,label:e.name})),ctx.selectElectrode),
  selectField('Select target',target?.id??'',[{value:'',label:'Choose target…'},...p.targets.map(t=>({value:t.id,label:t.name}))],id=>ctx.edit(d=>{d.electrodes.find(x=>x.id===e.id)!.targetId=id||null})),
  h('label',{},['Select avoidance areas',avoidance]),
  ...(p.electrodes.some(item=>!item.direct)?[note('This electrode is configured for direct entry.'), button('Switch to chamber electrode',()=>ctx.selectElectrode(p.electrodes.find(item=>!item.direct)!.id))]:[]),
  note('Placement uses the selected avoidance regions and the Hard / Soft / Ignore priorities set in Avoid and Planning surface.'),
  ...(!ready?[note('Configure and apply the electrode hardware and select a target before fitting an entry.')]:[]),
  ...(floatingArray(e)?[note('For a floating array, the selected needle is placed at the target using its physical length. The array base is estimated below the skull entry. Review this base against the brain surface; the app does not establish cortical contact, plan a bone opening or route the flexible cable. The connector is positioned separately in Electrode.')]:[note('Insertion is measured from your skull entry to the selected electrode tip. No chamber or guide grid is used.')]),
  numberField('Avoidance margin (mm)',settings(p).margin,value=>ctx.edit(d=>{d.planning={...settings(d),margin:value}}),{min:0,max:20,step:.1}),
 ]),
 h('div',{role:'tablist',ariaLabel:'Direct electrode placement method',class:'placement-tabs'},(['manual','automatic'] as const).map(tab=>{const b=button(tab==='automatic'?'Automatic':'Manual',()=>{ctx.scene.setSurfaceFitHandler?.(null);cancelPlacementTask(ctx.store);delete saved.pending;saved.tab=tab;ctx.refresh()});b.setAttribute('role','tab');b.setAttribute('aria-selected',String(saved.tab===tab));return b})),
 ...(!e.direct!.unplaced?[section('Adjust applied electrode reference',[...(['R','A','S'] as const).map((label,i)=>numberField(`Electrode reference ${label} (mm)`,e.direct!.pose.origin[i],value=>ctx.edit(d=>{d.electrodes.find(x=>x.id===e.id)!.direct!.pose.origin[i]=value}),{step:.1})),...(['X','Y','Z'] as const).map((label,i)=>numberField(`Electrode ${label} angle (°)`,e.direct!.pose.angles[i],value=>ctx.edit(d=>{d.electrodes.find(x=>x.id===e.id)!.direct!.pose.angles[i]=value}),{min:-360,max:360,step:1})),note('These edits move the applied electrode and invalidate previous fit results. Recompute to recheck the target and avoidance requirements.')])]:[]),
 section(saved.tab==='automatic'?'Automatic skull entry':'Manual skull entry',saved.tab==='automatic'?[automatic,note('Tests finalized-surface entry locations, favors soft avoidance preferences, then a shorter approach. For floating arrays, the array base and skull entry remain separate.')]:[manual,crosshair,note('Click a skull location to preview an electrode aimed at the target. Each click updates the preview. Place electrode here saves it.')]),result])
}
