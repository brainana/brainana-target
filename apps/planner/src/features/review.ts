import {reviewSetup} from './reviewSetup.ts'
import {measurementSummary,frameCalibrationSummary} from '../ui/measurements.ts'
import {electrodeAssembly} from '@brainana/planning-core/electrode-frame.ts'
import {inTargetRegion} from '@brainana/planning-core/target-region.ts'
import { h } from '@brainana/ui/dom.ts'
import { clearance, settings, softConflicts } from '@brainana/planning-core/optimization.ts'
import { trajectory,gridHoleClearance } from '@brainana/planning-core/geometry.ts'
import type { PlannerFeature } from './contracts.ts'
import { section, note, readout, button } from '../ui/controls.ts'
export const reviewFeature: PlannerFeature = {
  id: 'review',
  label: 'Review',
  glyph: '08',
  description: 'Check object positions and export the plan',
  render: (ctx) => {
    const p = ctx.project
    if (!p) return note('Load anatomy to review a plan.')
    return h('div', {}, [
      reviewSetup(ctx, p),
      measurementSummary(p),
      frameCalibrationSummary(p),
      section('Plan contents', [
        readout('Planning mode', settings(p).mode === 'existing' ? 'Existing chamber' : 'New chamber'),
        readout('Avoidance regions', String(p.avoidRegions?.length ?? 0)),
        readout('Targets', String(p.targets.length)),
        readout('Chambers', String(p.chambers.length)),
        readout('Electrodes', String(p.electrodes.length)),
        readout('Frame', `${p.frame.convention} · ${p.frame.units}`),
        note(
          "Review the model against your images and hardware measurements. Images must already be aligned; the app does not align MRI and CT. The Stereotax tab supports paired fiducial alignment, independent checks and measured tool offsets and slide zeros. Recheck any calibration marked as changed. Avoidance checks cover only the areas you marked. Separate checks test whether electrodes and guide tubes clear the grid and chamber walls.",
        ),
      ]),
      ...(ctx.actions.evaluatePlan ? [section('Evaluate placement', [
        button('Save locally and evaluate', ctx.actions.evaluatePlan),
        note('Open this plan in Evaluate placement to compare it with measured electrode tracks.'),
      ])] : []),
      ...p.electrodes.map((e) => {
        const {grid:g,chamber:c}=electrodeAssembly(p,e)!,
          t = trajectory(c, g, e)
        return section(e.name, [
          ...(c.placementState!=='unplaced'&&softConflicts(p,c,g,e,!e.direct&&settings(p).mode==='new').length?[note(`Soft preferences not met: ${softConflicts(p,c,g,e,!e.direct&&settings(p).mode==='new').map(r=>`${r.name} (${r.clearance.toFixed(2)} mm clearance)`).join(', ')}.`)]:[]),
          ...(e.direct?[readout('Mounting','Direct electrode — no chamber or grid'),readout('Placement',e.direct.unplaced?'Not placed':'Applied'),...(e.direct.preferredEntry?[readout('Skull entry RAS',e.direct.preferredEntry.map(v=>v.toFixed(2)).join(' · '))]:[])]:[readout('Grid tilt / direction',`${g.tiltAngle??0}° / ${g.tiltAzimuth??0}°`),
          readout('Grid / chamber wall',gridHoleClearance(c,g,e,e.hole,e.depth)<-1e-8?'Blocked — revise hole, angle or insertion':'Clear at current insertion'),
          readout('Grid hole', e.hole.join(', '))]),
          readout('Depth', `${e.depth.toFixed(2)} mm`),
          ...(p.targets.find(x=>x.id===e.targetId)?.region?[readout('Valid target region',inTargetRegion(p.targets.find(x=>x.id===e.targetId)!,t.tip)?'Tip inside region':'Tip outside region')]:[]),
          readout('Tip RAS', t.tip.map((v) => v.toFixed(2)).join(' · ')),
          readout(
            'Avoidance clearance',
            Number.isFinite(clearance(p, c, g, e))
              ? `${clearance(p, c, g, e).toFixed(2)} mm · ${clearance(p, c, g, e) < settings(p).margin - 1e-8 ? 'below margin' : 'meets margin'}`
              : 'No regions marked',
          ),
          readout(
            'Physical sites',
            String(e.contactCount * (e.hardware ? e.hardware.rows * e.hardware.columns : 1)),
          ),
          ...(e.hardware
            ? [
                readout('Hardware', e.hardware.model + (e.hardware.modified ? ' · customized' : '')),
                readout('Targeting shaft', String(e.hardware.selectedShank + 1)),
                readout('Recording channels', String(e.hardware.recordingChannels)),
                note(e.hardware.notes),
              ]
            : []),
          button('Inspect', () => ctx.selectElectrode(e.id)),
        ])
      }),
      section('Export', [
        button('Save portable project', ctx.actions.save, 'primary'),
        button('Export dimensions and STL meshes',()=>ctx.actions.exportGeometry?.()),
        button('Export coordinate table', ctx.actions.exportCoordinates),
        Object.assign(button('Export HTML report', ctx.actions.exportReport),{disabled:ctx.hasPlacementPreview,title:ctx.hasPlacementPreview?'Apply or cancel the placement preview first so the report picture and coordinates match.':''}),
        note(
          'Exports identify the reference image and coordinate frame. The portable project retains full precision and image checksums.',
        ),
      ]),
    ])
  },
}
