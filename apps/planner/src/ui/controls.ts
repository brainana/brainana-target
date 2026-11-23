import {bytesView} from '../data/buffers.ts'
import {controlExplanation} from './controlHelp.ts'
import { hoverHelp } from './hoverHelp.ts'
import { h } from '@brainana/ui/dom.ts'
export const note = (text: string): HTMLParagraphElement => h('p', { class: 'note' }, [text])
export function button(label: string, action: () => void, className = ''): HTMLButtonElement {
  const b = h('button', { type: 'button', class: className }, [label])
  hoverHelp(b,()=>controlExplanation(b))
  b.addEventListener('click', action)
  return b
}
export function numberField(
  label: string,
  value: number,
  onChange: (value: number) => void,
  options: { min?: number; max?: number; step?: number } = {},
): HTMLLabelElement {
  const input = h('input', {
    type: 'number',
    value: String(Number(value.toFixed(4))),
    title: `Stored value: ${value}`,
    step: String(options.step ?? 'any'),
    min: String(options.min ?? -10000),
    max: String(options.max ?? 10000),
  })
  input.addEventListener('change', () => {
    const n = input.valueAsNumber
    if (Number.isFinite(n) && input.checkValidity()) onChange(n)
    else input.reportValidity()
  })
  const field = h('label', { class: 'field' }, [h('span', {}, [label]), input])
  const explanations: Record<string, string> = {
    'Bore / inner diameter (mm)':
      'Clear inner diameter of the chamber. Outer diameter equals bore diameter plus twice the wall thickness.',
    'Wall thickness (mm)': 'Radial wall thickness, added on both sides of the bore to calculate the outer diameter.',
    'Chamber height (mm)':
      'Distance from the chamber top / insertion plane to its base. This height consumes electrode reach before the shaft reaches anatomy.',
    'Usable shaft length (mm)':
      'Electrode shaft available from the grid / insertion plane to the tip. Exclude cable, connector and any shaft held above that plane. Custom shafts can exceed 150 mm.',
    'Usable electrode length (mm)':
      'Shaft available below the insertion plane. Cable length does not increase reach. Changing the common length resets individual needle lengths.',
    'Shaft reserved above grid (mm)':
      'Physical shaft held above the insertion plane. Increasing this reserve reduces usable reach without changing physical shaft length.',
    'Allowed target miss (mm)':
      'Maximum distance permitted between the selected needle tip and target during placement search.',
    'Avoidance margin (mm)':
      'Additional separation required between hardware and marked exclusion regions, beyond the shaft radius.',
    'Search step (mm)':
      'Controls placement sampling density. Smaller values test more candidates and may find placements missed by a coarser search.',
    'Hole spacing (mm)':
      'Centre-to-centre spacing of a regular guide grid for single-shaft probes. It is separate from the needle spacing within an array.',
  }
  hoverHelp(field,explanations[label]??(()=>controlExplanation(input)))
  return field
}

export function textField(label: string, value: string, onChange: (value: string) => void): HTMLLabelElement {
  const input = h('input', { type: 'text', value, maxLength: 120 })
  input.addEventListener('change', () => {
    if (input.value.trim()) onChange(input.value.trim())
  })
  const field=h('label', { class: 'field' }, [h('span', {}, [label]), input]);hoverHelp(field,()=>controlExplanation(input));return field
}
export function section(title: string, children: Array<Node | string>): HTMLElement {
  return h('section', { class: 'control-section' }, [h('h3', {}, [title]), ...children])
}
export function readout(label: string, value: string): HTMLElement {
  return h('div', { class: 'readout' }, [h('span', {}, [label]), h('strong', {}, [value])])
}
export function selectField(
  label: string,
  value: string,
  options: Array<{ value: string; label: string }>,
  onChange: (v: string) => void,
): HTMLElement {
  const select = h(
    'select',
    { ariaLabel: label },
    options.map((o) => h('option', { value: o.value }, [o.label])),
  )
  select.value = value
  select.addEventListener('change', () => onChange(select.value))
  const field=h('label', { class: 'field' }, [h('span', {}, [label]), select]);hoverHelp(field,()=>controlExplanation(select));return field
}
export function download(name: string, bytes: Uint8Array | string, type = 'application/octet-stream'): void {
  const blob = new Blob([typeof bytes === 'string' ? bytes : bytesView(bytes)], { type }),
    url = URL.createObjectURL(blob),
    a = h('a', { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function chooseFile(
  accept: string,
  callback: (file: File) => Promise<void>,
  onError: (error: unknown) => void,
): void {
  // Native Electron/macOS filters resolve final extensions, not compound suffixes.
  // Preserve .nii.gz but also advertise .gz so compressed NIfTI remains selectable.
  const nativeAccept = Array.from(
    new Set(
      accept.split(',').flatMap((value) => {
        const item = value.trim()
        return item.startsWith('.') && item.slice(1).includes('.') ? ['.' + item.split('.').at(-1)] : [item]
      }),
    ),
  ).join(',')
  const input = h('input', { type: 'file', accept: nativeAccept })
  input.hidden = true
  document.body.append(input)
  input.addEventListener('cancel', () => input.remove(), { once: true })
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    input.remove()
    if (!file) return
    const extensions = accept
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.startsWith('.'))
    if (extensions.length && !extensions.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      onError(new Error(`Unsupported file type. Choose ${extensions.join(', ')}.`))
      return
    }
    void callback(file).catch(onError)
  })
  input.click()
}
export function errorDialog(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  const dialog = h('dialog', { class: 'error-dialog' }, [
    h('h2', {}, ['Could not complete this action']),
    h('p', {}, [message]),
  ])
  dialog.append(button('Close', () => dialog.close(), 'primary'))
  dialog.addEventListener('close', () => dialog.remove())
  document.body.append(dialog)
  dialog.showModal()
}

/** Exclusive, toggleable slice-edit tools shared by CT, MRI and voxel painting. */
export function sliceEditButtons(current:()=> 'navigate'|'erase'|'restore',change:(mode:'navigate'|'erase'|'restore')=>void):HTMLElement {
  const modes=['navigate','erase','restore'] as const
  const row=h('div',{class:'slice-edit-buttons',role:'group',ariaLabel:'Slice editing tools'})
  const buttons=modes.map((mode,i)=>button(['Navigate','Erase','Add back'][i],()=>{change(current()===mode?'navigate':mode);sync()}))
  const sync=()=>buttons.forEach((b,i)=>{b.setAttribute('aria-pressed',String(current()===modes[i]));b.classList.toggle('active',current()===modes[i])})
  buttons[0].title='Move the crosshair and scroll through slices without editing.'
  buttons[1].title='Remove part of the estimated model with the slice brush. Click again to stop editing.'
  buttons[2].title='Restore previously removed or detected tissue with the slice brush. Missing boundaries are not invented. Click again to stop editing.'
  row.append(...buttons);sync();return row
}
