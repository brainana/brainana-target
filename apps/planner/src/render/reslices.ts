import {electrodeAssembly} from '@brainana/planning-core/electrode-frame.ts'
import {avoidanceKey} from './avoidanceKey.ts'
import { trajectoryPlanes } from './trajectoryPlanes.ts'
import { avoidanceMask } from '@brainana/planning-core/avoidance-mask.ts'
import type { Project, Vec3 } from '@brainana/planning-core/model.ts'
import {
  trajectory,
  guideTubePath,
  electrodePaths,
  trajectoryAxes,
  dot,
  sub,
  add,
  scale,
  length,
  cross,
  normalize,
} from '@brainana/planning-core/geometry.ts'
import { reslice, type Plane, planePoint } from '@brainana/planning-core/reslice.ts'
import type { VolumeSampler } from './volume.ts'
const normalizePlane = (p: Plane): Vec3 => normalize(cross(p.right, p.up))
export class TrajectoryReslices {
  avoidanceColor='#00d9df'
  angleDegrees = 0
  tipOffset = 0
  visible: 'both' | 'along' | 'across' | 'none' = 'both'
  #planes = new Map<HTMLCanvasElement, Plane>()
  #zoom = [1, 1]
  #pan = [[0,0],[0,0]]
  pan(index:number,right:number,up:number):void{const plane=this.#planes.get(index===0?this.along:this.across);if(!plane)return;this.#pan[index][0]+=right*.06*plane.widthMm;this.#pan[index][1]+=up*.06*plane.heightMm}
  #maskCache = new Map<string, Uint8Array>()
  zoom(index: number, factor: number | null): void {
    if(factor===null)this.#pan[index]=[0,0]
    this.#zoom[index] = factor === null ? 1 : Math.max(0.25, Math.min(8, this.#zoom[index] * factor))
  }
  screenPoint(canvas: HTMLCanvasElement, x: number, y: number): Vec3 | null {
    const plane = this.#planes.get(canvas)
    if (!plane) return null
    const r = canvas.getBoundingClientRect()
    return planePoint(
      plane,
      (x / r.width) * canvas.width - 0.5,
      (y / r.height) * canvas.height - 0.5,
      canvas.width,
      canvas.height,
    )
  }
  onPick: (p: Vec3) => void = () => {}
  constructor(
    readonly along: HTMLCanvasElement,
    readonly across: HTMLCanvasElement,
  ) {
    for (const canvas of [along, across])
      canvas.addEventListener('click', (e) => {
        const plane = this.#planes.get(canvas)
        if (!plane) return
        const r = canvas.getBoundingClientRect()
        this.onPick(
          planePoint(
            plane,
            ((e.clientX - r.left) / r.width) * canvas.width - 0.5,
            ((e.clientY - r.top) / r.height) * canvas.height - 0.5,
            canvas.width,
            canvas.height,
          ),
        )
      })
  }
  draw(project: Project | null, electrodeId: string | null, volume: VolumeSampler | null): void {
    if (this.visible === 'none') { this.#planes.clear(); return }
    const e = project?.electrodes.find((e) => e.id === electrodeId),
      assembly=project&&e?electrodeAssembly(project,e):null,
      g=assembly?.grid,c=assembly?.chamber
    if (!project || !e || !g || !c || c.placementState === 'unplaced' || !volume) {
      this.clear()
      return
    }
    const t = trajectory(c, g, e),
      [, , w] = trajectoryAxes(t.direction)
    const planes = trajectoryPlanes(t.entry, t.tip, t.direction, e.depth, this.angleDegrees, this.tipOffset)
    const u = planes[0].right, v = normalizePlane(planes[0])
    ;[this.along, this.across].forEach((canvas, i) => {
      if (this.visible !== 'both' && this.visible !== (i === 0 ? 'along' : 'across')) { this.#planes.delete(canvas); return }
      const base = planes[i]
      const plane = {
        ...base,
        center:add(base.center,add(scale(base.right,-this.#pan[i][0]),scale(base.up,-this.#pan[i][1]))),
        widthMm: base.widthMm / this.#zoom[i],
        heightMm: base.heightMm / this.#zoom[i],
      }
      this.#planes.set(canvas, plane)
      const rect = canvas.getBoundingClientRect()
      const resolution = Math.max(256, Math.min(768, Math.round(Math.min(rect.width, rect.height) * (window.devicePixelRatio || 1))))
      if (canvas.width !== resolution) canvas.width = canvas.height = resolution
      const ctx = canvas.getContext('2d')!
      const size = canvas.width,
        values = reslice(plane, size, size, (p) => volume.sample(p)),
        image = ctx.createImageData(size, size)
      const lo = volume.image.cal_min ?? 0,
        hi = volume.image.cal_max ?? 1
      values.forEach((value, j) => {
        const gray = Number.isFinite(value)
          ? Math.max(0, Math.min(255, ((value - lo) / Math.max(1e-8, hi - lo)) * 255))
          : 0
        image.data[j * 4] = gray
        image.data[j * 4 + 1] = gray
        image.data[j * 4 + 2] = gray
        image.data[j * 4 + 3] = 255
      })
      const strokes = (project.avoidRegions ?? []).filter((r) => r.points)
      if (strokes.length) {
        const key = JSON.stringify([plane, size, avoidanceKey(strokes)])
        let mask = this.#maskCache.get(key)
        if (!mask) {
          mask = avoidanceMask(plane, size, size, strokes)
          if (this.#maskCache.size >= 8) this.#maskCache.delete(this.#maskCache.keys().next().value!)
          this.#maskCache.set(key, mask)
        }
        const rgb=[1,3,5].map(i=>parseInt(this.avoidanceColor.slice(i,i+2),16))
        for (let j = 0; j < mask.length; j++)
          if (mask[j]) {
            const pixel = j * 4
            image.data[pixel] = Math.round(image.data[pixel] * 0.6 + rgb[0] * 0.4)
            image.data[pixel + 1] = Math.round(image.data[pixel + 1] * 0.6 + rgb[1] * 0.4)
            image.data[pixel + 2] = Math.round(image.data[pixel + 2] * 0.6 + rgb[2] * 0.4)
          }
      }
      ctx.putImageData(image, 0, 0)
      const projectPoint = (p: Vec3): [number, number] => {
        const d = sub(p, plane.center)
        return [
          (dot(d, plane.right) / plane.widthMm + 0.5) * size,
          (0.5 - dot(d, plane.up) / plane.heightMm) * size,
        ]
      }
      const tube = guideTubePath(c, g, e)
      if (tube && e.guideTube) {
        ctx.strokeStyle = '#98b3d2'
        if (i === 0) {
          for (const side of [-1, 1]) {
            const offset = scale(u, (side * e.guideTube.outerDiameter) / 2),
              a = projectPoint(add(tube.start, offset)),
              b = projectPoint(add(tube.end, offset))
            ctx.beginPath()
            ctx.moveTo(...a)
            ctx.lineTo(...b)
            ctx.stroke()
          }
        } else if (e.depth + this.tipOffset >= e.guideTube.tipDepth - e.guideTube.length && e.depth + this.tipOffset <= e.guideTube.tipDepth) {
          const [x, y] = projectPoint(t.tip)
          for (const diameter of [e.guideTube.innerDiameter, e.guideTube.outerDiameter]) {
            ctx.beginPath()
            ctx.arc(x, y, ((diameter / 2) * size) / plane.widthMm, 0, 2 * Math.PI)
            ctx.stroke()
          }
        }
      }
      ctx.strokeStyle = e.color
      ctx.lineWidth = 1.5
      if (i === 0) {
        const a = projectPoint(t.entry),
          b = projectPoint(t.tip)
        ctx.beginPath()
        ctx.moveTo(...a)
        ctx.lineTo(...b)
        ctx.stroke()
      }
      const normal = i === 0 ? v : w
      for (const path of electrodePaths(c, g, e)) {
        if (i === 0 && Math.abs(dot(sub(path.entry, t.entry), normal)) < 0.5) {
          const a = projectPoint(path.entry),
            b = projectPoint(path.tip)
          ctx.strokeStyle = e.color
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(...a)
          ctx.lineTo(...b)
          ctx.stroke()
        }
        const distance = dot(sub(plane.center, path.entry), w)
        if (i === 1 && distance >= 0 && distance <= length(sub(path.tip, path.entry))) {
          const [x, y] = projectPoint(add(path.entry, scale(w, distance)))
          ctx.fillStyle = e.color
          ctx.fillRect(x - 2, y - 2, 4, 4)
        }
      }
      for (const target of project.targets) {
        const d = sub(target.point, plane.center)
        const radius = target.displayRadiusMm ?? 2, distance = Math.abs(dot(d, normal))
        if (distance > Math.max(1, radius)) continue
        const [x, y] = projectPoint(target.point)
        if (radius > distance) {
          const pixels = Math.sqrt(radius * radius - distance * distance) / plane.widthMm * size
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, pixels)
          gradient.addColorStop(0, '#ffdd48b0'); gradient.addColorStop(0.4, '#ff6b3270'); gradient.addColorStop(1, '#ff302000')
          ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, pixels, 0, Math.PI * 2); ctx.fill()
        }
        if (distance > 1) continue
        ctx.strokeStyle = target.color
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.stroke()
      }
      for (const region of project.avoidRegions ?? []) {
        if (region.points) continue
        const normal = normalizePlane(plane)
        const distance = Math.abs(dot(sub(region.center, plane.center), normal))
        if (distance > region.radius) continue
        const [x, y] = projectPoint(region.center)
        const radius = (Math.sqrt(region.radius ** 2 - distance ** 2) / plane.widthMm) * size
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, 2 * Math.PI)
        ctx.fillStyle = this.avoidanceColor+'33'
        ctx.strokeStyle = this.avoidanceColor
        ctx.fill()
        ctx.stroke()
      }
      for (const contact of t.contacts) {
        if (i === 1 && Math.abs(dot(sub(contact, plane.center), w)) > 0.5) continue
        const [x, y] = projectPoint(contact)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(x - 2, y - 2, 4, 4)
      }
      if (i === 0 || Math.abs(this.tipOffset) < 0.5) {
      const [x, y] = projectPoint(t.tip)
      ctx.strokeStyle = e.color
      ctx.beginPath()
      ctx.moveTo(x - 6, y)
      ctx.lineTo(x + 6, y)
      ctx.moveTo(x, y - 6)
      ctx.lineTo(x, y + 6)
      ctx.stroke()
      }
      const uiScale = size / Math.max(1, rect.width), labelSize = size / uiScale
      ctx.save(); ctx.scale(uiScale, uiScale)
      ctx.fillStyle = '#000a'
      ctx.fillRect(6, 4, 145, 17)
      ctx.fillRect(labelSize - 85, labelSize - 36, 80, 29)
      ctx.fillStyle = '#f4c877'
      ctx.font = '11px monospace'
      ctx.fillText(i === 0 ? '↑ toward grid' : this.tipOffset === 0 ? 'at electrode tip' : `${(e.depth + this.tipOffset).toFixed(1)} mm from grid`, 10, 16)
      const bar = (10 / plane.widthMm) * labelSize
      ctx.strokeStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(labelSize - 12 - bar, labelSize - 14)
      ctx.lineTo(labelSize - 12, labelSize - 14)
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.fillText('10 mm', labelSize - 56, labelSize - 22)
      ctx.restore()
    })
  }
  clear(): void {
    this.#planes.clear()
    for (const c of [this.along, this.across]) {
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#0e0d0a'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.fillStyle = '#a1957f'
      ctx.font = '13px sans-serif'
      ctx.fillText('Select an electrode to inspect its path', 15, c.height / 2)
    }
  }
}
