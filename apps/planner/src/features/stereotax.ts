import type {PlannerFeature} from './contracts.ts'
import {measurementPanel} from '../ui/measurements.ts'
import {note} from '../ui/controls.ts'
export const stereotaxFeature:PlannerFeature={
 id:'stereotax',label:'Stereotax',glyph:'S',description:'Set up the frame, measure distances and align image coordinates to measured fiducials',
 render:ctx=>ctx.project?measurementPanel({current:()=>ctx.store.project,edit:ctx.edit,crosshair:ctx.crosshair,locate:point=>ctx.scene.moveCrosshair(point),configure:ctx.actions.openStereotax,save:ctx.actions.save}):note('Load anatomy to set up the stereotax and measure distances.'),
}
