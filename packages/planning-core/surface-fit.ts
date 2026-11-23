import { SurfaceRayIndex } from './surface-rays.ts'
import { axes, localToWorld, add, scale, sub, dot, cross, normalize, length, aimPose } from './geometry.ts'
import type { Chamber, Vec3 } from './model.ts'
export interface TriangleSurface {
  /** Extracted envelope has verified outward winding; back walls cannot support a rim. */
  outerEnvelope?: boolean
  pts: ArrayLike<number>
  tris: ArrayLike<number>
}
/** First positive triangle intersection. Winding-independent, no inside/outside inference. */
export function raySurfaceDistance(origin: Vec3, direction: Vec3, surfaces: TriangleSurface[]): number {
  let nearest = Infinity
  for (const { pts, tris } of surfaces)
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i] * 3,
        b = tris[i + 1] * 3,
        c = tris[i + 2] * 3
      const ux = pts[b] - pts[a],
        uy = pts[b + 1] - pts[a + 1],
        uz = pts[b + 2] - pts[a + 2]
      const vx = pts[c] - pts[a],
        vy = pts[c + 1] - pts[a + 1],
        vz = pts[c + 2] - pts[a + 2]
      const px = direction[1] * vz - direction[2] * vy,
        py = direction[2] * vx - direction[0] * vz,
        pz = direction[0] * vy - direction[1] * vx
      const det = ux * px + uy * py + uz * pz
      if (Math.abs(det) < 1e-10) continue
      const tx = origin[0] - pts[a],
        ty = origin[1] - pts[a + 1],
        tz = origin[2] - pts[a + 2]
      const u = (tx * px + ty * py + tz * pz) / det
      if (u < -1e-8 || u > 1 + 1e-8) continue
      const qx = ty * uz - tz * uy,
        qy = tz * ux - tx * uz,
        qz = tx * uy - ty * ux
      const v = (direction[0] * qx + direction[1] * qy + direction[2] * qz) / det
      if (v < -1e-8 || u + v > 1 + 1e-8) continue
      const t = (vx * qx + vy * qy + vz * qz) / det
      if (t >= 0) nearest = Math.min(nearest, t)
    }
  return nearest
}
/** Samples both rim edges along the chamber insertion axis; preserves top plane and bore. */
export function fitChamberBase(
  c: Chamber,
  surfaces: TriangleSurface[],
  source: 'skull' | 'brain',
  assetIds: string[],
  gap = 0.5,
  rayIndex = new SurfaceRayIndex(surfaces),
): NonNullable<Chamber['baseFit']> {
  const segments = 64,
    minimum = c.minimumWallHeight ?? 2
  const hitAt = (origin:Vec3, direction:Vec3) => rayIndex.distance(origin,direction,Infinity,true)
  const direction = scale(axes(c.pose)[2], -1)
  const depths = (radius: number): number[] =>
    Array.from({ length: segments }, (_, i) => {
      const a = (i * 2 * Math.PI) / segments
      const origin = localToWorld(c.pose, [radius * Math.cos(a), radius * Math.sin(a), 0])
      const hit = hitAt(origin, direction)
      if (!Number.isFinite(hit) || hit - gap < minimum || hit > 150)
        throw new Error(
          `The current chamber axis does not provide a complete supported rim over a continuous surface with at least ${minimum} mm wall height. For lateral access, preview a surface-aligned chamber, or adjust tilt and grid height. A smaller chamber may be needed if surface coverage is insufficient.`,
        )
      return hit - gap
    })
  const innerDepths = depths(c.innerRadius),
    outerDepths = depths(c.innerRadius + c.wallThickness)
  const original=[...innerDepths,...outerDepths]
  // Check the actual lower-rim triangles, including their chord edges and
  // interiors. Shorten the adjoining wall vertices to clear supported high
  // spots; a finite hit is still mandatory at every checked point.
  type Corner={profile:number[];index:number;radius:number}
  const corner=(profile:number[],index:number,radius:number):Corner=>({profile,index:index%segments,radius})
  for(let i=0;i<segments;i++){
    const inner=corner(innerDepths,i,c.innerRadius),innerNext=corner(innerDepths,i+1,c.innerRadius)
    const outer=corner(outerDepths,i,c.innerRadius+c.wallThickness),outerNext=corner(outerDepths,i+1,c.innerRadius+c.wallThickness)
    for(const triangle of [[outer,inner,outerNext],[outerNext,inner,innerNext]])for(const weights of [[.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]]){
      let x=0,y=0,depth=0
      for(let j=0;j<3;j++){const vertex=triangle[j],a=vertex.index*2*Math.PI/segments;x+=weights[j]*vertex.radius*Math.cos(a);y+=weights[j]*vertex.radius*Math.sin(a);depth+=weights[j]*vertex.profile[vertex.index]}
      const hit=hitAt(localToWorld(c.pose,[x,y,0]),direction)
      if(!Number.isFinite(hit))throw new Error('The mounting rim crosses an unsupported surface gap.')
      if(depth>hit-gap+.05){const correction=depth-(hit-gap);for(const vertex of triangle)vertex.profile[vertex.index]-=correction}
    }
  }
  if([...innerDepths,...outerDepths].some(d=>d<minimum))throw new Error(`The fitted wall would be shorter than ${minimum} mm. Increase the chamber grid height or adjust the pose.`)
  if(c.mounting==='cut'&&Math.max(...innerDepths,...outerDepths)>c.height+1e-6)throw new Error('This fit would require extending the stock cylinder. Adjust its height or choose an added pedestal / acrylic mount.')
  if((c.mounting==='pedestal'||c.mounting==='acrylic')&&Math.min(...innerDepths,...outerDepths)<c.height+.5-1e-6)throw new Error('The fixed cylinder intersects the surface or leaves less than 0.5 mm for its added mount. Raise it or adjust its angle.')
  return { source, assetIds, gap, innerDepths, outerDepths, maxAdditionalGap:Math.max(0,...original.map((d,i)=>d-(i<segments?innerDepths[i]:outerDepths[i-segments]))) }
}
export function chamberBaseEnd(c: Chamber): Vec3 {
  const depth = c.baseFit ? Math.max(...c.baseFit.innerDepths, ...c.baseFit.outerDepths) : c.height
  return add(c.pose.origin, scale(axes(c.pose)[2], -depth))
}

