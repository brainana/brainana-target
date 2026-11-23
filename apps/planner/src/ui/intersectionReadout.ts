import { h } from '@brainana/ui/dom.ts'
import type { Vec3 } from '@brainana/planning-core/model.ts'
import type { IntersectionOverlay } from '../render/intersectionOverlay.ts'
import { beginActivity } from './activity.ts'
import { button } from './controls.ts'

export function intersectionReadout(overlay: IntersectionOverlay, locate: (point: Vec3) => void): HTMLElement {
  const message = h('p', { class: 'intersection-status', role: 'status' })
  const next = button('Next red marker', () => {
    const point = overlay.nextPoint()
    if (point) locate(point)
  })
  next.title = 'Move the slice crosshair to the next marked intersection.'
  const root = h('div', { class: 'button-row intersection-readout', hidden: true }, [message, next])
  let finish: (() => void) | undefined
  overlay.status = (text, checking) => {
    if (checking) finish ??= beginActivity(text)
    else { finish?.(); finish = undefined }
    root.hidden = !text
    message.textContent = text
    next.hidden = !overlay.hasPoints
  }
  return root
}
