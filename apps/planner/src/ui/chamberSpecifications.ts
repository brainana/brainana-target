import { designReferencePanel } from './designReferences.ts'
import { importChamberDefinition } from '../data/chamberImport.ts'
import { readProject } from '../data/ioTasks.ts'
import { chooseFile, errorDialog } from './controls.ts'
import { chamberPlacementControls } from '../features/chamber.ts'
import { chamberPreview } from './chamberPreview.ts'
import { gridCompatibility } from '@brainana/planning-core/hardware.ts'
import { gridHoles, holeLocal,seatedGridHeight,gridFitsChamber } from '@brainana/planning-core/geometry.ts'
import { validateProject } from '@brainana/planning-core/validation.ts'
import { h } from '@brainana/ui/dom.ts'
import { addAssembly } from '@brainana/planning-core/model.ts'
import type { FeatureContext } from '../features/contracts.ts'
import { button, note, selectField } from './controls.ts'
import { floatingWindow } from './floatingWindow.ts'

interface ChamberDraft { key: string; name: string; dimensions: string[]; mounting?:string; seating?:string; grid: boolean; gridValues: string[] }
const drafts = new WeakMap<object, ChamberDraft>()
const chamberChoices = new WeakMap<object, {projectId: string; chamberId: string}>()
/** Hardware definition is independent of implantation status and target placement. */
export function chamberSpecificationsPanel(ctx: FeatureContext): HTMLElement {
  if (!ctx.project) return note('Load a reference image before defining chamber hardware.')
  const project = ctx.project, choice = chamberChoices.get(ctx.store)
  const selected = project.electrodes.find(e => e.id === ctx.selectedElectrode)
  const chamberId = choice?.projectId === project.id ? choice.chamberId
    : project.grids.find(g => g.id === selected?.gridId)?.chamberId ?? project.chambers[0]?.id ?? ''
  const editor = chamberEditor(ctx, true, chamberId)!
  const controls: HTMLElement[] = []
  if (project.chambers.length) controls.push(selectField('Chamber to edit', chamberId, [
    ...project.chambers.map(chamber => ({ value: chamber.id, label: chamber.name })), { value: '', label: 'Add a chamber…' },
  ], id => { chamberChoices.set(ctx.store, { projectId: project.id, chamberId: id }); ctx.refresh() }))
  if(ctx.project.planningIntent==='electrode'){
    controls.push(note('Define the chamber already attached to the subject. Enter its dimensions below, then its measured location and angles. Measurements must use this image’s RAS millimetre coordinates. You can also load a previously saved chamber project from the start screen.'),button('Import saved chamber dimensions and location…',()=>chooseFile('.json,.brainana-plan,.zip',async file=>{const input=file.name.endsWith('.json')?JSON.parse(await file.text()):(await readProject(new Uint8Array(await file.arrayBuffer()))).project;const imported=importChamberDefinition(ctx.store.project!,input);ctx.edit(d=>{d.chambers=imported.chambers;d.grids=imported.grids});ctx.refresh()},errorDialog)))
    if(chamberId)editor.append(chamberPlacementControls(ctx, chamberId))
  }
  return h('div', {}, [...controls, editor])
}
export function openChamberSpecifications(ctx: FeatureContext): void { chamberEditor(ctx, false) }
function chamberEditor(ctx: FeatureContext, inline: boolean, chamberId?: string): HTMLElement | undefined {
  const project = ctx.store.project
  if (!project) return
  const device = project.electrodes.find(e => e.id === ctx.selectedElectrode)
  const id = chamberId ?? project.grids.find(g => g.id === device?.gridId)?.chamberId ?? project.chambers[0]?.id
  const original = project.chambers.find(c => c.id === id)
  const originalGrid = project.grids.find(g => g.chamberId === original?.id)
  const identity = JSON.stringify([original && [original.id, original.name, original.innerRadius, original.wallThickness, original.height,original.mounting], originalGrid])
  const inlineRoot = h('section', { class: 'control-section chamber-inline-editor' }, [h('h3', {}, ['Chamber specifications'])])
  const inlineContent = h('div'); inlineRoot.append(inlineContent)
  const tool = inline ? { root: inlineRoot, content: inlineContent, close: () => {} } : floatingWindow('Chamber specifications', 'Chamber specifications')
  if (!inline) tool.root.classList.add('chamber-popout')
  tool.root.dataset.projectId = project.id
  tool.root.dataset.chamberIdentity = identity
  tool.root.dataset.chamberId = original?.id ?? ''
  const draftKey = `${project.id}:${identity}`
  const saved = drafts.get(ctx.store)
  const draft = saved?.key === draftKey ? saved : undefined
  const name = h('input', { type: 'text', required: true, maxLength: 120, value: draft?.name ?? original?.name ?? `Chamber ${project.chambers.length + 1}`, ariaLabel: 'Chamber name' })
  const mounting=h('select',{ariaLabel:'Chamber mounting method'},[['custom','Custom chamber with fitted wall lengths'],['cut','Cut the lower rim of a fixed-height cylinder'],['pedestal','Keep cylinder; add a fitted pedestal'],['acrylic','Keep cylinder; fill below with acrylic / cement']].map(([value,label])=>h('option',{value,selected:value===(draft?.mounting??original?.mounting??'custom')},[label])))
  mounting.value=draft?.mounting??original?.mounting??'custom'
  const definitions = [ ['Bore / inner diameter (mm)', 1, 200, original ? original.innerRadius * 2 : undefined], ['Wall thickness (mm)', .1, 20, original?.wallThickness], ['Chamber height (mm)', .5, 100, original?.height] ] as const
  const inputs = definitions.map(([label, min, max, value]) => h('input', { type: 'number', required: true, min: String(min), max: String(max), step: 'any', value: draft?.dimensions[definitions.findIndex(item => item[0] === label)] ?? (value === undefined ? '' : String(value)), ariaLabel: label }))
  const devices = project.electrodes.filter(e => e.gridId === originalGrid?.id && e.hardware)
  const compatible = !devices.length || devices.some(e => gridCompatibility(e).available)
  const gridEnabled = h('input', { type: 'checkbox', checked: compatible && (draft?.grid ?? (originalGrid?.enabled !== false && !!originalGrid)), disabled: !compatible, ariaLabel: 'Define a guide grid' })
  const gridDefinitions = [['Hole spacing (mm)', .1, 20, originalGrid?.spacing ?? 1], ['Holes per side (odd)', 1, 31, originalGrid?.count ?? 15], ['Hole pattern rotation (°)', -360, 360, originalGrid?.rotation ?? 0], ['Grid tilt relative to chamber (°)',0,89,originalGrid?.tiltAngle??0],['Grid tilt direction around chamber (°)',-360,360,originalGrid?.tiltAzimuth??0],['Grid base position relative to chamber top (mm)',-100,100,originalGrid?.seatHeight??-(originalGrid?.minimumThickness??0)-2*(original?.innerRadius??0)*Math.tan((originalGrid?.tiltAngle??0)*Math.PI/180)],['Grid thin-edge thickness (mm)',0,50,originalGrid?.minimumThickness??0],['Guide-hole diameter (mm)',.05,10,originalGrid?.holeDiameter??.7]] as const
  const seating=h('select',{ariaLabel:'Grid seating'},[['flush','Automatic — top edge flush with chamber lip'],['manual','Custom vertical position — may protrude']].map(([value,label])=>h('option',{value},[label])));seating.value=draft?.seating??originalGrid?.seating??'flush'
  const gridInputs = gridDefinitions.map(([label, min, max, value]) => h('input', { type: 'number', min: String(min), max: String(max), step: label === 'Holes per side (odd)' ? '2' : 'any', value: draft?.gridValues[gridDefinitions.findIndex(item => item[0] === label)] ?? String(value), ariaLabel: label, disabled: !gridEnabled.checked }))
  const remember = () => drafts.set(ctx.store, { key: draftKey, name: name.value, mounting:mounting.value, seating:seating.value, dimensions: inputs.map(input => input.value), grid: gridEnabled.checked, gridValues: gridInputs.map(input => input.value) })
  name.addEventListener('input', remember)
  mounting.addEventListener('change',remember)
  const preview3D = chamberPreview()
  const preview = h('div', { class: 'chamber-spec-preview', ariaLabel: 'Chamber dimension preview' })
  const reflect = () => {
    if(seating.value==='flush'&&inputs[0].valueAsNumber>0)gridInputs[5].value=String(-gridInputs[6].valueAsNumber-inputs[0].valueAsNumber*Math.tan(gridInputs[3].valueAsNumber*Math.PI/180))
    remember()
    if (!inputs.every(input => input.value !== '' && input.checkValidity())) { preview.replaceChildren(note('Enter all three dimensions to show a chamber preview.')); return }
    const [bore, wall, height] = inputs.map(input => input.valueAsNumber), outer = bore + 2 * wall
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 440 250'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Top and side views of chamber dimensions; no anatomical placement')
    const scale = Math.min(120 / outer, 130 / height), radius = outer * scale / 2, inner = bore * scale / 2
    const shape = (tag: string, attrs: Record<string, string | number>) => { const el = document.createElementNS(svg.namespaceURI, tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value)); svg.append(el); return el }
    shape('circle', { cx: 100, cy: 100, r: radius, fill: '#e6a13a', opacity: .7 });shape('circle', { cx: 100, cy: 100, r: inner, fill: '#24221d' })
    for (const x of [270 - radius, 270 + inner]) shape('rect', { x, y: 35, width: radius - inner, height: height * scale, fill: '#e6a13a', opacity: .7 })
    shape('text', { x: 25, y: 205, fill: 'currentColor', 'font-size': 14 }).textContent = `Top · bore ${bore} mm · outer ${outer.toFixed(2)} mm`
    shape('text', { x: 230, y: 228, fill: 'currentColor', 'font-size': 14 }).textContent = `Side · height ${height} mm`
    const grid = { id: originalGrid?.id ?? 'preview-grid', name: originalGrid?.name ?? 'Guide grid', chamberId: original?.id ?? 'preview-chamber', seating:seating.value as 'flush'|'manual', enabled: gridEnabled.checked, spacing: gridInputs[0].valueAsNumber, count: gridInputs[1].valueAsNumber, rotation: gridInputs[2].valueAsNumber,tiltAngle:gridInputs[3].valueAsNumber,tiltAzimuth:gridInputs[4].valueAsNumber,seatHeight:gridInputs[5].valueAsNumber,minimumThickness:gridInputs[6].valueAsNumber,holeDiameter:gridInputs[7].valueAsNumber }
    const chamber = { id: original?.id ?? 'preview-chamber', name: name.value, frameId: project.frame.id, pose: { origin: [0, 0, 0] as [number, number, number], angles: [0, 0, 0] as [number, number, number] }, innerRadius: bore / 2, wallThickness: wall, height }
    if (grid.enabled && gridInputs.every(input => input.checkValidity()) && grid.count % 2 === 1) for (const hole of gridHoles(chamber, grid).slice(0, 1000)) { const p = holeLocal(grid, hole,chamber); shape('circle', { cx: 100 + p[0] * scale, cy: 100 - p[1] * scale, r: 1.5, fill: '#67d9d1' }) }
    preview.replaceChildren(svg,...(grid.enabled&&!gridFitsChamber(chamber,grid)?[note('The grid protrudes above the chamber or below its lower edge. Use Fit grid inside chamber; reduce its angle or thickness if it is too tall.')]:[]))
    if (!grid.enabled || gridInputs.every(input => input.checkValidity()) && grid.count % 2 === 1) preview3D.update(chamber, grid)
  }
  const message = h('p', { role: 'alert' })
  const form = h('form', {}, [h('label', { class: 'field' }, [h('span', {}, ['Chamber name']), name]), ...inputs.map((input, i) => h('label', { class: 'field' }, [h('span', {}, [definitions[i][0]]), input])), h('label',{class:'field'},['Mounting method',mounting]),note('Custom wall lengths can extend or shorten around the skull. Cutting preserves the stock height as an upper limit. Pedestal and acrylic options preserve a flat-bottomed cylinder and estimate the support height beneath it; the minimum added height is 0.5 mm. Final fit dimensions are reported in Position and exported after placement.'),note("Bore diameter is the width of the clear opening inside the chamber. Wall thickness is the thickness on each side. Height runs from the chamber top to its bottom edge. This preview sets the hardware dimensions; you will choose its position later."), h('section', { class: 'guide-grid-fields' }, [h('h4', {}, ['Guide grid dimensions']), h('label', {}, [gridEnabled, 'Define a guide grid']),h('label',{class:'field'},['Grid seating',seating]), ...gridInputs.map((input, i) => h('label', { class: 'field' }, [h('span', {}, [gridDefinitions[i][0]]), input])), button('Fit grid inside chamber',()=>{seating.value='flush';if(inputs[0].valueAsNumber>0){gridInputs[5].value=String(seatedGridHeight({innerRadius:inputs[0].valueAsNumber/2} as import('@brainana/planning-core/model.ts').Chamber,{tiltAngle:gridInputs[3].valueAsNumber,minimumThickness:gridInputs[6].valueAsNumber} as import('@brainana/planning-core/model.ts').Grid));reflect()}}),note("Grid tilt sets the angle of all guide holes relative to the chamber. Tilt direction chooses which way they lean. Hole-pattern rotation turns the arrangement of holes on the sloping face without changing their direction. Spacing is measured along that face. Base height sets where the flat bottom of the grid sits relative to the chamber top. Thin-edge thickness and tilt determine the thick-edge height."), note(compatible ? "Enable this if your electrode passes through a removable grid with evenly spaced guide holes. Leave it off for arrays that use their own mounting system. With no grid, placement uses the centre of the chamber as its reference point." : 'This array is not compatible with a regular guide grid. Its mounting interface must be defined separately.')]), message, h('button', { type: 'submit', class: 'primary' }, ['Save chamber specifications']), preview, preview3D.element])
  gridInputs[3].addEventListener('input',()=>{if(gridInputs[3].valueAsNumber>0&&gridInputs[6].valueAsNumber<=0)gridInputs[6].value='2'})
  seating.addEventListener('change',reflect)
  gridInputs[5].addEventListener('input',()=>{seating.value='manual'})
  for (const input of [...inputs, ...gridInputs]) input.addEventListener('input', reflect)
  gridEnabled.addEventListener('change', () => { for (const input of gridInputs) input.disabled = !gridEnabled.checked; reflect() })
  form.addEventListener('submit', event => {
    event.preventDefault(); if (!form.reportValidity() || !name.value.trim()) return
    const current = ctx.store.project
    const c = current?.chambers.find(item => item.id === original?.id)
    if (current?.id !== project.id || JSON.stringify([c && [c.id, c.name, c.innerRadius, c.wallThickness, c.height,c.mounting], current?.grids.find(g => g.chamberId === c?.id)]) !== identity) { message.textContent = 'The chamber or project changed. Close and reopen specifications before saving.'; return }
    const next = structuredClone(current)
    const created = !original
    if (created) {
      addAssembly(next, [0, 0, 0])
      next.chambers.at(-1)!.placementState = 'unplaced'
    }
    const defined = created ? next.chambers.at(-1)! : next.chambers.find(item => item.id === original!.id)!
    const grid = next.grids.find(item => item.chamberId === defined.id)
    if (!grid) { message.textContent = 'This chamber has no grid definition.'; return }
    defined.mounting=mounting.value as typeof defined.mounting;
    if(original?.mounting!==defined.mounting)delete defined.baseFit
    defined.name = name.value.trim(); defined.innerRadius = inputs[0].valueAsNumber / 2; defined.wallThickness = inputs[1].valueAsNumber; defined.height = inputs[2].valueAsNumber
    if (!original || original.innerRadius !== defined.innerRadius || original.wallThickness !== defined.wallThickness || original.height !== defined.height) delete defined.baseFit
    Object.assign(grid, { seating:seating.value as 'flush'|'manual', enabled: gridEnabled.checked, spacing: gridEnabled.checked ? gridInputs[0].valueAsNumber : originalGrid?.spacing ?? 1, count: gridEnabled.checked ? gridInputs[1].valueAsNumber : originalGrid?.count ?? 15, rotation: gridEnabled.checked ? gridInputs[2].valueAsNumber : originalGrid?.rotation ?? 0,tiltAngle:gridInputs[3].valueAsNumber,tiltAzimuth:gridInputs[4].valueAsNumber,seatHeight:gridInputs[5].valueAsNumber,minimumThickness:gridInputs[6].valueAsNumber,holeDiameter:gridInputs[7].valueAsNumber })
    for (const electrode of next.electrodes.filter(e => e.gridId === grid.id)) {
      if (!gridHoles(defined, grid).some(hole => hole[0] === electrode.hole[0] && hole[1] === electrode.hole[1])) electrode.hole = [0, 0]
    }
    try { validateProject(next) } catch (error) { message.textContent = error instanceof Error ? error.message : String(error); return }
    if (ctx.edit(p => { p.chambers = next.chambers; p.grids = next.grids; p.electrodes = next.electrodes }) === false) return
    chamberChoices.set(ctx.store, { projectId: project.id, chamberId: defined.id })
    if (created) ctx.selectElectrode?.(next.electrodes.at(-1)!.id)
    tool.close(); ctx.refresh()
  })
  tool.content.append(...(inline ? [button('Pop out chamber editor…', () => chamberEditor(ctx, false, id ?? ''))] : []), form, designReferencePanel('chambers'), ...(!inline ? [button('Cancel', () => tool.close())] : []));reflect()
  return tool.root
}
