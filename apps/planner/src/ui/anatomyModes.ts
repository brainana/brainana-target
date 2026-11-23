import {cardinalLayouts} from '../render/camera.ts'
import {electrodeAssembly} from '@brainana/planning-core/electrode-frame.ts'
import { h } from '@brainana/ui/dom.ts'
import type { Project } from '@brainana/planning-core/model.ts'
import type { TrajectoryReslices } from '../render/reslices.ts'
import { button } from './controls.ts'
/** One anatomy viewport, with optional electrode-aligned reslicing instead of permanent extra panes. */
export function anatomyModes(slices: HTMLCanvasElement, along: HTMLCanvasElement, across: HTMLCanvasElement, reslices: TrajectoryReslices, repaint: () => void, setLayout?:(mode:string)=>void) {
  let mode = 'column', electrodeKey = '', electrodeName = ''
  const cardinal=()=>!['along','across'].includes(mode)
  let appliedLayout=''
  const selector = h('select', { ariaLabel: 'Anatomy view mode' }, [...cardinalLayouts.map(({value,label})=>h('option',{value},[label])), h('option', { value: 'along' }, ['Along trajectory']), h('option', { value: 'across' }, ['Across trajectory'])])
  const host = h('div', { class: 'anatomy-view-host' }, [slices, along, across])
  const explanation = h('span', { class: 'trajectory-mode-help' })
  const rotate = h('input', { type: 'range', min: '0', max: '180', step: '1', value: '0', ariaLabel: 'Rotate plane around electrode (degrees)' })
  const position = h('input', { type: 'range', min: '0', max: '10', step: '0.1', value: '0', ariaLabel: 'Cross-section distance from grid (mm)' })
  const rotateText = h('span', {}, ['0°']), positionText = h('span')
  const rotationControl = h('label', {}, ['Rotate plane ', rotate, rotateText]), positionControl = h('label', {}, ['From grid ', position, positionText])
  const atTip = button('At tip', () => { reslices.tipOffset = 0; position.value = String(depth); positionText.textContent = `${depth.toFixed(1)} mm`; repaint() })
  let depth = 0
  const controls = h('div', { class: 'trajectory-mode-controls' }, [rotationControl, positionControl, atTip, explanation])
  const sizeCanvases = () => {
    if (typeof host.getBoundingClientRect !== 'function') return false
    const r = host.getBoundingClientRect(), size = Math.floor(Math.min(r.width, r.height))
    if (size <= 0 || along.style.width === `${size}px`) return false
    for (const canvas of [along, across]) { canvas.style.width = `${size}px`; canvas.style.height = `${size}px` }
    return true
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (sizeCanvases() && !cardinal()) repaint() }).observe(host)
  const apply = () => {
    sizeCanvases()
    if(cardinal()&&mode!==appliedLayout){setLayout?.(mode);appliedLayout=mode}
    host.classList.toggle('trajectory-mode', !cardinal())
    slices.hidden = !cardinal(); along.hidden = mode !== 'along'; across.hidden = mode !== 'across'
    controls.hidden = cardinal(); rotationControl.hidden = mode !== 'along'; positionControl.hidden = atTip.hidden = mode !== 'across'
    reslices.visible = cardinal() ? 'none' : mode as 'along' | 'across'
    explanation.textContent = `${electrodeName} · ` + (mode === 'along' ? "A lengthwise slice through the electrode. Rotate the slice to inspect tissue around the path. It shows the selected MRI or CT in grayscale; use Cardinal slices to see image blends and atlases." : "A cross-section across the electrode. Slide it along the shaft to inspect different depths. It shows the selected MRI or CT in grayscale; use Cardinal slices to see image blends and atlases.")
    selector.value = mode
  }
  selector.addEventListener('change', () => { mode = selector.value; apply(); repaint() })
  rotate.addEventListener('input', () => { reslices.angleDegrees = rotate.valueAsNumber; rotateText.textContent = `${rotate.value}°`; repaint() })
  position.addEventListener('input', () => { reslices.tipOffset = position.valueAsNumber - depth; positionText.textContent = `${position.valueAsNumber.toFixed(1)} mm`; repaint() })
  apply()
  return { selector, host, controls,
    pan:(right:number,up:number,cardinalPan:(right:number,up:number)=>void)=>{if(cardinal())cardinalPan(right,up);else{reslices.pan(mode==='along'?0:1,right,up);repaint()}},
    update: (project: Project | null, id: string | null) => {
      const e = project?.electrodes.find(e => e.id === id), assembly=project&&e?electrodeAssembly(project,e):null,chamber=assembly?.chamber
      const ready = !!e && !!chamber && chamber.placementState !== 'unplaced'
      for (const option of Array.from(selector.options)) if (['along','across'].includes(option.value)) option.disabled = !ready
      if (electrodeKey !== (e?.id ?? '')) { electrodeKey = e?.id ?? ''; reslices.tipOffset = 0; reslices.angleDegrees = 0; rotate.value = '0'; rotateText.textContent = '0°' }
      electrodeName = e?.name ?? ''; depth = e?.depth ?? 0; position.max = String(depth + 10); reslices.tipOffset = Math.max(-depth, Math.min(10, reslices.tipOffset)); position.value = String(depth + reslices.tipOffset); positionText.textContent = `${(depth + reslices.tipOffset).toFixed(1)} mm`
      if (!ready&&!cardinal()) mode = 'column'
      selector.title = ready ? 'Optional views aligned to the selected electrode' : 'Place an electrode before using trajectory reslices'
      apply()
    },
    reset: () => { mode = 'column'; reslices.angleDegrees = 0; reslices.tipOffset = 0; apply() },
    zoom: (factor: number | null, cardinalZoom: (factor: number | null) => void) => { if (cardinal()) cardinalZoom(factor); else { reslices.zoom(mode === 'along' ? 0 : 1, factor); repaint() } },
  }
}
