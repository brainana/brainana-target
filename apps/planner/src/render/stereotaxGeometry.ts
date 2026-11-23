import { cross, localToWorld, normalize, poseFromAxes } from '@brainana/planning-core/geometry.ts'
import type { Stereotax, Vec3 } from '@brainana/planning-core/model.ts'
import { biteAdaptors, earBars, frameDimensions, singleRail, type EarBar } from '@brainana/planning-core/stereotax.ts'
import { armKinematics, armStageLimits } from '@brainana/planning-core/stereotaxSetup.ts'
import { blade, combine, cylinder, sphere, type MeshGeometry } from './primitives.ts'

/** The catalog publishes end profiles but not every transition or machining dimension. */
function earBarTip(bar: EarBar, x: number, side: number, span: number): { length: number; mesh: MeshGeometry } {
  const half = bar.width / 2
  const opening = bar.aperture ? bar.aperture / 2 : bar.cup ? half * .65 : 0
  const endRadius = bar.pin ? bar.pin / 2 : bar.radius ?? (opening ? half : half * .25)
  const shoulder = (bar.shoulder ?? 2 * endRadius) / 2
  const pinLength = bar.pinLength ?? 0
  const taperLength = bar.taper ? (half - shoulder) / Math.tan(bar.taper * Math.PI / 360) : half
  const roundLength=bar.radius&&!bar.aperture?bar.radius:0
  const nominal = bar.aperture ? span : Math.max(.01, taperLength + pinLength + roundLength)
  const length = Math.min(span, nominal)
  const factor = length / nominal
  const rounded=roundLength?Array.from({length:5},(_,i)=>{const angle=i*Math.PI/8;return {d:roundLength*(1-Math.cos(angle)),r:endRadius*Math.sin(angle)}}):[{d:0,r:endRadius,square:!!bar.aperture}]
  const sections: {d: number; r: number; square?: boolean}[] = [...rounded, ...(pinLength ? [{ d: pinLength, r: endRadius }, { d: pinLength, r: shoulder }] : []),
    { d: nominal, r: half, square: true }]
  if (opening) sections.push({ d: nominal, r: opening }, { d: bar.cup ? taperLength * .55 : 0, r: bar.cup ? 0 : opening }, { d: 0, r: opening })
  else sections.push({ d: nominal, r: 0 }, { d: 0, r: 0 })
  const pts: number[] = [], tris: number[] = [], n = 24
  sections.forEach(({d, r, square}) => {
    for (let i = 0; i < n; i++) {
      const angle = i * Math.PI * 2 / n
      const y = Math.cos(angle), z = Math.sin(angle)
      const radius = square ? r / Math.max(Math.abs(y), Math.abs(z)) : r
      pts.push(x + side * d * factor, radius * y, radius * z)
    }
  })
  sections.forEach((_, j) => {
    const k = (j + 1) % sections.length
    for (let i = 0; i < n; i++) {
      const q = (i + 1) % n
      const a = j*n+i, b = j*n+q, c = k*n+i, d = k*n+q
      tris.push(...(side > 0 ? [a,b,c,b,d,c] : [a,c,b,b,c,d]))
    }
  })
  return { length, mesh: { pts: new Float32Array(pts), tris: new Uint32Array(tris) } }
}

/** Plate around a circular mounting socket; the socket stays open through both faces. */
function socketPlate(width:number,length:number,cy:number,top:number,thickness:number,holeY:number):MeshGeometry {
 const pts:number[]=[],tris:number[]=[],n=64,r=19.05/2
 for(const z of [top,top-thickness])for(const inner of [false,true])for(let i=0;i<n;i++){
  const a=i*Math.PI*2/n,dx=Math.cos(a),dy=Math.sin(a)
  const tx=Math.abs(dx)<1e-9?Infinity:width/2/Math.abs(dx)
  const ty=Math.abs(dy)<1e-9?Infinity:((dy>0?cy+length/2:cy-length/2)-holeY)/dy
  const distance=inner?r:Math.min(tx,ty)
  pts.push(dx*distance,holeY+dy*distance,z)
 }
 for(let i=0;i<n;i++){
  const j=(i+1)%n
  for(const [a,b,c,d] of [[i,j,n+i,n+j],[2*n+j,2*n+i,3*n+j,3*n+i],[j,i,2*n+j,2*n+i],[n+i,n+j,3*n+i,3*n+j]])tris.push(a,b,c,b,d,c)
 }
 return {pts:new Float32Array(pts),tris:new Uint32Array(tris)}
}

