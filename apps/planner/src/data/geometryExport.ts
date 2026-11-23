import {electrodeAssembly} from '@brainana/planning-core/electrode-frame.ts'
import {connectorGeometry} from '../render/connectorGeometry.ts'
import {binarySTL} from './stl.ts'
export {binarySTL} from './stl.ts'
import {transformVertices} from '../render/meshTransform.ts'
import {targetRegionMesh} from '../render/targetRegion.ts'
import {headpostGeometry} from '../render/headpostGeometry.ts'
import {chamberBody,chamberSupport,mountingSummary} from '../render/mountGeometry.ts'
import {shaftDiameter} from '@brainana/planning-core/hardware.ts'
import {zipSync,strToU8} from 'fflate'
import type {Project,Vec3} from '@brainana/planning-core/model.ts'
import type {TriangleSurface} from '@brainana/planning-core/surface-fit.ts'
import {gridAxes,gridSeatHeight,gridCenterHeight,gridHoles,sub,electrodePaths,guideTubePath,trajectoryAxes,poseFromAxes} from '@brainana/planning-core/geometry.ts'
import {ring,cylinder,sphere,type MeshGeometry} from '../render/primitives.ts'
import {maskIsosurface} from '../render/maskIsosurface.ts'
import {coordinateCsv} from './export.ts'
export function printableGrid(c:Project['chambers'][number],g:Project['grids'][number]):MeshGeometry{
 if((g.minimumThickness??0)<=0)throw new Error('Set a positive thin-edge grid thickness before exporting its solid.')
 const radius=c.innerRadius,seat=gridSeatHeight(c,g),h=gridCenterHeight(c,g),theta=(g.tiltAngle??0)*Math.PI/180,phi=(g.tiltAzimuth??0)*Math.PI/180
 const step=Math.min(.2,(g.holeDiameter??.7)/5),lo:Vec3=[-radius-step,-radius-step,seat-step],hi:Vec3=[radius+step,radius+step,h+radius*Math.tan(theta)+step],dims=lo.map((v,k)=>Math.ceil((hi[k]-v)/step))
 if(dims.reduce((a,b)=>a*b,1)>32000000)throw new Error('Grid export exceeds 32 million samples. Reduce its size or tilt.')
 const mask=new Uint8Array(dims.reduce((a,b)=>a*b,1)),basis=gridAxes(g)
 const half=Math.floor(g.count/2),count=2*half+1,holes=new Uint8Array(count*count)
 for(const hole of gridHoles(c,g))holes[hole[0]+half+(hole[1]+half)*count]=1
 const rotation=(g.rotation??0)*Math.PI/180,cos=Math.cos(rotation),sin=Math.sin(rotation),tilt=Math.tan(theta),cosPhi=Math.cos(phi),sinPhi=Math.sin(phi),holeRadiusSquared=((g.holeDiameter??.7)/2)**2
 for(let z=0;z<dims[2];z++)for(let y=0;y<dims[1];y++)for(let x=0;x<dims[0];x++){
  const px=lo[0]+(x+.5)*step,py=lo[1]+(y+.5)*step,pz=lo[2]+(z+.5)*step
  if(px*px+py*py>radius*radius||pz<seat||pz>h+(px*cosPhi+py*sinPhi)*tilt)continue
  const faceU=px*basis[0][0]+py*basis[0][1]+(pz-h)*basis[0][2],faceV=px*basis[1][0]+py*basis[1][1]+(pz-h)*basis[1][2]
  const u=faceU*cos+faceV*sin,v=-faceU*sin+faceV*cos,ix=Math.round(u/g.spacing),iy=Math.round(v/g.spacing)
  if(ix>=-half&&ix<=half&&iy>=-half&&iy<=half&&holes[ix+half+(iy+half)*count]&&(u-ix*g.spacing)**2+(v-iy*g.spacing)**2<holeRadiusSquared)continue
  mask[x+y*dims[0]+z*dims[0]*dims[1]]=1
 }
 const mesh=maskIsosurface(mask,dims,lo,hi,step)
 return {pts:transformVertices(mesh.pts,c.pose),tris:mesh.tris}
}
export function geometryBundle(p:Project,surfaces:TriangleSurface[],progress:(label:string)=>void=()=>{}):Uint8Array{
 progress('Preparing dimensions and coordinates…')
 const files:Record<string,Uint8Array>={'coordinates.csv':strToU8(coordinateCsv(p)),'dimensions-and-coordinates.json':strToU8(JSON.stringify(p,null,2))},notes=['All coordinates and STL vertices use the project RAS frame in millimetres. STL itself has no unit field.','Chambers include fitted rim geometry. Grids include actual parallel bores, sampled at min(0.2 mm, bore diameter / 5); inspect dimensions in CAD.','Skull connector STLs are overall occupied envelopes, not fabrication designs. Electrodes and target markers are reference models. Skull exports preserve the finalized planning mesh and existing openings. These files do not include unmodelled fixations, tolerances, sterilization allowances or material validation.']
 for(const post of p.headposts??[]){progress('Writing headpost model…');files[`headpost-${encodeURIComponent(post.id)}.stl`]=binarySTL(headpostGeometry(post))}
 const name=(s:string)=>s.replace(/[^a-zA-Z0-9_-]/g,'_')
 for(const c of p.chambers){if(c.placementState==='unplaced'){notes.push(`${c.name}: not placed; chamber, grid, and mounted electrode coordinates/meshes omitted. Specifications are retained in JSON.`);continue}const mount=chamberSupport(c);if(mount)files[`mount-${encodeURIComponent(c.id)}.stl`]=binarySTL(mount);notes.push(`${c.name}: ${mountingSummary(c)}`);if(c.baseFit)files[`rim-measurements-${encodeURIComponent(c.id)}.csv`]=strToU8('angle_degrees,inner_wall_mm,outer_wall_mm,inner_support_mm,outer_support_mm,inner_removed_mm,outer_removed_mm\n'+c.baseFit.innerDepths.map((d,i)=>[i*360/64,d,c.baseFit!.outerDepths[i],Math.max(0,d-c.height),Math.max(0,c.baseFit!.outerDepths[i]-c.height),Math.max(0,c.height-d),Math.max(0,c.height-c.baseFit!.outerDepths[i])].join(',')).join('\n'));files[`chamber-${name(c.name)}-${encodeURIComponent(c.id)}.stl`]=binarySTL(chamberBody(c));for(const g of p.grids.filter(g=>g.chamberId===c.id&&g.enabled!==false)){try{progress('Building printable guide grid…');files[`grid-${encodeURIComponent(g.id)}.stl`]=binarySTL(printableGrid(c,g))}catch(error){notes.push(`Grid ${encodeURIComponent(g.id)}: ${String(error)}`)}}}
 surfaces.forEach((s,i)=>{progress(`Writing planning surface ${i+1} of ${surfaces.length}…`);files[`planning-surface-${i+1}.stl`]=binarySTL(s)})
 for(const target of p.targets){const region=targetRegionMesh(target);if(region)files[`valid-target-region-${encodeURIComponent(target.id)}.stl`]=binarySTL(region)}
 for(const t of p.targets)files[`target-${name(t.name)}-${encodeURIComponent(t.id)}.stl`]=binarySTL(sphere(t.point,t.displayRadiusMm??1))
 for(const e of p.electrodes){const {grid:g,chamber:c}=electrodeAssembly(p,e)!;if(e.direct?.unplaced||c.placementState==='unplaced')continue;electrodePaths(c,g,e,false).forEach((path,i)=>{if(Math.hypot(...sub(path.entry,path.tip))>0)files[`electrode-${name(e.name)}-${encodeURIComponent(e.id)}-${i+1}.stl`]=binarySTL(cylinder(path.entry,path.tip,shaftDiameter(e)/2))})}
 for(const e of p.electrodes){const {grid:g,chamber:c}=electrodeAssembly(p,e)!;if(c.placementState==='unplaced')continue;const tube=guideTubePath(c,g,e);if(tube&&e.guideTube){const direction=sub(tube.start,tube.end),length=Math.hypot(...direction);if(length>0)files[`guide-tube-${encodeURIComponent(e.id)}.stl`]=binarySTL(ring(poseFromAxes(tube.start,trajectoryAxes(direction)),e.guideTube.innerDiameter/2,e.guideTube.outerDiameter/2,length))}}
 for(const e of p.electrodes)if(e.connector&&!e.connector.unplaced)files[`connector-${encodeURIComponent(e.id)}.stl`]=binarySTL(connectorGeometry(e.connector))
 for(const r of p.avoidRegions??[])if(r.surfacePatch)files[`surface-region-${encodeURIComponent(r.id)}.stl`]=binarySTL(r.surfacePatch)
 files['README.txt']=strToU8(notes.join('\n\n'));progress('Packaging mesh files…');return zipSync(files,{level:1})
}
