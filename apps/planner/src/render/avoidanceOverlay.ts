import {rasterTargetRegion,targetRegionIntersectsPlane} from './targetRegion.ts'
import {avoidanceKey} from './avoidanceKey.ts'
import { SLICE_TYPE } from '@niivue/niivue'
import type { Niivue } from '@niivue/niivue'
import type { AvoidRegion, Target, Vec3 } from '@brainana/planning-core/model.ts'
import { avoidanceMask } from '@brainana/planning-core/avoidance-mask.ts'
import { add, sub, scale, normalize, length, dot, cross } from '@brainana/planning-core/geometry.ts'
/** Cheap, accurate 2D painting preview while 3D mesh generation is deferred. */
export class AvoidanceOverlay {
  color='#00d9df'
  readonly canvas = document.createElement('canvas')
  #cache = new Map<string, Uint8Array>()
  constructor(
    readonly source: HTMLCanvasElement,
    readonly nv: Niivue,
  ) {
    this.canvas.className = 'brush-preview cardinal-overlay'
    this.canvas.hidden = true
    source.parentElement!.append(this.canvas)
  }
  #pending:number|undefined
  schedule(regions:AvoidRegion[],visible:boolean,targets:Target[]=[]):void{
    if(this.#pending!==undefined)cancelAnimationFrame(this.#pending)
    this.#pending=requestAnimationFrame(()=>{this.#pending=undefined;this.draw(regions,visible,targets)})
  }
  draw(regions: AvoidRegion[], visible: boolean, targets: Target[] = []): void {
    const overlay = this.canvas,
      source = this.source
    visible = visible || targets.length > 0
    overlay.hidden = !visible
    if (!visible) return
    overlay.width = source.width
    overlay.height = source.height
    overlay.style.inset = 'auto'
    overlay.style.left = `${source.offsetLeft}px`
    overlay.style.top = `${source.offsetTop}px`
    const rect = source.getBoundingClientRect()
    overlay.style.width = `${rect.width}px`
    overlay.style.height = `${rect.height}px`
    const ctx = overlay.getContext('2d')!
    for (const tile of this.nv.screenSlices) {
      if (tile.axCorSag > SLICE_TYPE.SAGITTAL) continue
      const [left, top, width, height] = tile.leftTopWidthHeight
      if (width <= 0 || height <= 0) continue
      const ref = this.nv.frac2canvasPosWithTile(this.nv.scene.crosshairPos, tile.axCorSag)
      if (!ref) continue
      const [x, y] = ref.pos,
        mm = this.nv.screenXY2mm(x, y),
        mx = this.nv.screenXY2mm(x + 1, y),
        my = this.nv.screenXY2mm(x, y + 1)
      if (![...mm, ...mx, ...my].every(Number.isFinite)) continue
      const center: Vec3 = [mm[0], mm[1], mm[2]],
        dx = sub([mx[0], mx[1], mx[2]], center),
        dy = sub([my[0], my[1], my[2]], center)
      if (length(dx) < 1e-8 || length(dy) < 1e-8) continue
      const plane = {
        center: add(center, add(scale(dx, left + width / 2 - x), scale(dy, top + height / 2 - y))),
        right: normalize(dx),
        up: scale(normalize(dy), -1),
        widthMm: length(dx) * width,
        heightMm: length(dy) * height,
      }
      // Nothing intersects this slice: avoid rasterizing a full blank overlay on every wheel event.
      if(!regions.length&&targets.every(t=>!targetRegionIntersectsPlane(t,plane)&&Math.abs(dot(sub(t.point,plane.center),cross(plane.right,plane.up)))>=(t.displayRadiusMm??2)))continue
      const w = Math.min(768, Math.ceil(width)),
        h = Math.max(1, Math.round((w * height) / width))
      const key = JSON.stringify([plane, w, h, avoidanceKey(regions)])
      let mask = this.#cache.get(key)
      if (!mask&&regions.length) {
        mask = avoidanceMask(plane, w, h, regions)
        if (this.#cache.size >= 6) this.#cache.delete(this.#cache.keys().next().value!)
        this.#cache.set(key, mask)
      }
      const image = ctx.createImageData(w, h)
      mask?.forEach((value, i) => {
        if (value) {
          image.data[i * 4] = parseInt(this.color.slice(1,3),16)
          image.data[i * 4 + 1] = parseInt(this.color.slice(3,5),16)
          image.data[i * 4 + 2] = parseInt(this.color.slice(5,7),16)
          image.data[i * 4 + 3] = 100
        }
      })
      for(const target of targets)rasterTargetRegion(image.data,w,h,plane,target)
      // Visit only the pixels covered by a target halo, rather than allocating world
      // vectors for every pixel of every slice on each crosshair move.
      for(const target of targets){
        const radius=target.displayRadiusMm??2;if(radius<=0)continue
        const delta=sub(target.point,plane.center),tx=dot(delta,plane.right),ty=dot(delta,plane.up),tz=dot(delta,cross(plane.right,plane.up))
        if(Math.abs(tz)>=radius)continue
        const rgb = [1, 3, 5].map(i => parseInt(target.color.slice(i, i + 2), 16))
        const extent=Math.sqrt(radius*radius-tz*tz),sx=plane.widthMm/w,sy=plane.heightMm/h
        const left=Math.max(0,Math.floor((tx-extent)/sx+w/2)),right=Math.min(w-1,Math.ceil((tx+extent)/sx+w/2))
        const top=Math.max(0,Math.floor(h/2-(ty+extent)/sy)),bottom=Math.min(h-1,Math.ceil(h/2-(ty-extent)/sy))
        for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++){
          const distance=Math.hypot((col+.5-w/2)*sx-tx,(h/2-row-.5)*sy-ty,tz)
          if(distance>=radius)continue
          const strength=1-distance/radius,i=(row*w+col)*4
          image.data[i]=rgb[0];image.data[i+1]=rgb[1];image.data[i+2]=rgb[2]
          image.data[i+3]=Math.max(image.data[i+3],Math.round(175*strength))
        }
      }
      const temp = document.createElement('canvas')
      temp.width = w
      temp.height = h
      temp.getContext('2d')!.putImageData(image, 0, 0)
      ctx.drawImage(temp, left, top, width, height)
    }
  }
}