export function anatomyCenter(
  meshes: readonly { extentsMin: number | number[]; extentsMax: number | number[] }[],
  fallback: [Vec3, Vec3],
): Vec3 {
  const valid = meshes.filter(m => Array.isArray(m.extentsMin) && Array.isArray(m.extentsMax)
    && m.extentsMin.slice(0, 3).every(Number.isFinite) && m.extentsMax.slice(0, 3).every(Number.isFinite)
    && m.extentsMin.length >= 3 && m.extentsMax.length >= 3)
  return [0, 1, 2].map(i => valid.length
    ? (Math.min(...valid.map(m => (m.extentsMin as number[])[i])) + Math.max(...valid.map(m => (m.extentsMax as number[])[i]))) / 2
    : (fallback[0][i] + fallback[1][i]) / 2) as Vec3
}

export function stereotaxGeometry(rig: Stereotax): MeshGeometry {
  return combine(stereotaxGeometryParts(rig).map(part => part.geometry))
}

export function stereotaxGeometryParts(rig: Stereotax): { geometry: MeshGeometry; kind: 'frame' | 'ears' | 'bite' | 'arms' | 'base' | 'scales' | 'controls' }[] {
  const { widthMm, lengthMm, spacingMm, posteriorMm, earBarWidthMm } = frameDimensions(rig)
  const z = -rig.railDropMm
  const front = lengthMm - posteriorMm
  const single = singleRail(rig.preset)
  const railX = rig.railLateralMm ?? 0
  const halfSpan = (single ? rig.earSupportSpanMm ?? spacingMm : spacingMm) / 2
  const across = (x0: number, x1: number, y: number, height: number, width: number) =>
    blade([x0, y, height], [x1, y, height], poseFromAxes([0, 0, 0], [[0, 1, 0], [0, 0, 1], [1, 0, 0]]), width, width, 0)
  const along = (x: number) =>
    blade([x, front, z], [x, -posteriorMm, z], poseFromAxes([0, 0, 0], [[1, 0, 0], [0, 0, 1], [0, -1, 0]]), widthMm, widthMm, 0)
  const vertical = (x: number, y: number, low: number, high: number, width: number) =>
    blade([x, y, low], [x, y, high], { origin: [0, 0, 0], angles: [0, 0, 0] }, width, width, 0)

  const parts = single ? [along(railX)] : [along(-halfSpan), along(halfSpan)]
  if (rig.preset !== 'custom' && !single) parts.push(across(-halfSpan, halfSpan, -posteriorMm + widthMm / 2, z, widthMm))
  const base: MeshGeometry[] = [], scales: MeshGeometry[] = [], controls: MeshGeometry[] = []
  const detailed = rig.showDetails !== false
  const box = (center:Vec3,size:Vec3) => blade([center[0],center[1],center[2]-size[2]/2],[center[0],center[1],center[2]+size[2]/2],{origin:[0,0,0],angles:[0,0,0]},size[0],size[1],0)
  const bars: MeshGeometry[] = []
  const bite: MeshGeometry[] = []
  const arms: MeshGeometry[] = []
  if (rig.showEarBars ?? rig.earTipSpacingMm > 0) {
    if (z !== 0 && !detailed) {
      for (const x of [-halfSpan, halfSpan]) parts.push(vertical(x, 0, Math.min(z, 0), Math.max(z, 0), widthMm))
    }
    if (single) parts.push(across(Math.min(-halfSpan, railX), Math.max(halfSpan, railX), 0, z, widthMm))
    const profile = earBars.find(bar => bar.id === rig.earBarId)
    const tip = rig.earTipSpacingMm / 2
    for (const side of [-1, 1]) {
      const offset = rig.earBlockOffsets?.[side < 0 ? 'left' : 'right'] ?? {apMm:0,heightMm:0}
      const tipX = side * tip + (rig.earTipCenterMm ?? 0)
      const span = Math.max(.01, halfSpan - side*tipX)
      const reach = Math.min(span,profile?.length??Infinity)
      const barWidth = profile?.length ? earBarWidthMm : profile?.width ?? earBarWidthMm
      const model = profile && earBarTip({ ...profile, width: barWidth },tipX,side,reach)
      const shaftEnd = tipX + side*(model?.length??0), end = tipX+side*reach
      const local:MeshGeometry[]=[]
      if(model)local.push(model.mesh)
      if(Math.abs(end-shaftEnd)>.001)local.push(across(Math.min(shaftEnd,end),Math.max(shaftEnd,end),0,0,barWidth))
      for(const mesh of local){for(let i=0;i<mesh.pts.length;i+=3){mesh.pts[i+1]+=offset.apMm;mesh.pts[i+2]+=offset.heightMm}bars.push(mesh)}
      const x=side*halfSpan
      parts.push(box([x,offset.apMm,offset.heightMm],[widthMm*1.3,widthMm*1.5,widthMm*1.3]))
      if(Math.abs(z-offset.heightMm)>.001)parts.push(vertical(x,offset.apMm,Math.min(z,offset.heightMm),Math.max(z,offset.heightMm),widthMm))
      if(detailed){
        controls.push(cylinder([x,offset.apMm,offset.heightMm+widthMm*.65],[x,offset.apMm,offset.heightMm+widthMm*.65+5],4,16))
        const shaftStart=(model?.length??0)+1
        for(let mm=0;mm<(profile?.scale??0)&&shaftStart+mm<reach-1;mm++){
          const px=tipX+side*(shaftStart+mm),length=mm%5===0?barWidth*.8:barWidth*.4
          scales.push(box([px,offset.apMm,offset.heightMm+barWidth/2+.04],[.12,length,.08]))
        }
      }
    }
  }
  if(rig.basePlate?.show){
    const plate=rig.basePlate,top=-plate.earHeightMm,cy=plate.lengthMm/2-plate.posteriorMm
    const socketY=-posteriorMm+widthMm/2
    const socket=plate.preset==='1211'&&Math.abs(socketY-cy)+19.05/2<plate.lengthMm/2&&plate.widthMm>19.05
    base.push(socket?socketPlate(plate.widthMm,plate.lengthMm,cy,top,plate.thicknessMm,socketY):box([0,cy,top-plate.thicknessMm/2],[plate.widthMm,plate.lengthMm,plate.thicknessMm]))
    if(socket)parts.push(cylinder([0,socketY,top-plate.thicknessMm-10],[0,socketY,z-widthMm/2],19.05/2,32))
    if(plate.preset==='900-E')base.push(cylinder([0,cy,top-plate.thicknessMm*2],[0,cy,top-plate.thicknessMm],Math.min(plate.widthMm,plate.lengthMm)*.35,48))
    if(!socket)for(const x of single?[railX]:[-halfSpan,halfSpan])for(const y of single?[-posteriorMm*.7,front*.7]:[-posteriorMm*.7,front*.7]){
      const railBottom=z-widthMm/2
      if(top<railBottom)parts.push(vertical(x,y,top,railBottom,widthMm))
    }
  }
  if(detailed){
    for(const x of single?[railX]:[-halfSpan,halfSpan])for(let y=Math.max(-100,-posteriorMm+2);y<=Math.min(100,front-2);y++)
      scales.push(box([x,y,z+widthMm/2+.04],[y%10===0?widthMm*.8:widthMm*.35,.15,.08]))
  }

  if (rig.biteBar) {
    const { adaptorId, lateralMm: x, apMm, heightMm, lengthMm, widthMm, thicknessMm } = rig.biteBar
    const y=apMm+(rig.biteBar.apOffsetMm??0)
    const kind = biteAdaptors.find(adaptor => adaptor.id === adaptorId)?.kind
    const forward = y + lengthMm
    const width = kind === 'molar' ? widthMm / 3 : widthMm
    for (const dx of kind === 'molar' ? [-width, width] : [0]) {
      bite.push(blade([x + dx, y, heightMm], [x + dx, forward, heightMm],
        poseFromAxes([0, 0, 0], [[1, 0, 0], [0, 0, -1], [0, 1, 0]]), width, thicknessMm, 0))
    }
    if(detailed){
      if(Math.abs(z-heightMm)>.001)bite.push(vertical(x,y,Math.min(z,heightMm),Math.max(z,heightMm),Math.max(2,widthMm*.5)))
      controls.push(cylinder([x,y,heightMm+thicknessMm],[x,y,heightMm+thicknessMm+4],Math.max(2,widthMm*.35),16))
    }
    if (kind === 'palate' || kind === 'inverted') {
      const direction = kind === 'inverted' ? -1 : 1
      bite.push(cylinder([x, y, heightMm], [x, y, heightMm + direction * thicknessMm], widthMm / 2))
    } else if (kind === 'tooth') {
      bite.push(cylinder([x, y, heightMm - thicknessMm / 2], [x, y, heightMm + thicknessMm / 2], widthMm / 4))
    }
  }
  // Published travel determines slide spans; casing and knobs are schematic measured overrides.
  for (const arm of rig.arms) {
    const {anchor,joint,stageAxes,xCarriage,yCarriage,holder,tip,move}=armKinematics(rig,arm)
    const x=anchor[0],post=arm.postWidthMm??10,width=arm.linkWidthMm??8,travel=armStageLimits(arm)
    arms.push(vertical(x,arm.apMm,z,anchor[2],post))
    if(arm.reachMm>0){
      const direction=normalize(joint.map((v,i)=>v-anchor[i]) as Vec3)
      const lateral:Vec3=[-direction[1],direction[0],0]
      const u=Math.hypot(lateral[0],lateral[1])>.001?normalize(lateral):[1,0,0] as Vec3
      arms.push(blade(anchor,joint,poseFromAxes([0,0,0],[u,normalize(cross(direction,u)),direction]),width,width,0))
    }
    const orientedBox=(p:Vec3,size:Vec3)=>blade(move(p,stageAxes[2],-size[2]/2),move(p,stageAxes[2],size[2]/2),poseFromAxes([0,0,0],stageAxes),size[0],size[1],0)
    const slide=(center:Vec3,axis:Vec3,length:number)=>{
      if(length>0)arms.push(cylinder(move(center,axis,-length/2),move(center,axis,length/2),width*.22,12))
    }
    arms.push(sphere(joint,width*.8,16,8),orientedBox(xCarriage,[width*1.5,width*2,width]),orientedBox(yCarriage,[width*2,width*1.5,width]))
    slide(joint,stageAxes[0],travel[0]);slide(xCarriage,stageAxes[1],travel[1]);slide(yCarriage,stageAxes[2],travel[2])
    arms.push(orientedBox(holder,[width*1.5,width*1.5,width*1.4]))
    if((arm.holderLengthMm??20)>0)arms.push(cylinder(holder,tip,(arm.holderDiameterMm??4)/2,20))
    if(detailed){
      for(const [i,center] of [joint,xCarriage,yCarriage].entries())if(travel[i]>0){
        const end=move(center,stageAxes[i],travel[i]/2)
        controls.push(cylinder(end,move(end,stageAxes[i],5),width*.65,20))
        for(let distance=-travel[i]/2;distance<=travel[i]/2;distance+=5){
          const p=move(center,stageAxes[i],distance)
          scales.push(orientedBox(move(p,stageAxes[2],width*.25),[.18,width*.6,.12]))
        }
      }
      controls.push(cylinder(move(holder,stageAxes[0],width*.7),move(holder,stageAxes[0],width*1.2),width*.35,16))
    }
  }

  return [parts, bars, bite, arms, base, scales, controls].flatMap((group, index) => {
    if (!group.length) return []
    const geometry = combine(group)
    for (let i = 0; i < geometry.pts.length; i += 3) {
      const point: Vec3 = [geometry.pts[i], geometry.pts[i + 1], geometry.pts[i + 2]]
      geometry.pts.set(localToWorld(rig.pose, point), i)
    }
    return [{ geometry, kind: (['frame', 'ears', 'bite', 'arms', 'base', 'scales', 'controls'] as const)[index] }]
  })
}
