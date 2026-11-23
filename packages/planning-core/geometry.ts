import {chamberWall,segmentTriangleDistance,insideWall} from './wall-mesh.ts'
import {
  gridCompatibility,
  shankOffsets,
  shankLength,
  shaftDiameter,
  shankDepth,
  localSites,
  minimumInsertion,
  maximumInsertion,
  hardwareFitsBore,
} from './hardware.ts'
import type { Chamber, Electrode, Grid, Pose, Vec3 } from './model.ts'
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const length = (a: Vec3): number => Math.hypot(...a)
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export function normalize(a: Vec3): Vec3 {
  const l = length(a)
  if (l < 1e-10) throw new Error('Zero-length direction')
  return scale(a, 1 / l)
}
const rad = (n: number): number => (n * Math.PI) / 180
/** Rz * Ry * Rx; columns are chamber-local axes expressed in project RAS. */
export function axes(pose: Pose): [Vec3, Vec3, Vec3] {
  const [x, y, z] = pose.angles.map(rad)
  const cx = Math.cos(x),
    sx = Math.sin(x),
    cy = Math.cos(y),
    sy = Math.sin(y),
    cz = Math.cos(z),
    sz = Math.sin(z)
  return [
    [cz * cy, sz * cy, -sy],
    [cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx],
    [cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx],
  ]
}
export function localToWorld(pose: Pose, p: Vec3): Vec3 {
  const [u, v, w] = axes(pose)
  return add(pose.origin, add(scale(u, p[0]), add(scale(v, p[1]), scale(w, p[2]))))
}
export function worldToLocal(pose: Pose, p: Vec3): Vec3 {
  const d = sub(p, pose.origin)
  const a = axes(pose)
  return [dot(d, a[0]), dot(d, a[1]), dot(d, a[2])]
}
/** Grid basis expressed in chamber coordinates; lattice rotation remains independent. */
export function gridAxes(grid:Grid):[Vec3,Vec3,Vec3]{
 const t=rad(grid.enabled===false?0:grid.tiltAngle??0),p=rad(grid.tiltAzimuth??0),c=Math.cos(t),s=Math.sin(t),a=Math.cos(p),b=Math.sin(p)
 return [[c*a*a+b*b,(c-1)*a*b,s*a],[(c-1)*a*b,c*b*b+a*a,s*b],[-s*a,-s*b,c]]
}
export function gridVector(grid:Grid,p:Vec3):Vec3{const [u,v,w]=gridAxes(grid);return add(scale(u,p[0]),add(scale(v,p[1]),scale(w,p[2])))}
/** Seat an insert with its highest top edge flush with the chamber lip. */
export function seatedGridHeight(chamber:Chamber,grid:Grid):number{return -(grid.minimumThickness??0)-2*chamber.innerRadius*Math.tan(rad(grid.tiltAngle??0))}
export function gridSeatHeight(chamber:Chamber,grid:Grid):number{return grid.seating==='manual'?(grid.seatHeight??0):seatedGridHeight(chamber,grid)}
/** A physical insert must fit below the lip and above every fitted lower rim point. */
export function gridFitsChamber(chamber:Chamber,grid:Grid):boolean{
 if(grid.enabled===false)return true
 const seat=gridSeatHeight(chamber,grid),top=gridCenterHeight(chamber,grid)+chamber.innerRadius*Math.tan(rad(grid.tiltAngle??0))
 const wall=chamber.baseFit?Math.min(...chamber.baseFit.innerDepths):chamber.height
 return top<=1e-7&&seat>=-wall-1e-7
}
export function gridCenterHeight(chamber:Chamber,grid:Grid):number{return grid.enabled===false?0:gridSeatHeight(chamber,grid)+(grid.minimumThickness??0)+chamber.innerRadius*Math.tan(rad(grid.tiltAngle??0))}
export function holeLocal(grid: Grid, hole: [number, number], chamber?:Chamber): Vec3 {
  if(grid.tiltAngle&&grid.enabled!==false&&!chamber)throw new Error('Angled grid hole coordinates require chamber dimensions.')
  const a = rad(grid.rotation),x = hole[0] * grid.spacing,y = hole[1] * grid.spacing
  const point=gridVector(grid,[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a),0])
  point[2]+=chamber?gridCenterHeight(chamber,grid):(grid.seatHeight??0)+(grid.minimumThickness??0)
  return point
}
export function gridWorldVector(chamber:Chamber,grid:Grid,p:Vec3):Vec3{return sub(localToWorld(chamber.pose,gridVector(grid,p)),chamber.pose.origin)}
/** A rigid pose with its −Z aligned to the guide channels; for rendering and source-compatible exports. */
export function poseFromAxes(origin:Vec3,basis:[Vec3,Vec3,Vec3]):Pose{
 const [u,v,w]=basis,y=Math.asin(Math.max(-1,Math.min(1,-u[2])))
 const x=Math.abs(Math.cos(y))>1e-8?Math.atan2(v[2],w[2]):Math.atan2(-w[1],v[1])
 const z=Math.abs(Math.cos(y))>1e-8?Math.atan2(u[1],u[0]):0
 return {origin:[...origin],angles:[x,y,z].map(a=>a*180/Math.PI) as Vec3}
}
export function gridPose(chamber:Chamber,grid:Grid):Pose{return poseFromAxes(localToWorld(chamber.pose,[0,0,gridCenterHeight(chamber,grid)]),gridAxes(grid).map(v=>sub(localToWorld(chamber.pose,v),chamber.pose.origin)) as [Vec3,Vec3,Vec3])}
/** Aim the grid channels, preserving the grid's independent orientation relative to the chamber. */
export function aimGridPose(pose:Pose,grid:Grid,target:Vec3):Pose{
 if(!grid.tiltAngle||grid.enabled===false)return aimPose(pose,target)
 const desired=axes(aimPose(pose,target)),relative=gridAxes(grid)
 const basis=[0,1,2].map(k=>add(scale(desired[0],relative[0][k]),add(scale(desired[1],relative[1][k]),scale(desired[2],relative[2][k])))) as [Vec3,Vec3,Vec3]
 return poseFromAxes(pose.origin,basis)
}
/** Minimum capsule-to-wall distance. An angled grid remains usable when other holes fail this check. */
export function gridHoleClearance(chamber:Chamber,grid:Grid,e:Electrode,hole:[number,number],depth?:number):number{
 if(!gridCompatibility(e).available)grid={...grid,enabled:false}
 if(!gridCompatibility(e).available||grid.enabled===false)return hardwareFitsBore(e,holeLocal(grid,hole,chamber),chamber.innerRadius)?Infinity:-Infinity
 if(grid.holeDiameter!==undefined&&Math.max(shaftDiameter(e),e.guideTube?.outerDiameter??0)>grid.holeDiameter+1e-8)return (grid.holeDiameter-Math.max(shaftDiameter(e),e.guideTube?.outerDiameter??0))/2
 if(!grid.tiltAngle){
  const entry=holeLocal(grid,hole,chamber)
  const edge=chamber.innerRadius-Math.hypot(entry[0],entry[1])-(grid.holeDiameter??0)/2
  if(edge<-1e-8)return edge
  return hardwareFitsBore(e,entry,chamber.innerRadius)?Infinity:-Infinity
 }
 const base=holeLocal(grid,hole,chamber),direction=scale(gridAxes(grid)[2],-1),wall=chamberWall(chamber),maxWall=chamber.baseFit?Math.max(...chamber.baseFit.innerDepths,...chamber.baseFit.outerDepths):chamber.height
 let clearance=Infinity
 const channelExit=add(base,scale(direction,(gridSeatHeight(chamber,grid)-base[2])/direction[2]))
 const channelRadius=(grid.holeDiameter??Math.max(shaftDiameter(e),e.guideTube?.outerDiameter??0))/2/(-direction[2])
 const channelGap=chamber.innerRadius-Math.max(Math.hypot(base[0],base[1]),Math.hypot(channelExit[0],channelExit[1]))-channelRadius
 if(channelGap<-1e-8)return channelGap
 for(const [i,offset] of shankOffsets(e).entries()){
  const entry=add(base,gridVector(grid,offset)),insertion=depth??e.depth,otherDepth=insertion+shankDepth(e,i)-e.depth
  const endDepth=depth===undefined?Math.max(otherDepth,(entry[2]+maxWall)/(-direction[2])):otherDepth
  const ranges:Array<{start:Vec3;end:Vec3;radius:number}>=[{start:add(entry,scale(direction,-Math.max(0,shankLength(e,i)-otherDepth))),end:add(entry,scale(direction,endDepth)),radius:shaftDiameter(e)/2}]
  if(e.guideTube)ranges.push({start:add(entry,scale(direction,e.guideTube.tipDepth-e.guideTube.length)),end:add(entry,scale(direction,e.guideTube.tipDepth)),radius:e.guideTube.outerDiameter/2})
  for(const original of ranges){
   const delta=sub(original.end,original.start)
   let lo=0,hi=1
   if(Math.abs(delta[2])>1e-12){const a=(-maxWall-original.radius-original.start[2])/delta[2],b=(original.radius-original.start[2])/delta[2];lo=Math.max(0,Math.min(a,b));hi=Math.min(1,Math.max(a,b));if(lo>hi)continue}
   else if(original.start[2]>original.radius||original.start[2]<-maxWall-original.radius)continue
   const path={...original,start:add(original.start,scale(delta,lo)),end:add(original.start,scale(delta,hi))}
   const maxRadius=Math.max(Math.hypot(path.start[0],path.start[1]),Math.hypot(path.end[0],path.end[1]))
   if(maxRadius+path.radius<chamber.innerRadius*Math.cos(Math.PI/64)){clearance=Math.min(clearance,chamber.innerRadius*Math.cos(Math.PI/64)-maxRadius-path.radius);continue}
   if([path.start,path.end].some(p=>Math.hypot(p[0],p[1])>=chamber.innerRadius*Math.cos(Math.PI/64)&&p[2]<=0&&p[2]>=-maxWall&&insideWall(p,wall)))return -path.radius
   for(const face of wall){clearance=Math.min(clearance,segmentTriangleDistance(path.start,path.end,...face)-path.radius);if(clearance<-1e-8)return clearance}
  }
 }
 return clearance
}
export function gridHoles(chamber: Chamber, grid: Grid): Array<[number, number]> {
  if (grid.enabled === false) return [[0, 0]]
  const n = Math.floor(grid.count / 2),
    holes: Array<[number, number]> = []
  for (let y = -n; y <= n; y++)
    for (let x = -n; x <= n; x++)
      if (Math.hypot(...holeLocal(grid,[x,y],chamber).slice(0,2)) <= chamber.innerRadius + 1e-8) holes.push([x, y])
  return holes
}
export interface Trajectory {
  entry: Vec3
  tip: Vec3
  direction: Vec3
  contacts: Vec3[]
}
export function electrodePaths(
  chamber: Chamber,
  grid: Grid,
  electrode: Electrode,
  includeSites = true,
): Trajectory[] {
  grid=gridCompatibility(electrode).available?grid:{...grid,enabled:false}
  const base = holeLocal(grid, electrode.hole,chamber),
    direction = gridWorldVector(chamber,grid,[0,0,-1])
  return shankOffsets(electrode).map((offset, i) => {
    const entry = localToWorld(chamber.pose, add(base, gridVector(grid,offset)))
    return {
      entry,
      tip: add(entry, scale(direction, shankDepth(electrode, i))),
      direction,
      contacts: includeSites
        ? localSites(electrode, i).map((p) => localToWorld(chamber.pose, add(base, gridVector(grid,p))))
        : [],
    }
  })
}
export function trajectory(chamber: Chamber, grid: Grid, electrode: Electrode): Trajectory {
  return electrodePaths(chamber, grid, electrode)[electrode.hardware?.selectedShank ?? 0]
}
export function targetApproach(
  chamber: Chamber,
  grid: Grid,
  hole: [number, number],
  target: Vec3,
  electrode?: Electrode,
): { depth: number; miss: number } {
  if(electrode&&!gridCompatibility(electrode).available)grid={...grid,enabled:false}
  const local=worldToLocal(chamber.pose,target),entry=add(holeLocal(grid,hole,chamber),gridVector(grid,electrode?shankOffsets(electrode)[electrode.hardware?.selectedShank??0]:[0,0,0])),delta=sub(local,entry),direction=scale(gridAxes(grid)[2],-1),depth=dot(delta,direction)
  return {depth,miss:length(sub(delta,scale(direction,depth)))}
}
export function closestHole(
  chamber: Chamber,
  grid: Grid,
  target: Vec3,
  electrode?: Electrode,
): { hole: [number, number]; depth: number; miss: number } | null {
  let best: ReturnType<typeof closestHole> = null
  for (const hole of electrode && !gridCompatibility(electrode).available
    ? [electrode.hole]
    : gridHoles(chamber, grid)) {
    const a = targetApproach(chamber, grid, hole, target, electrode)
    if(electrode&&gridHoleClearance(chamber,grid,electrode,hole,a.depth)<-1e-8)continue
    if (!best || a.miss < best.miss) best = { hole, ...a }
  }
  return best
}
/** Stable right-handed orthonormal frame, independent of camera orientation. */
export function trajectoryAxes(direction: Vec3): [Vec3, Vec3, Vec3] {
  const w = normalize(direction),
    seed: Vec3 = Math.abs(w[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1]
  const u = normalize(cross(seed, w)),
    v = cross(w, u)
  return [u, v, w]
}
export function translatePose(pose: Pose, delta: Vec3): Pose {
  return { ...pose, origin: add(pose.origin, delta) }
}

/** Aim local −Z from the fixed grid origin toward a target, retaining Z rotation. */
export function aimPose(pose: Pose, target: Vec3): Pose {
  const w = normalize(sub(pose.origin, target))
  const z = rad(pose.angles[2])
  const a = Math.cos(z) * w[0] + Math.sin(z) * w[1]
  const b = -Math.sin(z) * w[0] + Math.cos(z) * w[1]
  return {
    origin: [...pose.origin],
    angles: [
      (Math.atan2(-b, Math.hypot(a, w[2])) * 180) / Math.PI,
      (Math.atan2(a, w[2]) * 180) / Math.PI,
      pose.angles[2],
    ],
  }
}
/** Compute a complete fit before any caller commits changes. */
export function fitElectrode(
  chamber: Chamber,
  grid: Grid,
  electrode: Electrode,
  target: Vec3,
): {
  hole: [number, number]
  depth: number
  miss: number
} {
  const best = closestHole(chamber, grid, target, electrode)
  if (!best) throw new Error('This grid has no available holes.')
  const minimum = minimumInsertion(electrode)
  if (best.depth < minimum)
    throw new Error(
      'Target is behind the grid plane or too shallow for the contacts. Move or aim the chamber first.',
    )
  if (best.depth > maximumInsertion(electrode))
    throw new Error(
      'Target exceeds the usable electrode length. Move the chamber closer or change the electrode specification.',
    )
  return best
}

export function guideTubePath(c: Chamber, g: Grid, e: Electrode): { start: Vec3; end: Vec3 } | null {
  if (!e.guideTube) return null
  const path = trajectory(c, g, e),
    tube = e.guideTube
  return {
    start: add(path.entry, scale(path.direction, tube.tipDepth - tube.length)),
    end: add(path.entry, scale(path.direction, tube.tipDepth)),
  }
}