/** Closest point on a triangle, including its edges and vertices. */
export function closestTriangle(p: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = sub(b, a),
    ac = sub(c, a),
    ap = sub(p, a),
    d1 = dot(ab, ap),
    d2 = dot(ac, ap)
  if (d1 <= 0 && d2 <= 0) return a
  const bp = sub(p, b),
    d3 = dot(ab, bp),
    d4 = dot(ac, bp)
  if (d3 >= 0 && d4 <= d3) return b
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab, d1 / (d1 - d3)))
  const cp = sub(p, c),
    d5 = dot(ab, cp),
    d6 = dot(ac, cp)
  if (d6 >= 0 && d5 <= d6) return c
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, scale(ac, d2 / (d2 - d6)))
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0)
    return add(b, scale(sub(c, b), (d4 - d3) / (d4 - d3 + d5 - d6)))
  const den = 1 / (va + vb + vc)
  return add(a, add(scale(ab, vb * den), scale(ac, vc * den)))
}
/** Surface-normal mounting preview. Does not mutate the project or preserve a linked trajectory. */
export function alignChamberToSurface(c: Chamber, surfaces: TriangleSurface[]): Chamber {
  let best = Infinity,
    point: Vec3 | null = null,
    normal: Vec3 | null = null
  const min: Vec3 = [Infinity, Infinity, Infinity],
    max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const mesh of surfaces)
    for (let i = 0; i < mesh.pts.length; i += 3)
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], mesh.pts[i + a])
        max[a] = Math.max(max[a], mesh.pts[i + a])
      }
  for (const mesh of surfaces)
    for (let i = 0; i < mesh.tris.length; i += 3) {
      const vertex = (j: number): Vec3 => [mesh.pts[j * 3], mesh.pts[j * 3 + 1], mesh.pts[j * 3 + 2]]
      const a = vertex(mesh.tris[i]),
        b = vertex(mesh.tris[i + 1]),
        d = vertex(mesh.tris[i + 2]),
        n = cross(sub(b, a), sub(d, a))
      if (length(n) < 1e-10) continue
      const nearest = closestTriangle(c.pose.origin, a, b, d),
        distance = length(sub(nearest, c.pose.origin))
      if (distance < best) {
        best = distance
        point = nearest
        normal = normalize(n)
      }
    }
  if (!point || !normal)
    throw new Error('Load a usable skull or brain triangle surface before aligning the chamber.')
  const outside = c.pose.origin.some((v, i) => v < min[i] || v > max[i])
  const outward = outside
    ? sub(c.pose.origin, point)
    : sub(point, min.map((v, i) => (v + max[i]) / 2) as Vec3)
  if (dot(normal, outward) < 0) normal = scale(normal, -1)
  // Average the local patch rather than following one cortical triangle's tilt.
  let average: Vec3 = [0, 0, 0]
  const radius = c.innerRadius + c.wallThickness
  for (const mesh of surfaces)
    for (let i = 0; i < mesh.tris.length; i += 3) {
      const vertex = (j: number): Vec3 => [mesh.pts[j * 3], mesh.pts[j * 3 + 1], mesh.pts[j * 3 + 2]]
      const a = vertex(mesh.tris[i]),
        b = vertex(mesh.tris[i + 1]),
        d = vertex(mesh.tris[i + 2]),
        raw = cross(sub(b, a), sub(d, a)),
        area = length(raw)
      if (area < 1e-10) continue
      const distance = length(sub(closestTriangle(point, a, b, d), point))
      if (distance > radius) continue
      let n = scale(raw, 1 / area)
      if (dot(n, normal) < 0) n = scale(n, -1)
      if (dot(n, normal) > 0.25) average = add(average, scale(n, area / (1 + (distance / radius) ** 2)))
    }
  if (length(average) > 1e-8) normal = normalize(average)
  const origin = add(point, scale(normal, Math.max((c.minimumWallHeight ?? 2) + 0.5, c.height) + 0.5))
  const result = { ...c, pose: aimPose({ ...c.pose, origin }, point) }
  delete result.baseFit
  return result
}
