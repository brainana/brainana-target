import { speciesLabels, type Species } from '@brainana/planning-core/model.ts'
import {addDirectElectrode,setDirectEntry,directPlanning} from '@brainana/planning-core/electrode-frame.ts'
import { settings } from '@brainana/planning-core/optimization.ts'
import { h } from '@brainana/ui/dom.ts'
import type { PlannerFeature } from './contracts.ts'
import { note, section, readout, textField, button, selectField } from '../ui/controls.ts'
export const planningIntents = [{value:'direct',label:'Plan an electrode implant without a chamber'},{value:'headpost-direct',label:'Plan headpost and electrode without a chamber'},{value:'headpost',label:'Plan a headpost implant'},{value:'headpost-chamber',label:'Plan headpost and chamber'},{value:'headpost-combined',label:'Plan headpost, chamber and electrode'},{value:'chamber',label:'Plan a chamber implant'},{value:'electrode',label:'Already have a chamber; plan an electrode'},{value:'combined',label:'Plan chamber and electrode together'}]
export let pendingPlanningIntent: import('@brainana/planning-core/model.ts').PlanningIntent = 'combined'
export function setPendingPlanningIntent(value: string): void { pendingPlanningIntent = value as typeof pendingPlanningIntent }
export const speciesOptions = [{ value: '', label: 'Unspecified' }, ...Object.entries(speciesLabels).map(([value, label]) => ({ value, label }))]
export let pendingSpecies: Species | undefined
export function setPendingSpecies(value: string): void {
  pendingSpecies = Object.hasOwn(speciesLabels, value) ? value as Species : undefined
}
export let pendingProjectName = ''
export function setPendingProjectName(value:string):void{pendingProjectName=value}
export function clearPendingProjectName(): void { pendingProjectName = '' }
export const dataFeature: PlannerFeature = {
  id: 'data',
  label: 'Project',
  glyph: '▤',
  description: 'Project identity, reference and coordinate frame',
  render: (ctx) => {
    const p = ctx.project
    return h('div', {}, [
      ...(!p ? [textField('Project name', pendingProjectName, v => { pendingProjectName = v }), note('Start a project using the options in the workspace. Project files are opened and saved from the top toolbar.')] : []),
      ...(p
        ? [
            section('Current project', [
              selectField('Planning task', p.planningIntent ?? 'combined', planningIntents, value => ctx.edit(d => { d.planningIntent = value as typeof d.planningIntent;if(directPlanning(d)){const e=d.electrodes.find(x=>x.id===ctx.selectedElectrode)??d.electrodes[0];if(e)setDirectEntry(e,ctx.crosshair());else addDirectElectrode(d,ctx.crosshair())} d.planning = {...settings(d), mode:value==='electrode'?'existing':'new'} as typeof d.planning })),
              note('Changing the task keeps saved hardware and coordinates. Save a chamber project now and reopen it later to plan electrodes using the same chamber.'),
              textField('Project name', p.name, (v) =>
                ctx.edit((d) => {
                  d.name = v
                }),
              ),
              selectField('Species', p.species ?? '', speciesOptions, value => ctx.edit(d => {
                if (value) d.species = value as Species
                else delete d.species
              })),
              button('Export dimensions and STL meshes',()=>ctx.actions.exportGeometry?.()),
              note('Saved projects also contain coordinates.csv and dimensions-and-coordinates.json. Mesh export creates a separate ZIP with chamber, drilled grid, finalized skull/surface, target and electrode reference models.'),
              readout('Images', String(p.assets.filter(a => a.role !== 'surface'&&a.role!=='mask').length)),
              readout('Headposts',String(p.headposts?.length??0)),
              readout('Chambers', String(p.chambers.length)),
              readout('Electrodes', String(p.electrodes.filter(e => e.hardware).length)),
              readout('Targets', String(p.targets.length)),
              note('The project name is saved as metadata and used for the project filename. Adding hardware or images updates this summary without renaming the project.'),
              readout('Subject', p.provenance.subject ?? 'Standalone anatomy'),
              readout('Scan', p.provenance.scan ?? 'Original image'),
              readout(
                'Reference image',
                p.assets.find((a) => a.id === p.frame.referenceAssetId)?.modality === 'ct' ? 'CT' : 'MRI',
              ),
              readout('Coordinates', 'RAS · millimetres'),
              ...(ctx.scene.unitsSpecified
                ? []
                : [
                    note(
                      'This image does not specify spatial units. Its coordinates are interpreted as millimetres.',
                    ),
                  ]),
              note(
                "Coordinates use millimetres: R is right, A is toward the front of the head, and S is toward the top. They are relative to the image coordinate system, not a stereotactic frame.",
              ),
            ]),
          ]
        : []),
    ])
  },
}
