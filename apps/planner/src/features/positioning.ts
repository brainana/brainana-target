import {details} from '../hardware/disclosure.ts'
import {chamberOnlyTask} from '@brainana/planning-core/model.ts'
import { minimumInsertion, maximumInsertion } from '@brainana/planning-core/hardware.ts'
import { numberField, section, readout, button, selectField } from '../ui/controls.ts'
import { h } from '@brainana/ui/dom.ts'
import { chamberPlacementControls } from './chamber.ts'
import { targetingPanel } from './targeting.ts'
import type { PlannerFeature } from './contracts.ts'
import { note } from '../ui/controls.ts'
const chamberOnlySelection = new WeakMap<object, { projectId: string; chamberId: string }>()
export const positioningFeature: PlannerFeature = {
  id: 'positioning', label: 'Position', glyph: '06',
  description: 'Find chamber and electrode placement using targets and constraints',
  render: ctx => {
    if (!ctx.project) return note('Load anatomy and define chamber and electrode specifications first.')
    if (chamberOnlyTask(ctx.project.planningIntent)) {
      const project = ctx.project, selection = chamberOnlySelection.get(ctx.store)
      const chamber = project.chambers.find(c => selection?.projectId === project.id && c.id === selection.chamberId) ?? project.chambers[0]
      return h('div', {}, [
        ...(project.chambers.length > 1 ? [selectField('Choose chamber', chamber.id,
          project.chambers.map(c => ({ value: c.id, label: c.name })), chamberId => {
            chamberOnlySelection.set(ctx.store, { projectId: project.id, chamberId })
            ctx.refresh()
          })] : []),
        note('Choose a mounting point on the surface or enter the chamber’s measured coordinates. Save the project to keep the chamber and grid for later electrode planning.'),
        ...(chamber?.targetIds?.length ? [readout('Assigned targets', project.targets.filter(t => chamber.targetIds!.includes(t.id)).map(t => t.name).join(', '))] : []),
        chamberPlacementControls(ctx, chamber?.id),
      ])
    }
    const p = ctx.project, electrode = p.electrodes.find(e => e.id === ctx.selectedElectrode) ?? p.electrodes[0]
    const insertion = electrode && (electrode.direct?!electrode.direct.unplaced:p.chambers.find(c => c.id === p.grids.find(g => g.id === electrode.gridId)?.chamberId)?.placementState !== 'unplaced') ? section('Insertion adjustment', [numberField(electrode.direct?'Depth from electrode reference (mm)':'Depth from grid plane (mm)', electrode.depth, value => ctx.edit(d => { d.electrodes.find(e => e.id === electrode.id)!.depth = value }), { min: minimumInsertion(electrode), max: maximumInsertion(electrode) }), readout('Usable insertion range', `${minimumInsertion(electrode).toFixed(2)}–${maximumInsertion(electrode).toFixed(2)} mm`), note("Insertion depth starts at the selected grid-hole entry, or the chamber top if there is no grid. Changing depth moves the electrode tip and updates its distance from the target. Recompute placement after changing limits or areas to avoid.")]) : note('Insertion is fitted during placement search. Apply a candidate to enable manual depth adjustment.')
    return h('div', {}, [targetingPanel(ctx), insertion, ...(ctx.project.planningIntent==='electrode'?[button('Edit measured chamber specifications…',()=>document.querySelector<HTMLButtonElement>('button[data-feature="chamber"]')?.click())]:ctx.project.chambers.length ? [Object.assign(details(ctx.store,`manual-chamber:${p.id}`,[h('summary',{},['Measured chamber position and surface fit — advanced']),chamberPlacementControls(ctx)]),{className:'manual-placement-tools'})] : [])])
  },
}
