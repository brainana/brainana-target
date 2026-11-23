import type { Niivue } from '@niivue/niivue'
import { add, dot, length, scale, sub } from '@brainana/planning-core/geometry.ts'
import type { Pose, Vec3 } from '@brainana/planning-core/model.ts'
import type { TriangleSurface } from '@brainana/planning-core/surface-fit.ts'
import { raySurface, surfaceRay } from './surfacePicking.ts'

export interface DraggableObject {
  pose: () => Pose
  allowBackground?: boolean
  meshes: () => TriangleSurface[]
  preview: (pose: Pose) => void
}

export function installObjectDrag(canvas: HTMLCanvasElement, viewer: Niivue): (object: DraggableObject | null) => void {
  let selected: DraggableObject | null = null
  let drag: { id: number; move: (event: PointerEvent) => void; restore: () => void } | null = null
  let frame = 0
  let pending: PointerEvent | null = null

  const finish = (restore = false) => {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    pending = null
    const ended = drag
    drag = null
    if (ended && canvas.hasPointerCapture(ended.id)) canvas.releasePointerCapture(ended.id)
    if (restore) ended?.restore()
    canvas.classList.remove('moving-object')
  }

  canvas.addEventListener('pointerdown', event => {
    if (!selected || drag || event.button !== 0 || event.altKey) return
    const object = selected
    const rect = canvas.getBoundingClientRect()
    const matrix = viewer.calculateMvpMatrix(null, [0, 0, canvas.width, canvas.height], viewer.scene.renderAzimuth, viewer.scene.renderElevation)[0]
    const rayAt = (e: PointerEvent) => surfaceRay(matrix, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height)
    const ray = rayAt(event)
    if (!ray) return
    let hit: Vec3 | null = null
    for (const mesh of object.meshes()) {
      const point = raySurface(mesh, ...ray)
      if (point && (!hit || length(sub(point, ray[0])) < length(sub(hit, ray[0])))) hit = point
    }
    if (!hit && !object.allowBackground) return
    const anchor = hit ?? ray[0]
    const start = object.pose()
    const viewNormal = ray[1]
    drag = {
      id: event.pointerId,
      restore: () => object.preview(start),
      move: move => {
        if (Math.hypot(move.clientX - event.clientX, move.clientY - event.clientY) < 2) return
        const next = rayAt(move)
        if (!next) return
        const denominator = dot(viewNormal, next[1])
        if (Math.abs(denominator) < 1e-8) return
        const point = add(next[0], scale(next[1], dot(viewNormal, sub(anchor, next[0])) / denominator))
        object.preview({ origin: add(start.origin, sub(point, anchor)), angles: start.angles })
      },
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    canvas.setPointerCapture(event.pointerId)
    canvas.classList.add('moving-object')
  }, true)
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== drag?.id) return
    event.stopImmediatePropagation()
    pending = event
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0
      if (pending) drag?.move(pending)
    })
  }, true)
  canvas.addEventListener('pointerup', event => {
    if (event.pointerId !== drag?.id) return
    event.stopImmediatePropagation()
    drag.move(event)
    finish()
  }, true)
  for (const name of ['pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(name, event => {
      if ((event as PointerEvent).pointerId === drag?.id) finish(true)
    }, true)
  }
  for (const name of ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove']) {
    canvas.addEventListener(name, event => {
      if (drag) event.stopImmediatePropagation()
    }, true)
  }

  return object => {
    if (selected === object) return
    finish()
    selected = object
    canvas.classList.toggle('move-object-mode', !!object)
  }
}
