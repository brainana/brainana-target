import {segmentTriangleDistance} from './wall-mesh.ts'
import type {Vec3} from './model.ts'
import type { AvoidRegion } from './model.ts'
import type { Plane } from './reslice.ts'
import { cross, dot, sub } from './geometry.ts'
/** Rasterize only projected segment bounding boxes; exact capsule membership at pixel centres. */
export function avoidanceMask(
  plane: Plane,
  width: number,
  height: number,
  regions: AvoidRegion[],
): Uint8Array {
  const mask = new Uint8Array(width * height),
    normal = cross(plane.right, plane.up)
  const dx = plane.widthMm / width,
    dy = plane.heightMm / height
  for(const region of regions.filter(r=>r.drawingMode==='surface'&&r.surfacePatch)){
    const {pts,tris}=region.surfacePatch!,tolerance=Math.max(dx,dy)*.6
    for(let i=0;i<tris.length;i+=3){
      const vertices=[0,1,2].map(j=>[pts[tris[i+j]*3],pts[tris[i+j]*3+1],pts[tris[i+j]*3+2]] as Vec3)
      const local=vertices.map(v=>sub(v,plane.center)),zs=local.map(v=>dot(v,normal))
      if(Math.min(...zs)>tolerance||Math.max(...zs)<-tolerance)continue
      const xs=local.map(v=>dot(v,plane.right)/dx+width/2-.5),ys=local.map(v=>height/2-.5-dot(v,plane.up)/dy)
      for(let y=Math.max(0,Math.floor(Math.min(...ys)-1));y<=Math.min(height-1,Math.ceil(Math.max(...ys)+1));y++)for(let x=Math.max(0,Math.floor(Math.min(...xs)-1));x<=Math.min(width-1,Math.ceil(Math.max(...xs)+1));x++){
       const p=plane.center.map((v,k)=>v+plane.right[k]*(x+.5-width/2)*dx+plane.up[k]*(height/2-y-.5)*dy) as Vec3
       if(segmentTriangleDistance(p,p,vertices[0],vertices[1],vertices[2])<=tolerance)mask[x+y*width]=1
      }
    }
  }
  for (const original of regions.filter(r=>r.drawingMode!=='surface'||!r.surfacePatch)) for(const region of [original,...(original.stamps??[]).map(center=>({...original,points:[center]}))]) {
    const points = region.points ?? [region.center],
      radius = region.radius
    for (let i = 0; i < Math.max(1, points.length - 1); i++) {
      const a = points[i],
        b = points[Math.min(i + 1, points.length - 1)]
      const da = sub(a, plane.center),
        db = sub(b, plane.center)
      const za = dot(da, normal),
        zb = dot(db, normal)
      if (Math.min(za, zb) > radius || Math.max(za, zb) < -radius) continue
      const ax = dot(da, plane.right),
        ay = dot(da, plane.up),
        bx = dot(db, plane.right),
        by = dot(db, plane.up)
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - radius) / dx + width / 2 - 0.5)),
        x1 = Math.min(width - 1, Math.ceil((Math.max(ax, bx) + radius) / dx + width / 2 - 0.5))
      const y0 = Math.max(0, Math.floor(height / 2 - 0.5 - (Math.max(ay, by) + radius) / dy)),
        y1 = Math.min(height - 1, Math.ceil(height / 2 - 0.5 - (Math.min(ay, by) - radius) / dy))
      const ux = bx - ax,
        uy = by - ay,
        uz = zb - za,
        uu = ux * ux + uy * uy + uz * uz,
        rr = radius * radius
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const index = x + y * width
          if (mask[index]) continue
          const wx = (x + 0.5 - width / 2) * dx - ax,
            wy = (height / 2 - y - 0.5) * dy - ay,
            wz = -za
          const t = uu > 1e-12 ? Math.max(0, Math.min(1, (wx * ux + wy * uy + wz * uz) / uu)) : 0
          if ((wx - t * ux) ** 2 + (wy - t * uy) ** 2 + (wz - t * uz) ** 2 <= rr + 1e-10) mask[index] = 1
        }
    }
  }
  return mask
}
