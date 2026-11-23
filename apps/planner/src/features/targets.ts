import { electrodeAssembly } from '@brainana/planning-core/electrode-frame.ts'
import { h } from '@brainana/ui/dom.ts'
import { newId, type Vec3 } from '@brainana/planning-core/model.ts'
import type { PlannerFeature } from './contracts.ts'
import { button, note, section, numberField, textField,selectField,errorDialog } from '../ui/controls.ts'
export const targetsFeature: PlannerFeature = {
  id: 'targets',
  label: 'Targets',
  glyph: '03',
  description: 'Define targets and plan access',
  render: (ctx) => {
    const p = ctx.project
    if (!p) return note('Load anatomy to define targets.')
    return h('div', {}, [
      section('Atlas for targeting', [
        note(
          'Use Overlays above Anatomy to open the atlas explorer, or load another aligned atlas in Images. The atlas must already be registered to this anatomical image in physical RAS coordinates. This import does not perform registration.',
        ),
        button('Open atlas explorer', ctx.actions.openAtlas, 'primary'),
        button('Load aligned atlas…', ctx.actions.loadAtlas),
        note(
          'Inspect the overlay in all three planes. Move the crosshair to see the atlas region in the status bar; new targets capture that region label.',
        ),
      ]),
      section('Define a target', [
        note(
          "Click the desired location in a slice, then add a target. Its position is saved relative to the reference image, in millimetres.",
        ),
        button(
          'Add target at crosshair',
          () => {
            const point = ctx.crosshair(),
              atlas = ctx.scene.atlasReadout(point)
            ctx.edit((d) => {
              d.targets.push({
                id: newId(),
                name: `Target ${d.targets.length + 1}`,
                point: [...point],
                frameId: d.frame.id,
                color: '#ff6c32',
                displayRadiusMm: 2,
                atlas,
              })
            })
          },
          'primary',
        ),
        button('Import viewer bookmarks…', ctx.actions.importBookmarks),
      ]),
      ...(p.landmarks?.length ? [section('Landmarks', p.landmarks.map(mark => h('div', { class: 'button-row' }, [
        button(mark.name, () => ctx.scene.moveCrosshair(mark.point)),
        button('Remove', () => ctx.edit(d => { d.landmarks = d.landmarks?.filter(item => item.id !== mark.id) })),
      ])))] : []),
      ...p.targets.map((t) =>
        section(t.name, [
          ...(p.chambers.length ? [h('fieldset', {}, [
            h('legend', {}, ['Assigned chambers']),
            ...p.chambers.map(chamber => {
              const checked = chamber.targetIds?.includes(t.id) || p.electrodes.some(e => e.targetId === t.id && electrodeAssembly(p, e)?.chamber.id === chamber.id)
              const control = h('input', { type: 'checkbox', checked: !!checked, ariaLabel: `${chamber.name} for ${t.name}` })
              control.addEventListener('change', () => {
                ctx.edit(d => {
                  const saved = d.chambers.find(item => item.id === chamber.id)!
                  const devices = d.electrodes.filter(e => electrodeAssembly(d, e)?.chamber.id === chamber.id)
                  const ids = new Set([...(saved.targetIds ?? []), ...devices.flatMap(e => e.targetId ? [e.targetId] : [])])
                  if (control.checked) ids.add(t.id)
                  else { ids.delete(t.id); for (const e of devices) if (e.targetId === t.id) e.targetId = null }
                  saved.targetIds = [...ids]
                })
                ctx.refresh()
              })
              return h('label', {}, [control, chamber.name])
            }),
          ])] : []),
          ...(p.electrodes.length ? [h('fieldset', {}, [
            h('legend', {}, ['Electrodes targeting this point']),
            ...p.electrodes.map(e => {
              const control = h('input', { type: 'checkbox', checked: e.targetId === t.id, ariaLabel: `${e.name} for ${t.name}` })
              control.addEventListener('change', () => {
                ctx.edit(d => {
                  const electrode = d.electrodes.find(item => item.id === e.id)!
                  electrode.targetId = control.checked ? t.id : null
                  const chamber = electrodeAssembly(d, electrode)?.chamber
                  if (control.checked && chamber && !electrode.direct)
                    chamber.targetIds = [...new Set([...(chamber.targetIds ?? []), ...d.electrodes.filter(device => electrodeAssembly(d, device)?.chamber.id === chamber.id).flatMap(device => device.targetId ? [device.targetId] : [])])]
                })
                ctx.refresh()
              })
              const other = p.targets.find(point => point.id === e.targetId && point.id !== t.id)
              return h('label', {}, [control, `${e.name}${other ? ' · currently ' + other.name : ''}`])
            }),
          ])] : []),
          textField('Name', t.name, (v) =>
            ctx.edit((d) => {
              d.targets.find((x) => x.id === t.id)!.name = v
            }),
          ),
          h(
            'div',
            { class: 'triple' },
            (['R', 'A', 'S'] as const).map((label, i) =>
              numberField(`${label} (mm)`, t.point[i], (v) =>
                ctx.edit((d) => {
                  d.targets.find((x) => x.id === t.id)!.point[i] = v
                }),
              ),
            ),
          ),
          selectField('Valid target geometry',t.region?.kind??'point',[{value:'point',label:'Single point'},{value:'sphere',label:'Spherical valid region'},{value:'voxels',label:'Manually selected reference voxels'}],kind=>{try{ctx.scene.setTargetPaintHandler?.(null);ctx.edit(d=>{const target=d.targets.find(x=>x.id===t.id)!;if(kind==='point')delete target.region;else if(kind==='sphere')target.region={kind:'sphere',radiusMm:1};else{const voxel=ctx.scene.voxelAt?.(t.point);if(!voxel)throw new Error('Locate the target inside the reference image first.');target.region={kind:'voxels',centers:[voxel.center],axes:voxel.axes}}})}catch(e){errorDialog(e)}}),
          ...(t.region?.kind==='sphere'?[numberField('Valid target radius (mm)',t.region.radiusMm,v=>ctx.edit(d=>{d.targets.find(x=>x.id===t.id)!.region={kind:'sphere',radiusMm:v}}),{min:.01,max:100,step:.1}),note('Any tip inside this sphere is valid. The point-target miss tolerance does not expand this region.')]:[]),
          ...(t.region?.kind==='voxels'?[note(`${t.region.centers.length} valid reference-image voxel(s), up to 10,000. Voxel dimensions follow the reference image, including oblique orientation. Add / erase on multiple slices to form a 3D region. The point-target miss tolerance does not expand it.`),
            ...(['add','erase'] as const).map(mode=>button(ctx.scene.targetPaintId===`${t.id}:${mode}`?`Stop ${mode==='add'?'painting':'erasing'} target voxels`:`${mode==='add'?'Paint':'Erase'} target voxels in slices`,()=>{
              if(ctx.scene.targetPaintId===`${t.id}:${mode}`){ctx.scene.setTargetPaintHandler?.(null);ctx.refresh();return}
              const paintGroup=`target-voxels:${t.id}:${newId()}`
              ctx.scene.setTargetPaintHandler?.(points=>{
                const current=ctx.store.project?.targets.find(x=>x.id===t.id);if(current?.region?.kind!=='voxels')return
                const cells=points.map(p=>ctx.scene.voxelAt?.(p)).filter(v=>!!v),key=(v:Vec3)=>v.map(n=>n.toFixed(5)).join(',')
                const centers=new Map(current.region.centers.map(v=>[key(v),v]));let changed=false;for(const cell of cells){if(mode==='add'){if(!centers.has(key(cell!.center))){centers.set(key(cell!.center),cell!.center);changed=true}}else changed=centers.delete(key(cell!.center))||changed}
                if(!centers.size||centers.size>10000||!changed)return
                ctx.edit(d=>{const target=d.targets.find(x=>x.id===t.id)!;if(target.region?.kind==='voxels')target.region={...target.region,centers:[...centers.values()]}},paintGroup)
              },`${t.id}:${mode}`);ctx.refresh()
            })),
            button('Add reference voxel at crosshair',()=>{const voxel=ctx.scene.voxelAt?.(ctx.crosshair());if(!voxel)return;ctx.edit(d=>{const target=d.targets.find(x=>x.id===t.id)!,r=target.region;if(r?.kind==='voxels'&&!r.centers.some(c=>c.every((v,k)=>Math.abs(v-voxel.center[k])<1e-5)))target.region={...r,centers:[...r.centers,voxel.center]}})}),
            button('Clear voxel region (return to point)',()=>{ctx.scene.setTargetPaintHandler?.(null);ctx.edit(d=>{delete d.targets.find(x=>x.id===t.id)!.region})}),note('Painting uses one reference voxel at a time; zoom in for precise selection. At least one voxel is retained. Stop painting before navigating by click.')]:[]),
          h('label', { class: 'field target-color' }, [
            h('span', {}, ['Target color']),
            h('input', { type: 'color', value: t.color, ariaLabel: `Color for ${t.name}`, onchange: (event: Event) => {
              const color = (event.currentTarget as HTMLInputElement).value
              ctx.edit(d => { d.targets.find(target => target.id === t.id)!.color = color })
            } }),
          ]),
          numberField('Target display falloff radius (mm)', t.displayRadiusMm ?? 2, v => ctx.edit(d => { d.targets.find(x => x.id === t.id)!.displayRadiusMm = Math.max(0, Math.min(20, v)) }), { min: 0, max: 20, step: 0.25 }),
          note("A fading colored halo makes the target easier to see. This radius changes only the display, not the target point or allowed targeting error. Set it to 0 to show just the point."),
          ...(t.atlas ? [note(`${t.atlas.name}: ${t.atlas.label}`)] : []),
          h('div', { class: 'button-row' }, [
            button('Locate', () => ctx.scene.moveCrosshair(t.point as Vec3)),
            button(
              'Remove',
              () =>
                ctx.edit((d) => {
                  d.targets = d.targets.filter((x) => x.id !== t.id)
                  for (const chamber of d.chambers) if (chamber.targetIds) chamber.targetIds = chamber.targetIds.filter(id => id !== t.id)
                  for (const e of d.electrodes) if (e.targetId === t.id) e.targetId = null
                }),
              'danger',
            ),
          ]),
        ]),
      ),
      ...(p.targets.length ? [] : [note('No targets yet. Add several to compare chamber access.')]),
    ])
  },
}
