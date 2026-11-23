import { targetsForElectrode } from '@brainana/planning-core/electrode-frame.ts'
import { maximumSeatedTilt, refitChamberTrajectories } from '@brainana/planning-core/placement-adjustment.ts'
import {assessHole} from '@brainana/planning-core/grid-assessment.ts'
import {hoverHelp} from '../ui/hoverHelp.ts'
import { gridCompatibility } from '@brainana/planning-core/hardware.ts'
import { fitTarget } from '@brainana/planning-core/targeting.ts'
import { h } from '@brainana/ui/dom.ts'
import { gridHoles, closestHole, seatedGridHeight,gridFitsChamber,gridSeatHeight } from '@brainana/planning-core/geometry.ts'
import type { PlannerFeature } from './contracts.ts'
import { note, section, button,numberField,readout,selectField } from '../ui/controls.ts'
export const gridFeature: PlannerFeature = {
  id: 'grid',
  label: 'Grid holes',
  glyph: '07',
  description: 'Choose an access hole',
  render: (ctx) => {
    const p = ctx.project
    const e = p?.electrodes.find(e => e.id === ctx.selectedElectrode) ?? p?.electrodes[0]
    const g = p?.grids.find(grid => grid.id === e?.gridId)
    const c = p?.chambers.find(chamber => chamber.id === g?.chamberId)
    if (!p || !c || !g) return note('Load anatomy to configure a grid.')
    const compatibility = gridCompatibility(e ?? p.electrodes[0])
    if (!compatibility.available || g.enabled === false)
      return section('Grid unavailable for this device', [note(!compatibility.available?compatibility.reason:g.enabled === false ? 'This chamber has no guide grid enabled. Define its grid in Chamber specifications.' : compatibility.reason)])
    const holes = gridHoles(c, g),
      n = Math.floor(g.count / 2),
      map = h('div', { class: 'grid-map' })
    map.style.gridTemplateColumns = `repeat(${g.count},1fr)`
    for (let y = n; y >= -n; y--)
      for (let x = -n; x <= n; x++) {
        const actual=holes.some(h=>h[0]===x&&h[1]===y),assessment=e?assessHole(p,c,g,e,[x,y]):null
        const selected=!!p.display.gridPreviewHoles?.some(v=>v.electrodeId===e?.id&&v.hole[0]===x&&v.hole[1]===y)
        const active=e?.hole[0]===x&&e.hole[1]===y
        const cell=button('',()=>{if(!e)return;ctx.edit(d=>{d.display.gridPreviewHoles??=[];const index=d.display.gridPreviewHoles.findIndex(v=>v.electrodeId===e.id&&v.hole[0]===x&&v.hole[1]===y);if(index>=0)d.display.gridPreviewHoles.splice(index,1);else d.display.gridPreviewHoles.push({electrodeId:e.id,hole:[x,y]})})},`hole${selected?' selected':''}${active?' active-electrode':''}${!actual?' outside':assessment?.wallClear?assessment.hitsTarget?' target-hit':' clear':' blocked'}`)
        cell.title=`Grid hole (${x}, ${y}) — ${!actual?'outside the grid':!assessment?.wallClear?'blocked by grid / chamber wall':assessment.hitsTarget?'reaches the valid target':'clear of the wall; does not reach the target'}${selected?' · comparison path visible':''}. Click to toggle this comparison path.`
        if(actual&&ctx.scene.colors)cell.style.background=!assessment?.wallClear?ctx.scene.colors.gridBlocked:assessment.hitsTarget?ctx.scene.colors.gridTarget:ctx.scene.colors.gridSafe
        cell.setAttribute('aria-label',cell.title);cell.setAttribute('aria-pressed',String(selected));cell.disabled=!actual||!e
        map.append(cell)
      }
    const content=h('div', {}, [
      section('Grid angle and seating',[
        ...(c.placementState !== 'unplaced' && p.electrodes.some(device => device.gridId === g.id && device.targetId) ? [
          note('Adjust the grid in Review to preview angles and the resulting paths to linked targets.'),
          ...(ctx.actions?.openReview ? [button('Open Review', ctx.actions.openReview)] : []),
        ] : [
        selectField('Grid seating',g.seating??'flush',[{value:'flush',label:'Automatic — top edge flush with chamber lip'},{value:'manual',label:'Custom vertical position — may protrude'}],value=>ctx.edit(d=>{const grid=d.grids.find(x=>x.id===g.id)!;grid.seating=value as 'flush'|'manual';grid.seatHeight=gridSeatHeight(c,g)})),
        button('Fit grid inside chamber',()=>ctx.edit(d=>{const grid=d.grids.find(x=>x.id===g.id)!;grid.seating='flush';grid.seatHeight=seatedGridHeight(c,grid)})),
        ...(!gridFitsChamber(c,g)?[note('This grid extends above the chamber lip or below its shortest wall. Fit the grid inside the chamber, reduce tilt / thickness, or change chamber dimensions.')]:[]),
        ...([['Grid tilt relative to chamber (°)','tiltAngle',0,maximumSeatedTilt(c,{...g,minimumThickness:g.minimumThickness||2})],['Grid tilt direction around chamber (°)','tiltAzimuth',-360,360],['Hole pattern rotation (°)','rotation',-360,360],['Grid base position relative to chamber top (mm)','seatHeight',-100,100],['Grid thin-edge thickness (mm)','minimumThickness',0,50],['Guide-hole diameter (mm)','holeDiameter',.05,10]] as const).map(([label,key,min,max])=>numberField(label,key==='seatHeight'?gridSeatHeight(c,g):g[key]??(key==='holeDiameter'?.7:0),value=>ctx.edit(d=>{const grid=d.grids.find(x=>x.id===g.id)!;grid[key]=value;if(key==='seatHeight')grid.seating='manual';if(key==='tiltAngle'&&value>0&&!(grid.minimumThickness??0))grid.minimumThickness=2;for(const device of d.electrodes.filter(x=>x.gridId===g.id))if(!gridHoles(c,grid).some(h=>h[0]===device.hole[0]&&h[1]===device.hole[1]))device.hole=[0,0]}),{min,max})),
        ]),
        readout('Wedge thin / thick edge',`${(g.minimumThickness??0).toFixed(2)} / ${((g.minimumThickness??0)+2*c.innerRadius*Math.tan((g.tiltAngle??0)*Math.PI/180)).toFixed(2)} mm`),
        readout('Channel tilt / direction',`${g.tiltAngle??0}° / ${g.tiltAzimuth??0}°`),
        note("All holes guide electrodes in the same direction. Tilting the grid changes that direction relative to the chamber. The hole colors show whether the selected electrode or guide tube would hit the grid edge or chamber wall at the target depth, or at the current depth if no target is selected. Compute placement also checks your marked areas to avoid."),
      ]),
      section('Compare grid trajectories', [
        readout('Target used for coloring',p.targets.find(t=>t.id===e?.targetId)?.name??(p.targets.length===1?p.targets[0].name:'Choose a target in Position')),
        note('Red: blocked by chamber/grid. Magenta: reaches the target within usable insertion depth. Green: wall-clear. The current electrode has a white border; toggled comparison paths have an extra outline. Colors can be changed in Settings.'),
        button('Clear comparison paths',()=>ctx.edit(d=>{d.display.gridPreviewHoles=d.display.gridPreviewHoles?.filter(v=>v.electrodeId!==e?.id)})),
        note(
          "This view looks down into the chamber. Before rotation, +X points right and +Y points up. A hole is usable only if the electrode and any guide tube fit through the grid and clear the chamber wall. Some holes can be blocked while others remain usable. Change the display colors in Settings.",
        ),
        map,
        note('Click any real hole to toggle its comparison path without turning off other paths or moving the defined electrode. Red paths are diagnostic only. Use Fit hole and depth to change the actual electrode. Target colors check geometry and insertion length; Compute placement also checks avoidance.'),
        note(e ? `${e.name}: hole (${e.hole.join(', ')})` : 'Select an electrode first.'),
      ]),
      section(
        'Target access',
        (e ? targetsForElectrode(p, e) : p.targets).length
          ? (e ? targetsForElectrode(p, e) : p.targets).map((t) => {
              const best=t.region&&e?gridHoles(c,g).map(hole=>({hole,...assessHole(p,c,g,{...e,targetId:t.id},hole)})).filter(a=>a.wallClear&&a.hitsTarget).sort((a,b)=>a.depth-b.depth)[0]:closestHole(c, g, t.point, e)
              if (!best) return note(t.region?`${t.name}: no reachable, wall-clear guide path enters this valid target region.`:`${t.name}: the device footprint does not fit inside this chamber bore.`)
              return h('div', { class: 'reach-row' }, [
                h('strong', {}, [t.name]),
                note(
                  `Closest hole (${best.hole.join(', ')}): ${best.miss.toFixed(2)} mm lateral miss · ${best.depth.toFixed(2)} mm depth`,
                ),
                button('Fit hole and depth', () => {
                  if (e)
                    ctx.edit((d) => {
                      fitTarget(d, e.id, t.id)
                      refitChamberTrajectories(d, c.id, e.id)
                    })
                }),
              ])
            })
          : [
              note(
                "Add targets to compare which grid holes point closest to them. This estimate assumes straight electrodes and parallel holes. Run Compute placement to check marked areas to avoid.",
              ),
            ],
      ),
    ])
    if(!ctx.hasPlacementPreview)return content
    const lock=(part:Element)=>{
      const readonly=h('fieldset',{disabled:true,class:'preview-readonly-grid'},[part])
      for(const control of readonly.querySelectorAll<HTMLElement>('button,input,select'))hoverHelp(control.closest<HTMLElement>('label')??control,'Apply or cancel the placement preview before changing its hardware dimensions or applied electrode. Comparison paths can be toggled while inspecting a preview.')
      return readonly
    }
    const [dimensions,comparisons,targetAccess]=Array.from(content.children)
    return h('div',{},[
      note('This is an unapplied placement preview. Comparison paths can be toggled for inspection. Apply or cancel the placement before changing the actual hole, insertion or grid dimensions.'),
      lock(dimensions),comparisons,lock(targetAccess),
    ])
  },
}
