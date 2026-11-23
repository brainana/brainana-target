import type { Candidate } from '@brainana/planning-core/optimization.ts'
import type { Vec3 } from '@brainana/planning-core/model.ts'
import type { TriangleSurface } from '@brainana/planning-core/surface-fit.ts'
import type { MeshGeometry } from './primitives.ts'

/** Surface triangles near validated samples. This visualizes sampling coverage, not a proof between samples. */
export function placementMap(surfaces: TriangleSurface[], candidates: Candidate[], spacing: number): Array<{geometry: MeshGeometry; soft: boolean; opening: boolean}> {
  const buckets = new Map<string, Candidate[]>()
  const cell = Math.max(.1, spacing)
  const key = (p: ArrayLike<number>) => [0,1,2].map(k=>Math.floor(p[k]/cell)).join(',')
  for (const c of candidates) if(c.surfaceCenter){const k=key(c.surfaceCenter);const list=buckets.get(k)??[];list.push(c);buckets.set(k,list)}
  const nearest = (p: Vec3): Candidate | undefined => {
    const base=p.map(v=>Math.floor(v/cell));let best:Candidate|undefined;let distance=cell*cell
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)
      for(const c of buckets.get([base[0]+x,base[1]+y,base[2]+z].join(','))??[]){const d=c.surfaceCenter!.reduce((s,v,k)=>s+(v-p[k])**2,0);if(d<distance){distance=d;best=c}}
    return best
  }
  const groups=Array.from({length:3},()=>({pts:[] as number[],tris:[] as number[]}))
  for(const s of surfaces){
    const points=Array.from({length:s.pts.length/3},(_,i)=>[s.pts[i*3],s.pts[i*3+1],s.pts[i*3+2]] as Vec3)
    const assignments=points.map(nearest)
    const indices=Array.from({length:3},()=>new Map<number,number>())
    for(let i=0;i<s.tris.length;i+=3){
      const vertices=[s.tris[i],s.tris[i+1],s.tris[i+2]]
      if(!vertices.every(v=>assignments[v]))continue
      const center=[0,1,2].map(k=>vertices.reduce((sum,v)=>sum+points[v][k],0)/3) as Vec3
      const c=nearest(center);if(!c)continue
      const group=c.openingOverlap?2:c.softViolations?.length?1:0,g=groups[group]
      const ids=vertices.map(v=>{
        let index=indices[group].get(v)
        if(index===undefined){
          index=g.pts.length/3;indices[group].set(v,index)
          const sample=assignments[v]!,axis=sample.pose.origin.map((n,k)=>n-sample.surfaceCenter![k]),norm=Math.hypot(...axis)||1
          // Annotation only: a small outward offset prevents depth flicker.
          g.pts.push(...points[v].map((n,k)=>n+.15*axis[k]/norm))
        }
        return index
      })
      g.tris.push(...ids,ids[2],ids[1],ids[0])
    }
  }
  return groups.map((g,i)=>({geometry:{pts:new Float32Array(g.pts),tris:new Uint32Array(g.tris)},soft:i===1,opening:i===2}))
}
export function nearestPlacement(candidates: Candidate[], point: Vec3, radius: number): Candidate | undefined {
  let best:Candidate|undefined,distance=radius
  for(const c of candidates)if(c.surfaceCenter){const d=Math.hypot(...c.surfaceCenter.map((v,k)=>v-point[k]));if(d<distance){distance=d;best=c}}
  return best
}
