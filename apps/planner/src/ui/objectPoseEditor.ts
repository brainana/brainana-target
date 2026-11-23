import { h } from '@brainana/ui/dom.ts'
import type { Pose } from '@brainana/planning-core/model.ts'
import { button, note } from './controls.ts'

interface Options {
  initial: Pose
  preview: (pose: Pose | null) => void
  apply: (pose: Pose) => boolean
  setDrag: (drag: { pose: () => Pose; preview: (pose: Pose) => void } | null) => void
  locate?: (pose: Pose) => void
  translationOnly?: boolean
  dragLabel?: string
  afterApply?: () => void
}

export function objectPoseEditor(options: Options): HTMLElement {
  let initial = structuredClone(options.initial)
  let pose = structuredClone(initial)
  let moving = false
  let pendingFrame = 0
  const root = h('form', { class: 'object-pose-editor' })
  const feedback = note('')
  feedback.setAttribute('role', 'status')
  const apply = h('button', { type: 'submit', class: 'primary', disabled: true }, ['Apply position'])
  const cancel = button('Revert preview', () => update(initial))
  cancel.disabled = true
  const drag = button(options.dragLabel ?? 'Drag in 3D', () => {
    moving = !moving
    drag.setAttribute('aria-pressed', String(moving))
    options.setDrag(moving ? { pose: () => pose, preview: update } : null)
    updateFeedback()
  })
  drag.setAttribute('aria-pressed', 'false')

  function updateFeedback(): void {
    const pending = !apply.disabled
    feedback.textContent = [
      moving ? 'Drag the visible object to move it. Drag elsewhere to rotate the view.' : '',
      pending ? 'Preview. Apply position to keep the change.' : '',
    ].filter(Boolean).join(' ')
  }

  function update(next: Pose): void {
    pose = {
      origin: next.origin.map(value => Math.max(-10000, Math.min(10000, value))) as Pose['origin'],
      angles: [...next.angles],
    }
    for (const field of fields) field.sync()
    const changed = pose.origin.some((value, i) => value !== initial.origin[i]) || pose.angles.some((value, i) => value !== initial.angles[i])
    apply.disabled = cancel.disabled = !changed
    updateFeedback()
    if (pendingFrame) cancelAnimationFrame(pendingFrame)
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0
      if (root.isConnected) options.preview(changed ? pose : null)
    })
  }

  const field = (label: string, key: keyof Pose, axis: number) => {
    const number = h('input', { type: 'number', step: 'any', min: '-10000', max: '10000', required: true, ariaLabel: label })
    const range = h('input', { type: 'range', step: key === 'origin' ? '.1' : '1', ariaLabel: label + ' slider' })
    const change = (value: number) => {
      const next = structuredClone(pose)
      next[key][axis] = value
      update(next)
    }
    number.addEventListener('change', () => {
      if (number.validity.valid) change(number.valueAsNumber)
    })
    range.addEventListener('input', () => change(range.valueAsNumber))
    return {
      element: h('label', { class: 'object-pose-field' }, [h('span', {}, [label]), number, range]),
      sync: () => {
        const span = key === 'origin' ? 25 : 180
        range.min = String(Math.max(-10000, initial[key][axis] - span))
        range.max = String(Math.min(10000, initial[key][axis] + span))
        range.value = String(pose[key][axis])
        number.value = String(Number(pose[key][axis].toFixed(4)))
      },
    }
  }
  const fields = [
    ...['R (mm)', 'A (mm)', 'S (mm)'].map((label, i) => field(label, 'origin', i)),
    ...(!options.translationOnly ? ['Rotate X (°)', 'Rotate Y (°)', 'Rotate Z (°)'].map((label, i) => field(label, 'angles', i)) : []),
  ]
  for (const item of fields) item.sync()
  root.append(h('div', { class: 'button-row' }, [drag, ...(options.locate ? [button('Locate', () => options.locate?.(pose))] : [])]),
    h('div', { class: 'object-pose-fields' }, fields.map(item => item.element)),
    h('div', { class: 'button-row' }, [apply, cancel]), feedback)
  root.addEventListener('submit', event => {
    event.preventDefault()
    if (apply.disabled) return
    if (pendingFrame) cancelAnimationFrame(pendingFrame)
    pendingFrame = 0
    if (!options.apply(pose)) return
    options.setDrag(null)
    options.preview(null)
    moving = false
    drag.setAttribute('aria-pressed', 'false')
    initial = structuredClone(pose)
    update(initial)
    feedback.textContent = 'Position applied.'
    options.afterApply?.()
  })
  return root
}
