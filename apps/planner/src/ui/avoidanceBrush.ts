import type { Vec3 } from '@brainana/planning-core/model.ts'
import { length, sub, cross, normalize } from '@brainana/planning-core/geometry.ts'
export interface BrushPoint {
  point: Vec3
  plane: number
}
/** Shared pointer tool. Geometry uses physical millimetres; each stroke stays on one slice. */
export function attachAvoidanceBrush(
  canvas: HTMLCanvasElement,
  map: (x: number, y: number) => BrushPoint | null,
  enabled: () => boolean,
  radius: () => number,
  commit: (points: Vec3[], radius: number, normal?: Vec3) => void,
  options: {fill?:()=>boolean;color?:()=>string} = {},
): void {
  const overlay = document.createElement('canvas')
  overlay.className = 'brush-preview'
  canvas.parentElement!.append(overlay)
  let stroke: {
    id: number
    points: Vec3[]
    pixels: [number, number][]
    plane: number
    radius: number
    normal?: Vec3
  } | null = null
  const position = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const preview = (): void => {
    const r = canvas.getBoundingClientRect()
    overlay.style.inset = 'auto'
    overlay.style.left = `${canvas.offsetLeft}px`
    overlay.style.top = `${canvas.offsetTop}px`
    overlay.style.width = `${r.width}px`
    overlay.style.height = `${r.height}px`
    overlay.width = Math.round(r.width)
    overlay.height = Math.round(r.height)
    const ctx = overlay.getContext('2d')!
    if (!stroke) return
    const [x, y] = stroke.pixels[0],
      a = map(x, y),
      b = map(x + 1, y)
    const mm = a && b && a.plane === b.plane ? length(sub(a.point, b.point)) : 0
    ctx.strokeStyle = (options.color?.()??'#ef6c79')+'88'
    ctx.fillStyle=ctx.strokeStyle
    ctx.lineWidth = mm > 0 ? (2 * stroke.radius) / mm : 8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    stroke.pixels.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    if (stroke.pixels.length === 1) ctx.lineTo(x + 0.01, y)
    if(options.fill?.()&&stroke.pixels.length>=3){ctx.closePath();ctx.fill()}
    ctx.stroke()
  }
  const suppress = (e: Event): void => {
    e.preventDefault()
    e.stopImmediatePropagation()
  }
  for (const event of [
    'mousedown',
    'mousemove',
    'mouseup',
    'click',
    'dblclick',
    'touchstart',
    'touchmove',
    'touchend',
  ])
    canvas.addEventListener(
      event,
      (e) => {
        if (enabled() || stroke) suppress(e)
      },
      { capture: true, passive: false },
    )
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (!enabled() || e.button !== 0) return
      suppress(e)
      if (stroke) return
      const pixel = position(e),
        location = map(...pixel)
      if (!location) return
      const px=map(pixel[0]+1,pixel[1]),py=map(pixel[0],pixel[1]+1)
      const n=px&&py&&px.plane===location.plane&&py.plane===location.plane?cross(sub(px.point,location.point),sub(py.point,location.point)):null
      stroke = {
        id: e.pointerId,
        points: [location.point],
        pixels: [pixel],
        plane: location.plane,
        radius: radius(),
        normal:n&&length(n)>1e-8?normalize(n):undefined,
      }
      canvas.setPointerCapture(e.pointerId)
      preview()
    },
    true,
  )
  canvas.addEventListener(
    'pointermove',
    (e) => {
      if (!stroke || e.pointerId !== stroke.id) return
      suppress(e)
      const pixel = position(e),
        location = map(...pixel)
      if (!location || location.plane !== stroke.plane || stroke.points.length >= 1024) return
      if (length(sub(location.point, stroke.points.at(-1)!)) < Math.max(0.1, stroke.radius * 0.2)) return
      stroke.points.push(location.point)
      stroke.pixels.push(pixel)
      preview()
    },
    true,
  )
  const finish = (e: PointerEvent, cancelled: boolean): void => {
    if (!stroke || e.pointerId !== stroke.id) return
    suppress(e)
    const pixel=position(e),location=map(...pixel)
    if(!cancelled&&location&&location.plane===stroke.plane&&stroke.points.length<1024){stroke.points.push(location.point);stroke.pixels.push(pixel)}
    const completed = stroke
    stroke = null
    preview()
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    if (!cancelled && enabled()) commit(completed.points, completed.radius, completed.normal)
  }
  canvas.addEventListener('pointerup', (e) => finish(e, false), true)
  canvas.addEventListener('pointercancel', (e) => finish(e, true), true)
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (stroke) suppress(e)
    },
    { capture: true, passive: false },
  )
}
