import type {Electrode} from '@brainana/planning-core/model.ts'
import type {SearchOptions,SearchResult} from '@brainana/planning-core/optimization.ts'
import {placementIssues,type PlacementControl} from '@brainana/planning-core/placement-feedback.ts'
import type {FeatureContext} from '../features/contracts.ts'
import {configureElectrode} from '../hardware/panel.ts'
import {h} from '@brainana/ui/dom.ts'
import {button,note,readout,section} from './controls.ts'
import {revealLabeledControl} from './revealField.ts'
export function placementFailurePanel(ctx:FeatureContext,e:Electrode,result:SearchResult,options:SearchOptions={}):HTMLElement {
 const issues=placementIssues(ctx.project!,e,result,options)
 const open=(control:PlacementControl)=>{
  if(control.electrodeField){configureElectrode(ctx,e,control.electrodeField);return}
  document.querySelector<HTMLButtonElement>(`button[data-feature="${control.feature}"]`)?.click()
  if(control.field)requestAnimationFrame(()=>revealLabeledControl(document.querySelector('.feature-panel')??document,control.field!))
 }
 const root=section('Why placement failed',[
  note('These are observed limits in the tested placements. Counts identify the first failed check for each candidate; later checks may not have run.'),
  ...issues.map((issue,i)=>h('article',{class:'placement-issue'},[
   h('h4',{},[issue.title+(issue.count?` · ${issue.count} rejected`:'')]),note(issue.explanation),
   h('details',{open:i===0},[h('summary',{},['Limiting parameters and where to review them']),...issue.parameters.map(p=>readout(p.name,p.value)),...issue.guidance.map(note),h('div',{class:'placement-followups'},issue.controls.map(control=>button(control.label,()=>open(control))))]),
  ])),
  ...(!issues.length?[note('No specific constraint failure was recorded. Review the selected surface, target and search coverage before retrying.')]:[]),
  note('Review values against your actual hardware and intended constraints. Nothing is adjusted automatically. After applying specification changes, return to Position and calculate again. A different entry or finer sampling may find another solution; this result does not prove every placement is impossible.'),
 ])
 root.classList.add('placement-failure-panel');return root
}
