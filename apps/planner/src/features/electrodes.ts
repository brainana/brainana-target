import {addDirectElectrode,setDirectEntry,directPlanning} from '@brainana/planning-core/electrode-frame.ts'
import {connectorPanel} from '../hardware/connectorPanel.ts'
import { h } from '@brainana/ui/dom.ts'
import { hardwarePanel } from '../hardware/panel.ts'
import { newId } from '@brainana/planning-core/model.ts'
import type { PlannerFeature } from './contracts.ts'
import { button, note, section, textField, selectField } from '../ui/controls.ts'
export const electrodesFeature: PlannerFeature = {
  id: 'electrodes',
  label: 'Electrode',
  glyph: '05',
  description: 'Name and configure electrode hardware',
  render: (ctx) => {
    const p = ctx.project
    if (!p) return note('Load anatomy to explore trajectories.')

    const e = p.electrodes.find((x) => x.id === ctx.selectedElectrode) ?? p.electrodes[0]
    const g = p.grids.find(grid => grid.id === e?.gridId) ?? p.grids[0]
    const c = p.chambers.find(chamber => chamber.id === g?.chamberId)
    const picker = selectField(
      'Choose electrode',
      e?.id ?? '',
      p.electrodes.map((e) => ({ value: e.id, label: e.hardware ? e.name : `${e.name} — hardware not defined` })),
      ctx.selectElectrode,
    )
    const add = button('Add electrode', () => {
      let id = newId()
      ctx.edit((d) => {
        if(directPlanning(d)||!g||!c){id=addDirectElectrode(d,ctx.crosshair()).id;return}
        d.electrodes.push({
          id,
          name: `Electrode ${d.electrodes.length + 1}`,
          gridId: g.id,
          hole: [0, 0],
          depth: 30,
          diameter: 0.3,
          contactCount: 1,
          contactSpacing: 1,
          contactLength: 0.5,
          length: 150,
          color: '#67d9d1',
          targetId: null,
        })
      })
      ctx.selectElectrode(id)
    })
    if (!e) return section('Electrodes', [add])
    return h('div', {}, [
      section('Define electrode hardware', [
        textField('Electrode name', e.name, value => ctx.edit(d => { d.electrodes.find(x => x.id === e.id)!.name = value })),
        ...(e.hardware || p.electrodes.length > 1 ? [picker] : []),
        ...(!e.hardware ? [note('No electrode hardware is defined yet. Name this device, then configure its actual hardware below.')] : []),
        selectField('Mounting method',e.direct?'direct':'chamber',[{value:'direct',label:'Direct electrode implant — no chamber'},...(!g||!c?[]:[{value:'chamber',label:'Through a chamber'}])],value=>ctx.edit(d=>{const el=d.electrodes.find(x=>x.id===e.id)!;if(value==='direct')setDirectEntry(el,ctx.crosshair());else{delete el.direct;el.gridId=g!.id;el.hole=[0,0]}})),
        ...(!e.direct && p.grids.length > 1 ? [selectField('Mounting chamber', e.gridId, p.grids.map(grid => ({
          value: grid.id, label: p.chambers.find(chamber => chamber.id === grid.chamberId)!.name,
        })), value => { ctx.edit(d => {
          const electrode = d.electrodes.find(item => item.id === e.id)!
          electrode.gridId = value; electrode.hole = [0, 0]
          const chamber = d.chambers.find(item => item.id === d.grids.find(grid => grid.id === value)?.chamberId)
          if (chamber?.targetIds?.length && electrode.targetId && !chamber.targetIds.includes(electrode.targetId)) electrode.targetId = null
          d.display.gridPreviewHoles = d.display.gridPreviewHoles?.filter(path => path.electrodeId !== e.id)
        }); ctx.refresh() })] : []),
        add,
      ]),
      hardwarePanel(ctx, e),
      connectorPanel(ctx,e),
      section('Manage', [
        button(
          'Remove electrode',
          () => {
            ctx.edit((d) => {
              d.electrodes = d.electrodes.filter((x) => x.id !== e.id)
            })
            ctx.selectElectrode(ctx.store.project?.electrodes[0]?.id ?? '')
          },
          'danger',
        ),
      ]),
    ])
  },
}
