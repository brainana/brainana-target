import { h } from '@brainana/ui/dom.ts'
import type { Project } from '@brainana/planning-core/model.ts'
import { gridCompatibility } from '@brainana/planning-core/hardware.ts'
import type { SceneDisplay, SceneLayer } from '../render/display.ts'
import { note, button } from './controls.ts'
import { hoverHelp } from './hoverHelp.ts'

type OpacityKey = 'anatomyOpacity' | 'skullOpacity' | 'chamberOpacity' | 'implantOpacity' | 'stereotaxOpacity'

/** Presentation settings are independent of geometry, search constraints and undo history. */
export function sceneControls(
  display: SceneDisplay,
  change: (
    patch: Partial<Omit<SceneDisplay, 'layers'>> & { layers?: Partial<SceneDisplay['layers']> },
  ) => void,
): { element: HTMLElement; details: HTMLElement; update: (project: Project | null, availableAnatomy?: { brain: boolean; skull: boolean; stereotax?: boolean; reference?: boolean }) => void } {
  const remembered = new Map<OpacityKey, number>()
  const visibilityButtons = new Map<OpacityKey, HTMLButtonElement>()
  const opacityInputs=new Map<OpacityKey, HTMLInputElement>()
  const opacityOutputs=new Map<OpacityKey, HTMLOutputElement>()
  const slider = (label: string, key: OpacityKey, help: string): HTMLElement => {
    const applyOpacity = (value: number) => change(key === 'chamberOpacity'
      ? { chamberOpacity: value, layers: { chambers: true } }
      : { [key]: value })
    remembered.set(key, display[key] || .5)
    const toggle = button(label, () => {
      const current = display[key]
      if (current > 0) remembered.set(key, current)
      const value = current > 0 ? 0 : remembered.get(key) ?? .5
      input.value = String(value); output.textContent = `${Math.round(value * 100)}%`
      toggle.setAttribute('aria-pressed', String(value > 0)); applyOpacity(value)
    })
    toggle.setAttribute('aria-label', `Toggle ${label.toLowerCase()} visibility in 3D`)
    toggle.setAttribute('aria-pressed', String(display[key] > 0))
    visibilityButtons.set(key, toggle)
    const output = h('output', {}, [`${Math.round(display[key] * 100)}%`])
    opacityOutputs.set(key,output)
    const input = h('input', {
      type: 'range',
      min: '0',
      max: '1',
      step: '0.01',
      value: String(display[key]),
      ariaLabel: `${label} opacity in 3D`,
    })
    opacityInputs.set(key,input)
    input.addEventListener('input', () => {
      output.textContent = `${Math.round(input.valueAsNumber * 100)}%`
      toggle.setAttribute('aria-pressed', String(input.valueAsNumber > 0))
      if (input.valueAsNumber > 0) remembered.set(key, input.valueAsNumber)
      applyOpacity(input.valueAsNumber)
    })
    const field = h('div', { class: 'scene-opacity' }, [toggle, input, output])
    hoverHelp(field, () => input.disabled ? field.title : help)
    return field
  }
  const popup = h('div', { class: 'scene-layers', hidden: true, role: 'group', ariaLabel: '3D visibility' })
  const labels: Array<[SceneLayer, string]> = [
    ['headposts', 'Headposts'],
    ['guideTubes', 'Guide tubes'],
    ['grids', 'Guide grid'],
    ['electrodes', 'Electrodes'],
    ['contacts', 'Sites'],
    ['axes', 'Chamber axes'],
    ['targets', 'Targets'],
    ['avoidance', 'Avoid regions'],
  ]
  const layerInputs = new Map<SceneLayer, HTMLInputElement>()
  for (const [layer, label] of labels) {
    const input = h('input', { type: 'checkbox', ariaLabel: `Show ${label.toLowerCase()} in 3D` })
    input.checked = display.layers[layer]
    input.addEventListener('change', () => change({ layers: { [layer]: input.checked } }))
    const field = h('label', {}, [input, label])
    field.tabIndex = 0
    hoverHelp(field, () => (input.disabled ? field.title : ''))
    popup.append(field)
    layerInputs.set(layer, input)
  }
  const enhance = h('input', { type: 'checkbox', ariaLabel: 'Enhance thin electrodes in 3D' })
  enhance.checked = display.enhanceElectrodes
  enhance.addEventListener('change', () => change({ enhanceElectrodes: enhance.checked }))
  const enhancementField = h('label', {}, [enhance, 'Enhance thin electrodes'])
  hoverHelp(
    enhancementField,
    "Make thin electrodes and small contacts easier to see in the whole-head view. This changes only their displayed thickness, not their measurements or placement checks. Turn it off to view actual widths.",
  )
  const xray = h('input', { type: 'checkbox', checked: display.showOccludedGeometry })
  xray.addEventListener('change', () => change({ showOccludedGeometry: xray.checked }))
  const xrayField = h('label', {}, [xray, 'Show hidden geometry (X-ray)'])
  hoverHelp(xrayField, 'Draw hidden geometry through other objects, including opaque surfaces.')
  popup.append(
    note('Hover over 3D and use the arrow keys to pan. Press R to fit the anatomy.'),
    enhancementField, xrayField,
    note(
      "The guide grid follows your entered dimensions. Hole markers show where the channels run. Connectors, cables and holders are shown only if their dimensions are explicitly modeled. Display settings do not change placement calculations.",
    ),
  )
  const root = h('div', { class: 'scene-controls' }, [
    slider(
      'Brain',
      'anatomyOpacity',
      'Anatomical surfaces are solid at 100%. With only an MRI, this controls the strength of the volume rendering, where visibility varies with image intensity.',
    ),
    slider('Skull','skullOpacity','Skull meshes are solid at 100%. With only a CT volume, visibility also depends on image intensity.'),
    slider('Chamber', 'chamberOpacity', 'Opacity of the chamber body and any fitted mount.'),
    slider('Stereotax', 'stereotaxOpacity', 'Opacity of the stereotaxic frame, ear bars and manipulator arms.'),
    slider(
      'Hardware',
      'implantOpacity',
      'Opacity of headposts, guide grids, electrodes and recording sites.',
    ),

  ])
  const parts = h('div', { class: 'scene-component-toggles', ariaLabel: 'Quick implant and marker visibility' })
  const partButtons = new Map<SceneLayer, HTMLButtonElement>()
  for (const [layer, label] of labels.filter(([key]) => key !== 'axes' && key !== 'chambers')) {
    const control = button(label, () => { const enabled = !display.layers[layer]; change({ layers: { [layer]: enabled } }); control.setAttribute('aria-pressed', String(enabled)); layerInputs.get(layer)!.checked = enabled })
    control.setAttribute('aria-pressed', String(display.layers[layer])); partButtons.set(layer, control); parts.append(control)
  }
  const intersections = button('Overlaps', () => change({ showIntersections: !display.showIntersections }))
  intersections.title = 'Show overlaps in red in 3D and the slices. Red regions are visible through the anatomy in 3D. Each object needs a mesh.'
  parts.append(intersections)
  root.append(parts)
  popup.hidden=false
  const update = (p: Project | null, availableAnatomy?: { brain: boolean; skull: boolean; stereotax?: boolean; reference?: boolean }): void => {
    intersections.setAttribute('aria-pressed', String(display.showIntersections))
    intersections.disabled = !p && !availableAnatomy?.reference
    const placed = p?.chambers.filter(c => c.placementState !== 'unplaced') ?? []
    const grids = p?.grids.filter(g => placed.some(c => c.id === g.chamberId)) ?? []
    const devices = p?.electrodes.filter(e => grids.some(g => g.id === e.gridId)||e.direct&&!e.direct.unplaced||e.connector&&!e.connector.unplaced) ?? []
    const haveBrain = availableAnatomy?.brain ?? !!p?.assets.some(a => a.role === 'surface' && a.surfaceKind !== 'skull' || a.modality === 'mri' || a.role === 'anatomy' && a.modality !== 'ct')
    const haveSkull = availableAnatomy?.skull ?? !!p?.assets.some(a => a.surfaceKind === 'skull' || a.role === 'ct' || a.modality === 'ct')
    for (const [key,input] of opacityInputs) {
      input.value = String(display[key])
      opacityOutputs.get(key)!.textContent = `${Math.round(display[key] * 100)}%`
    }
    for(const [key,input] of opacityInputs){input.disabled=key==='anatomyOpacity'?!haveBrain:key==='skullOpacity'?!haveSkull:key==='chamberOpacity'?!placed.length:key==='stereotaxOpacity'?!(availableAnatomy?.stereotax ?? p?.stereotax):(!grids.length&&!devices.length&&!p?.headposts?.length);input.parentElement!.title=input.disabled?(key==='stereotaxOpacity'?'Add a frame using Stereotaxic setup.':key==='skullOpacity'?'No skull rendering is available. Load a CT or skull mesh in Images.':key==='anatomyOpacity'?'Load MRI or a brain surface to adjust brain opacity.':'No implants are defined.') : ''}
    opacityInputs.get('stereotaxOpacity')!.parentElement!.hidden = !(availableAnatomy?.stereotax ?? p?.stereotax)
    for (const [key, control] of visibilityButtons) { control.disabled = opacityInputs.get(key)!.disabled; control.setAttribute('aria-pressed', String(display[key] > 0)) }
    const available: Record<SceneLayer, boolean> = {
      stereotax: availableAnatomy?.stereotax ?? !!p?.stereotax,
      headposts:!!p?.headposts?.length,
      chambers: !!placed.length,
      guideTubes: !!devices.some((e) => !!e.guideTube),
      grids: !!grids.some((g) =>
        g.enabled !== false && devices.some((e) => e.gridId === g.id && gridCompatibility(e).available),
      ),
      electrodes: !!devices.length,
      contacts: !!devices.some((e) => e.contactCount > 0),
      axes: !!placed.length,
      targets: !!(p?.targets.length || p?.landmarks?.length),
      avoidance: !!p?.avoidRegions?.length,
    }
    for (const [layer, input] of layerInputs) {
      input.disabled = !available[layer]
      input.checked = display.layers[layer]
      const quick = partButtons.get(layer)
      if (quick) { quick.disabled = !available[layer]; quick.hidden = !available[layer]; quick.setAttribute('aria-pressed', String(display.layers[layer])) }
      input.parentElement!.title = available[layer]
        ? ''
        : layer === 'grids'
          ? 'No compatible single-shaft guide grid is defined. Arrays require their own mount; a regular guide-hole pattern is not shown for them.'
          : `No ${labels.find(([key]) => key === layer)![1].toLowerCase()} are defined in this project.`
    }
  }
  update(null)
  return { element: root, details: popup, update }
}
